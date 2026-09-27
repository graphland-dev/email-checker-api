const KV_MIN_TTL_S = 60;

export type RateLimitConfig = {
	limit: number;
	windowSeconds: number;
};

export type RateLimitResult = {
	allowed: boolean;
	limit: number;
	remaining: number;
	/** Seconds until the current window resets. */
	resetSeconds: number;
};

/**
 * Fixed-window counter in KV. KV is eventually consistent and not atomic, so
 * concurrent bursts can briefly exceed `limit` — good for abuse throttling,
 * not for exact quotas.
 */
export async function rateLimit(
	kv: KVNamespace,
	id: string,
	{ limit, windowSeconds }: RateLimitConfig,
	ctx: ExecutionContext,
): Promise<RateLimitResult> {
	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - (now % windowSeconds);
	const resetSeconds = windowStart + windowSeconds - now;
	const key = `rl:${id}:${windowStart}`;

	const count = Number((await kv.get(key)) ?? 0);
	if (count >= limit) {
		return { allowed: false, limit, remaining: 0, resetSeconds };
	}

	ctx.waitUntil(
		kv
			.put(key, String(count + 1), { expirationTtl: Math.max(KV_MIN_TTL_S, windowSeconds) })
			.catch((err: unknown) => console.warn("rate limit write failed", err)),
	);

	return { allowed: true, limit, remaining: limit - count - 1, resetSeconds };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
	const headers: Record<string, string> = {
		"ratelimit-limit": String(result.limit),
		"ratelimit-remaining": String(result.remaining),
		"ratelimit-reset": String(result.resetSeconds),
	};
	if (!result.allowed) headers["retry-after"] = String(result.resetSeconds);
	return headers;
}
