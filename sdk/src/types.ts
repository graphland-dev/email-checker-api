export const VERDICTS = ["deliverable", "undeliverable", "disposable", "invalid", "unknown"] as const;

export type Verdict = (typeof VERDICTS)[number];

export type MxRecord = {
	exchange: string;
	priority: number;
};

type Checks<T extends { syntax: boolean; disposable: boolean; disposable_match: string | null; accepts_mail: boolean | null }> =
	T & { mx: MxRecord[] };

type Base<V extends Verdict> = {
	/** The email exactly as submitted. */
	email: string;
	verdict: V;
	/** Human-readable explanation of the verdict. */
	reason: string;
};

/** Email is not syntactically valid. No DNS lookup was performed. */
export type InvalidResult = Base<"invalid"> & {
	normalized: null;
	domain: null;
	checks: Checks<{ syntax: false; disposable: false; disposable_match: null; accepts_mail: null }>;
};

/** Domain (or one of its MX hosts) is a known temporary email provider. */
export type DisposableResult = Base<"disposable"> & {
	normalized: string;
	domain: string;
	checks: Checks<{
		syntax: true;
		disposable: true;
		/** Blocklist entry that matched, either the email domain or one of its MX hosts. */
		disposable_match: string;
		/** null when the domain matched the blocklist directly and DNS was skipped. */
		accepts_mail: true | null;
	}>;
};

/** Domain is configured to receive mail. The individual mailbox is not verified. */
export type DeliverableResult = Base<"deliverable"> & {
	normalized: string;
	domain: string;
	checks: Checks<{ syntax: true; disposable: false; disposable_match: null; accepts_mail: true }>;
};

/** Domain does not exist, publishes a null MX, or has no mail/address records. */
export type UndeliverableResult = Base<"undeliverable"> & {
	normalized: string;
	domain: string;
	checks: Checks<{ syntax: true; disposable: false; disposable_match: null; accepts_mail: false }>;
};

/** DNS lookup failed; retrying later may succeed. */
export type UnknownResult = Base<"unknown"> & {
	normalized: string;
	domain: string;
	checks: Checks<{ syntax: true; disposable: false; disposable_match: null; accepts_mail: null }>;
};

/** Discriminated on `verdict` — narrow with `switch (result.verdict)`. */
export type EmailCheckResult =
	| InvalidResult
	| DisposableResult
	| DeliverableResult
	| UndeliverableResult
	| UnknownResult;

export type EmailCheckResultFor<V extends Verdict> = Extract<EmailCheckResult, { verdict: V }>;

export type CheckRequestBody = { email: string };

export type HealthResponse = { ok: true };

export type ApiErrorBody = { error: string };
