import { EmailCheckerError } from './errors.js';
import { VERDICTS, type ApiErrorBody, type CheckRequestBody, type EmailCheckResult, type HealthResponse } from './types.js';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type EmailCheckerOptions = {
	/** Base URL of the worker. Defaults to `DEFAULT_BASE_URL`. */
	baseUrl?: string;
	/** Per-request timeout in milliseconds. Defaults to 10000. Set to 0 to disable. */
	timeoutMs?: number;
	/** Extra headers sent with every request (e.g. auth). */
	headers?: Record<string, string>;
	/** Custom fetch implementation. Defaults to the global `fetch`. */
	fetch?: FetchLike;
};

export type RequestOptions = {
	signal?: AbortSignal;
};

export const DEFAULT_BASE_URL = 'https://email-checker.graphland-dev.workers.dev';
const DEFAULT_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isEmailCheckResult(value: unknown): value is EmailCheckResult {
	return (
		isRecord(value) &&
		typeof value.email === 'string' &&
		typeof value.reason === 'string' &&
		(VERDICTS as readonly unknown[]).includes(value.verdict) &&
		isRecord(value.checks) &&
		Array.isArray(value.checks.mx)
	);
}

function isHealthResponse(value: unknown): value is HealthResponse {
	return isRecord(value) && value.ok === true;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
	return isRecord(value) && typeof value.error === 'string';
}

export class EmailChecker {
	readonly baseUrl: string;
	readonly timeoutMs: number;
	readonly #headers: Record<string, string>;
	readonly #fetch: FetchLike;

	constructor(options: EmailCheckerOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.#headers = options.headers ?? {};
		this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	}

	/** Checks syntax, temporary-email providers, and whether the domain accepts mail. */
	check(email: string, options?: RequestOptions): Promise<EmailCheckResult> {
		const payload: CheckRequestBody = { email };
		return this.#request(
			'/v1/check',
			{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
			isEmailCheckResult,
			options,
		);
	}

	health(options?: RequestOptions): Promise<HealthResponse> {
		return this.#request('/health', { method: 'GET' }, isHealthResponse, options);
	}

	async #request<T>(path: string, init: RequestInit, guard: (value: unknown) => value is T, { signal }: RequestOptions = {}): Promise<T> {
		const signals = [signal, this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined].filter(
			(s): s is AbortSignal => s !== undefined,
		);

		let res: Response;
		try {
			res = await this.#fetch(`${this.baseUrl}${path}`, {
				...init,
				headers: { accept: 'application/json', ...this.#headers, ...init.headers },
				signal: signals.length > 0 ? AbortSignal.any(signals) : null,
			});
		} catch (err) {
			if (signal?.aborted) throw new EmailCheckerError('aborted', 'Request was aborted.', { cause: err });
			if (err instanceof DOMException && err.name === 'TimeoutError') {
				throw new EmailCheckerError('timeout', `Request timed out after ${this.timeoutMs}ms.`, { cause: err });
			}
			throw new EmailCheckerError('network_error', `Request failed: ${(err as Error).message}`, { cause: err });
		}

		const body: unknown = await res.json().catch(() => undefined);

		if (!res.ok) {
			const message = isApiErrorBody(body) ? body.error : `HTTP ${res.status}`;
			if (res.status === 429) {
				const retryAfter = Number(res.headers.get('retry-after'));
				throw new EmailCheckerError('rate_limited', message, {
					status: res.status,
					...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
				});
			}
			throw new EmailCheckerError('http_error', message, { status: res.status });
		}
		if (!guard(body)) {
			throw new EmailCheckerError('invalid_response', 'Response does not match the API contract.', {
				status: res.status,
			});
		}
		return body;
	}
}
