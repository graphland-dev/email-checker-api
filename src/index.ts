import type { ApiErrorBody, CheckRequestBody, EmailCheckResult, HealthResponse } from '../sdk/src/types';
import { checkEmail } from './check';
import { rateLimit, rateLimitHeaders } from './rate-limit';

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-allow-headers': 'content-type',
	'access-control-expose-headers': 'ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after',
};

function json(body: EmailCheckResult | HealthResponse | ApiErrorBody, status = 200, headers: Record<string, string> = {}): Response {
	return Response.json(body, { status, headers: { ...CORS_HEADERS, ...headers } });
}

async function readEmail(request: Request, url: URL): Promise<string | null> {
	if (request.method === 'GET') return url.searchParams.get('email');

	const body = await request.json<Partial<CheckRequestBody>>().catch(() => null);
	return typeof body?.email === 'string' ? body.email : null;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

		if (url.pathname === '/health') return json({ ok: true });

		if (url.pathname === '/v1/check') {
			if (request.method !== 'GET' && request.method !== 'POST') {
				return json({ error: 'Method not allowed' }, 405);
			}

			const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
			const limit = await rateLimit(
				env.RATE_LIMIT_KV,
				ip,
				{ limit: Number(env.RATE_LIMIT_MAX), windowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS) },
				ctx,
			);
			const limitHeaders = rateLimitHeaders(limit);
			if (!limit.allowed) {
				return json({ error: 'Too many requests' }, 429, limitHeaders);
			}

			const email = await readEmail(request, url);
			if (!email) {
				return json({ error: 'Provide `email` as a query param (GET) or JSON body field (POST).' }, 400, limitHeaders);
			}
			return json(await checkEmail(email), 200, limitHeaders);
		}

		return json({ error: 'Not found' }, 404);
	},
} satisfies ExportedHandler<Env>;
