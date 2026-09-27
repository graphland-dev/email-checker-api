import { SELF } from "cloudflare:test";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	createEmailChecker,
	EmailCheckerError,
	type DisposableResult,
	type EmailCheckResult,
	type InvalidResult,
} from "../sdk/src";

const client = createEmailChecker({
	baseUrl: "https://example.com/",
	fetch: (input, init) => SELF.fetch(input, init),
});

describe("SDK", () => {
	it("returns a narrowed disposable result", async () => {
		const result = await client.check("x@mailinator.com");
		expectTypeOf(result).toEqualTypeOf<EmailCheckResult>();

		expect(result.verdict).toBe("disposable");
		if (result.verdict === "disposable") {
			expectTypeOf(result).toEqualTypeOf<DisposableResult>();
			expectTypeOf(result.checks.disposable_match).toEqualTypeOf<string>();
			expectTypeOf(result.domain).toEqualTypeOf<string>();
			expect(result.checks.disposable_match).toBe("mailinator.com");
		}
	});

	it("returns a narrowed invalid result", async () => {
		const result = await client.check("nope");
		expect(result.verdict).toBe("invalid");
		if (result.verdict === "invalid") {
			expectTypeOf(result).toEqualTypeOf<InvalidResult>();
			expectTypeOf(result.normalized).toEqualTypeOf<null>();
		}
	});

	it("calls health", async () => {
		expect(await client.health()).toEqual({ ok: true });
	});

	it("throws http_error with the server message", async () => {
		const bad = createEmailChecker({
			baseUrl: "https://example.com",
			fetch: (input, init) => SELF.fetch(input.replace("/v1/check", "/missing"), init),
		});
		const err = await bad.check("x@y.com").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(EmailCheckerError);
		expect(err).toMatchObject({ code: "http_error", status: 404, message: "Not found" });
	});

	it("throws invalid_response when the body breaks the contract", async () => {
		const bad = createEmailChecker({
			baseUrl: "https://example.com",
			fetch: async () => Response.json({ verdict: "maybe" }),
		});
		await expect(bad.check("x@y.com")).rejects.toMatchObject({ code: "invalid_response" });
	});

	it("throws network_error when fetch rejects", async () => {
		const bad = createEmailChecker({
			baseUrl: "https://example.com",
			fetch: async () => {
				throw new TypeError("connection refused");
			},
		});
		await expect(bad.check("x@y.com")).rejects.toMatchObject({ code: "network_error" });
	});

	it("throws aborted when the caller aborts", async () => {
		const controller = new AbortController();
		controller.abort();
		const bad = createEmailChecker({
			baseUrl: "https://example.com",
			fetch: async (_input, init) => {
				init?.signal?.throwIfAborted();
				return Response.json({});
			},
		});
		await expect(bad.check("x@y.com", { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
	});
});
