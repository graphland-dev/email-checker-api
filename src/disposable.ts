import { DISPOSABLE_EMAIL_DOMAINS } from "./disposable-domains.generated";

/**
 * Returns the blocklist entry that matches `host` (exact host or a listed
 * parent, e.g. foo.mailinator.com -> mailinator.com), or null.
 */
export function matchDisposableDomain(host: string): string | null {
	const domain = host.trim().toLowerCase().replace(/\.$/, "");
	if (!domain) return null;
	if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return domain;

	const labels = domain.split(".");
	for (let i = 1; i < labels.length - 1; i += 1) {
		const parent = labels.slice(i).join(".");
		if (DISPOSABLE_EMAIL_DOMAINS.has(parent)) return parent;
	}
	return null;
}
