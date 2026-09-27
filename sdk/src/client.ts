import { EmailCheckerError } from './errors.js';
import { VERDICTS, type ApiErrorBody, type CheckRequestBody, type EmailCheckResult, type HealthResponse } from './types.js';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type EmailCheckerOptions = {
	/** Base URL of the deployed worker, e.g. `https://email-checker.example.workers.dev`. */
	baseUrl: string;
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

export type EmailChecker = {
	/** Checks syntax, temporary-email providers, and whether the domain accepts mail. */
	check(email: string, options?: RequestOptions): Promise<EmailCheckResult>;
	health(options?: RequestOptions): Promise<HealthResponse>;
};

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

function isApiErrorBody(value: unknown): value is ApiErrorBody {
	return isRecord(value) && typeof value.error === 'string';
}

export function createEmailChecker(options: EmailCheckerOptions): EmailChecker {
	const baseUrl = options.baseUrl.replace(/\/+$/, '');
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

	async function request<T>(
		path: string,
		init: RequestInit,
		guard: (value: unknown) => value is T,
		{ signal }: RequestOptions = {},
	): Promise<T> {
		const signals = [signal, timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined].filter((s): s is AbortSignal => s !== undefined);

		let res: Response;
		try {
			res = await fetchImpl(`${baseUrl}${path}`, {
				...init,
				headers: { accept: 'application/json', ...options.headers, ...init.headers },
				signal: signals.length > 0 ? AbortSignal.any(signals) : null,
			});
		} catch (err) {
			if (signal?.aborted) throw new EmailCheckerError('aborted', 'Request was aborted.', { cause: err });
			if (err instanceof DOMException && err.name === 'TimeoutError') {
				throw new EmailCheckerError('timeout', `Request timed out after ${timeoutMs}ms.`, { cause: err });
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

	return {
		check(email, requestOptions) {
			const payload: CheckRequestBody = { email };
			return request(
				'/v1/check',
				{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
				isEmailCheckResult,
				requestOptions,
			);
		},
		health(requestOptions) {
			return request(
				'/health',
				{ method: 'GET' },
				(value): value is HealthResponse => isRecord(value) && value.ok === true,
				requestOptions,
			);
		},
	};
}
