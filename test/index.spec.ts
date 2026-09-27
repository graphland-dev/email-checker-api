import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEmail } from "../src/check";
import { matchDisposableDomain } from "../src/disposable";
import { parseEmail } from "../src/syntax";

type Answer = { type: number; data: string };

function stubDns(records: Record<string, { Status?: number; Answer?: Answer[] }>) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const key = `${url.searchParams.get("name")} ${url.searchParams.get("type")}`;
		const rec = records[key] ?? {};
		return Response.json({ Status: rec.Status ?? 0, Answer: rec.Answer ?? [] });
	});
}

afterEach(() => vi.restoreAllMocks());

describe("parseEmail", () => {
	it("normalizes valid addresses", () => {
		expect(parseEmail("  Jane.Doe+tag@Example.COM ")).toEqual({
			normalized: "jane.doe+tag@example.com",
			local: "jane.doe+tag",
			domain: "example.com",
		});
	});

	it.each(["", "plain", "@example.com", "a@", "a..b@example.com", "a@example", "a@-bad.com", "a@example.c0m"])(
		"rejects %j",
		(input) => expect(parseEmail(input)).toBeNull(),
	);
});

describe("matchDisposableDomain", () => {
	it("matches exact and parent domains", () => {
		expect(matchDisposableDomain("mailinator.com")).toBe("mailinator.com");
		expect(matchDisposableDomain("foo.mailinator.com")).toBe("mailinator.com");
		expect(matchDisposableDomain("gmail.com")).toBeNull();
	});
});

describe("checkEmail", () => {
	it("flags invalid syntax without DNS", async () => {
		const fetchSpy = stubDns({});
		const res = await checkEmail("not-an-email");
		expect(res.verdict).toBe("invalid");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("flags disposable domains without DNS", async () => {
		const fetchSpy = stubDns({});
		const res = await checkEmail("someone@mailinator.com");
		expect(res.verdict).toBe("disposable");
		expect(res.checks.disposable_match).toBe("mailinator.com");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("marks domains with MX as deliverable", async () => {
		stubDns({
			"acme.io MX": { Answer: [{ type: 15, data: "20 alt.mx.acme.io." }, { type: 15, data: "10 mx.acme.io." }] },
		});
		const res = await checkEmail("hi@acme.io");
		expect(res.verdict).toBe("deliverable");
		expect(res.checks.mx).toEqual([
			{ priority: 10, exchange: "mx.acme.io" },
			{ priority: 20, exchange: "alt.mx.acme.io" },
		]);
	});

	it("flags custom domains that route mail to a disposable provider", async () => {
		stubDns({ "sneaky.io MX": { Answer: [{ type: 15, data: "10 mail.mailinator.com." }] } });
		const res = await checkEmail("hi@sneaky.io");
		expect(res.verdict).toBe("disposable");
		expect(res.checks.disposable_match).toBe("mailinator.com");
	});

	it("marks NXDOMAIN as undeliverable", async () => {
		stubDns({ "nope.io MX": { Status: 3 } });
		expect((await checkEmail("hi@nope.io")).verdict).toBe("undeliverable");
	});

	it("marks null MX as undeliverable", async () => {
		stubDns({ "nomail.io MX": { Answer: [{ type: 15, data: "0 ." }] } });
		const res = await checkEmail("hi@nomail.io");
		expect(res.verdict).toBe("undeliverable");
		expect(res.reason).toMatch(/null MX/);
	});

	it("falls back to A records when there is no MX", async () => {
		stubDns({ "legacy.io A": { Answer: [{ type: 1, data: "203.0.113.10" }] } });
		expect((await checkEmail("hi@legacy.io")).verdict).toBe("deliverable");
	});

	it("marks domains with no MX or address records as undeliverable", async () => {
		stubDns({});
		expect((await checkEmail("hi@empty.io")).verdict).toBe("undeliverable");
	});

	it("returns unknown when DNS fails", async () => {
		stubDns({ "flaky.io MX": { Status: 2 } });
		expect((await checkEmail("hi@flaky.io")).verdict).toBe("unknown");
	});
});

describe("HTTP API", () => {
	it("accepts GET with a query param", async () => {
		const res = await SELF.fetch("https://example.com/v1/check?email=x@mailinator.com");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ verdict: "disposable" });
	});

	it("accepts POST with a JSON body", async () => {
		const res = await SELF.fetch("https://example.com/v1/check", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: "bad" }),
		});
		expect(await res.json()).toMatchObject({ verdict: "invalid" });
	});

	it("returns 400 when email is missing", async () => {
		const res = await SELF.fetch("https://example.com/v1/check");
		expect(res.status).toBe(400);
	});
});
