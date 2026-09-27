import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EmailChecker } from "../sdk/src";
import { rateLimit } from "../src/rate-limit";

describe("rateLimit", () => {
	it("allows up to the limit, then blocks", async () => {
		const config = { limit: 2, windowSeconds: 60 };
		const results = [];
		for (let i = 0; i < 3; i += 1) {
			const ctx = createExecutionContext();
			results.push(await rateLimit(env.RATE_LIMIT_KV, "unit-ip", config, ctx));
			await waitOnExecutionContext(ctx);
		}

		expect(results.map((r) => [r.allowed, r.remaining])).toEqual([
			[true, 1],
			[true, 0],
			[false, 0],
		]);
		expect(results[2].resetSeconds).toBeGreaterThan(0);
		expect(results[2].resetSeconds).toBeLessThanOrEqual(60);
	});

	it("tracks clients independently", async () => {
		const config = { limit: 1, windowSeconds: 60 };
		const ctx = createExecutionContext();
		const a = await rateLimit(env.RATE_LIMIT_KV, "ip-a", config, ctx);
		const b = await rateLimit(env.RATE_LIMIT_KV, "ip-b", config, ctx);
		await waitOnExecutionContext(ctx);
		expect([a.allowed, b.allowed]).toEqual([true, true]);
	});
});

describe("HTTP rate limiting", () => {
	it("returns 429 with retry-after once the window is exhausted", async () => {
		const max = Number(env.RATE_LIMIT_MAX);
		const headers = { "cf-connecting-ip": "203.0.113.99" };
		const url = "https://example.com/v1/check?email=x@mailinator.com";

		for (let i = 0; i < max; i += 1) {
			const res = await SELF.fetch(url, { headers });
			expect(res.status).toBe(200);
			await res.arrayBuffer();
		}

		const blocked = await SELF.fetch(url, { headers });
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
		expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

		const client = new EmailChecker({
			baseUrl: "https://example.com",
			fetch: (input, init) => SELF.fetch(input, { ...init, headers: { ...init?.headers, ...headers } }),
		});
		await expect(client.check("x@mailinator.com")).rejects.toMatchObject({
			code: "rate_limited",
			status: 429,
			retryAfterSeconds: expect.any(Number),
		});
	});
});
