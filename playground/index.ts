// Usage: bun run playground [email ...]

import { EmailChecker, isEmailCheckerError, type EmailCheckResult } from '../sdk/src';

const DEFAULT_EMAILS = [
	'someone@gmail.com',
	'temp@mailinator.com',
	'hi@example.com',
	'hi@this-domain-should-not-exist-9x7.com',
	'not-an-email',
];

const checker = new EmailChecker();

function describe(result: EmailCheckResult): string {
	switch (result.verdict) {
		case 'deliverable':
			return `✅ deliverable — MX: ${result.checks.mx.map((r) => r.exchange).join(', ') || '(implicit via A/AAAA)'}`;
		case 'disposable':
			return `🚫 disposable — matched ${result.checks.disposable_match}`;
		case 'undeliverable':
			return `❌ undeliverable — ${result.reason}`;
		case 'invalid':
			return `⚠️  invalid — ${result.reason}`;
		case 'unknown':
			return `❓ unknown — ${result.reason}`;
	}
}

const emails = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_EMAILS;

try {
	console.log(`health:`, await checker.health());
} catch (err) {
	console.error(isEmailCheckerError(err) ? `${err.code}: ${err.message}` : err);
	process.exit(1);
}
console.log('Checking emails...');

for (const email of emails) {
	try {
		const result = await checker.check(email);
		console.log(email.padEnd(45), describe(result));
	} catch (err) {
		if (isEmailCheckerError(err)) {
			const retry = err.code === 'rate_limited' ? ` (retry in ${err.retryAfterSeconds}s)` : '';
			console.log(email.padEnd(45), `💥 ${err.code}: ${err.message}${retry}`);
		} else {
			throw err;
		}
	}
}
