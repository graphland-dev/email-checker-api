export type EmailCheckerErrorCode =
	/** Server returned a non-2xx response. */
	| "http_error"
	/** Server returned 429. See `retryAfterSeconds`. */
	| "rate_limited"
	/** Request could not reach the server. */
	| "network_error"
	/** Request exceeded `timeoutMs`. */
	| "timeout"
	/** Request was aborted via the caller's `signal`. */
	| "aborted"
	/** Server responded with a body that does not match the API contract. */
	| "invalid_response";

export class EmailCheckerError extends Error {
	override readonly name = "EmailCheckerError";
	readonly code: EmailCheckerErrorCode;
	/** HTTP status, present for `http_error`, `rate_limited` and `invalid_response`. */
	readonly status: number | undefined;
	/** Seconds until the rate limit window resets, present for `rate_limited`. */
	readonly retryAfterSeconds: number | undefined;

	constructor(
		code: EmailCheckerErrorCode,
		message: string,
		options: { status?: number; retryAfterSeconds?: number; cause?: unknown } = {},
	) {
		super(message, { cause: options.cause });
		this.code = code;
		this.status = options.status;
		this.retryAfterSeconds = options.retryAfterSeconds;
	}
}

export function isEmailCheckerError(err: unknown): err is EmailCheckerError {
	return err instanceof EmailCheckerError;
}
