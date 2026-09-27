export type ParsedEmail = {
	normalized: string;
	local: string;
	domain: string;
};

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD = /^(xn--[a-z0-9-]+|[a-z]{2,63})$/i;

/** Pragmatic RFC 5321 check: dot-atom local part, LDH hostname domain. */
export function parseEmail(input: string): ParsedEmail | null {
	const normalized = input.trim().toLowerCase();
	if (normalized.length > 254) return null;

	const at = normalized.lastIndexOf("@");
	if (at < 1 || at === normalized.length - 1) return null;

	const local = normalized.slice(0, at);
	const domain = normalized.slice(at + 1).replace(/\.$/, "");
	if (local.length > 64 || !LOCAL_PART.test(local)) return null;

	const labels = domain.split(".");
	if (labels.length < 2 || !labels.every((l) => DOMAIN_LABEL.test(l))) return null;
	if (!TLD.test(labels[labels.length - 1])) return null;

	return { normalized: `${local}@${domain}`, local, domain };
}
