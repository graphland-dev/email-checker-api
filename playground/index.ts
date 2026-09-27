// Usage: bun run playground [email ...]
// Env:   EMAIL_CHECKER_URL (default http://localhost:8787)

import { createEmailChecker, isEmailCheckerError, type EmailCheckResult } from "../sdk/src";

const baseUrl = process.env.EMAIL_CHECKER_URL ?? "http://localhost:8787";

const DEFAULT_EMAILS = [
	"someone@gmail.com",
	"temp@mailinator.com",
	"hi@example.com",
	"hi@this-domain-should-not-exist-9x7.com",
	"not-an-email",
];

const checker = createEmailChecker({ baseUrl, timeoutMs: 5000 });

function describe(result: EmailCheckResult): string {
	switch (result.verdict) {
		case "deliverable":
			return `✅ deliverable — MX: ${result.checks.mx.map((r) => r.exchange).join(", ") || "(implicit via A/AAAA)"}`;
		case "disposable":
			return `🚫 disposable — matched ${result.checks.disposable_match}`;
		case "undeliverable":
			return `❌ undeliverable — ${result.reason}`;
		case "invalid":
			return `⚠️  invalid — ${result.reason}`;
		case "unknown":
			return `❓ unknown — ${result.reason}`;
	}
}

const emails = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_EMAILS;

console.log(`→ ${baseUrl}`);
console.log(`health:`, await checker.health());
console.log();

for (const email of emails) {
	try {
		const result = await checker.check(email);
		console.log(email.padEnd(45), describe(result));
	} catch (err) {
		if (isEmailCheckerError(err)) {
			const retry = err.code === "rate_limited" ? ` (retry in ${err.retryAfterSeconds}s)` : "";
			console.log(email.padEnd(45), `💥 ${err.code}: ${err.message}${retry}`);
		} else {
			throw err;
		}
	}
}
