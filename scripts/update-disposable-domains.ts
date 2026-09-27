const SOURCE_URL =
	"https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const OUT_FILE = new URL("../src/disposable-domains.generated.ts", import.meta.url);

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Failed to fetch blocklist: ${res.status} ${res.statusText}`);

const domains = [
	...new Set(
		(await res.text())
			.split("\n")
			.map((line) => line.trim().toLowerCase())
			.filter((line) => line && !line.startsWith("#")),
	),
].sort();

const body = `// Auto-generated from https://github.com/disposable-email-domains/disposable-email-domains
// Run \`bun run update:disposable\` to refresh — do not edit by hand.
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set<string>([
${domains.map((d) => `\t${JSON.stringify(d)},`).join("\n")}
]);
`;

await Bun.write(OUT_FILE, body);
console.log(`Wrote ${domains.length} domains to ${OUT_FILE.pathname}`);
