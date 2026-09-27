import type { EmailCheckResult } from "../sdk/src/types";
import { matchDisposableDomain } from "./disposable";
import { resolveMailDns } from "./dns";
import { parseEmail } from "./syntax";

export async function checkEmail(email: string): Promise<EmailCheckResult> {
	const parsed = parseEmail(email);
	if (!parsed) {
		return {
			email,
			normalized: null,
			domain: null,
			verdict: "invalid",
			reason: "Email address is not syntactically valid.",
			checks: { syntax: false, disposable: false, disposable_match: null, accepts_mail: null, mx: [] },
		};
	}

	const { normalized, domain } = parsed;
	const base = { email, normalized, domain };

	const domainMatch = matchDisposableDomain(domain);
	if (domainMatch) {
		return {
			...base,
			verdict: "disposable",
			reason: `Domain is a known temporary email provider (${domainMatch}).`,
			checks: { syntax: true, disposable: true, disposable_match: domainMatch, accepts_mail: null, mx: [] },
		};
	}

	const dns = await resolveMailDns(domain);
	const clean = { syntax: true, disposable: false, disposable_match: null } as const;

	switch (dns.status) {
		case "mx": {
			const mx = dns.records;
			const mxMatch = mx.map((r) => matchDisposableDomain(r.exchange)).find((m) => m !== null) ?? null;
			if (mxMatch) {
				return {
					...base,
					verdict: "disposable",
					reason: `Domain routes mail to a known temporary email provider (${mxMatch}).`,
					checks: { syntax: true, disposable: true, disposable_match: mxMatch, accepts_mail: true, mx },
				};
			}
			return {
				...base,
				verdict: "deliverable",
				reason: "Domain has MX records and accepts mail.",
				checks: { ...clean, accepts_mail: true, mx },
			};
		}
		case "implicit_mx":
			return {
				...base,
				verdict: "deliverable",
				reason: "Domain has no MX records but resolves to a host that may accept mail.",
				checks: { ...clean, accepts_mail: true, mx: [] },
			};
		case "nxdomain":
			return {
				...base,
				verdict: "undeliverable",
				reason: "Domain does not exist.",
				checks: { ...clean, accepts_mail: false, mx: [] },
			};
		case "null_mx":
			return {
				...base,
				verdict: "undeliverable",
				reason: "Domain explicitly does not accept mail (null MX).",
				checks: { ...clean, accepts_mail: false, mx: [] },
			};
		case "no_mail":
			return {
				...base,
				verdict: "undeliverable",
				reason: "Domain has no MX or address records.",
				checks: { ...clean, accepts_mail: false, mx: [] },
			};
		case "error":
			return {
				...base,
				verdict: "unknown",
				reason: `DNS lookup failed: ${dns.message}`,
				checks: { ...clean, accepts_mail: null, mx: [] },
			};
	}
}
