import type { MxRecord } from "../sdk/src/types";

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DNS_TIMEOUT_MS = 3000;
const DNS_CACHE_TTL_S = 300;

const RCODE_NOERROR = 0;
const RCODE_NXDOMAIN = 3;

const TYPE = { A: 1, MX: 15, AAAA: 28 } as const;

type DohAnswer = { name: string; type: number; TTL: number; data: string };
type DohResponse = { Status: number; Answer?: DohAnswer[] };

export type MailDnsResult =
	| { status: "nxdomain" }
	| { status: "null_mx" }
	| { status: "mx"; records: MxRecord[] }
	| { status: "implicit_mx"; host: string }
	| { status: "no_mail" }
	| { status: "error"; message: string };

class DnsLookupError extends Error {}

async function query(name: string, type: keyof typeof TYPE): Promise<DohResponse> {
	const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { accept: "application/dns-json" },
			signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
			cf: { cacheTtl: DNS_CACHE_TTL_S, cacheEverything: true },
		});
	} catch (err) {
		throw new DnsLookupError(`${type} lookup failed: ${(err as Error).message}`);
	}
	if (!res.ok) throw new DnsLookupError(`${type} lookup failed: HTTP ${res.status}`);

	const body = (await res.json()) as DohResponse;
	if (body.Status !== RCODE_NOERROR && body.Status !== RCODE_NXDOMAIN) {
		throw new DnsLookupError(`${type} lookup failed: rcode ${body.Status}`);
	}
	return body;
}

function answersOf(res: DohResponse, type: number): DohAnswer[] {
	return (res.Answer ?? []).filter((a) => a.type === type);
}

/**
 * Resolves where mail for `domain` would be delivered, following RFC 5321
 * (implicit MX via A/AAAA when no MX exists) and RFC 7505 (null MX).
 */
export async function resolveMailDns(domain: string): Promise<MailDnsResult> {
	try {
		const mx = await query(domain, "MX");
		if (mx.Status === RCODE_NXDOMAIN) return { status: "nxdomain" };

		const records = answersOf(mx, TYPE.MX)
			.map((a) => {
				const [priority, exchange = ""] = a.data.trim().split(/\s+/);
				return { priority: Number(priority), exchange: exchange.toLowerCase().replace(/\.$/, "") };
			})
			.sort((a, b) => a.priority - b.priority);

		if (records.length === 1 && records[0].exchange === "") return { status: "null_mx" };
		const usable = records.filter((r) => r.exchange !== "");
		if (usable.length > 0) return { status: "mx", records: usable };

		const [a, aaaa] = await Promise.all([query(domain, "A"), query(domain, "AAAA")]);
		if (answersOf(a, TYPE.A).length > 0 || answersOf(aaaa, TYPE.AAAA).length > 0) {
			return { status: "implicit_mx", host: domain };
		}
		return { status: "no_mail" };
	} catch (err) {
		if (err instanceof DnsLookupError) return { status: "error", message: err.message };
		throw err;
	}
}
