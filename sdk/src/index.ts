export { DEFAULT_BASE_URL, EmailChecker } from "./client.js";
export type { EmailCheckerOptions, RequestOptions } from "./client.js";
export { EmailCheckerError, isEmailCheckerError } from "./errors.js";
export type { EmailCheckerErrorCode } from "./errors.js";
export { VERDICTS } from "./types.js";
export type {
	ApiErrorBody,
	CheckRequestBody,
	DeliverableResult,
	DisposableResult,
	EmailCheckResult,
	EmailCheckResultFor,
	HealthResponse,
	InvalidResult,
	MxRecord,
	UndeliverableResult,
	UnknownResult,
	Verdict,
} from "./types.js";
