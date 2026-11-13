
import { createHash } from 'node:crypto';

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// ============================================================
// CHAYRA AI — DISTRIBUTED RATE LIMIT FOUNDATION
// Provider: Upstash Redis
// Default mode: OBSERVE (never blocks requests)
// ============================================================

export type RateLimitMode = 'observe' | 'enforce';

export interface RateLimitPolicy {
  namespace: string;
  limit: number;
  window: `${number} s` | `${number} m` | `${number} h`;
}

export interface RateLimitResult {
  allowed: boolean;
  wouldBlock: boolean;
  mode: RateLimitMode;
  limit: number;
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
  source: 'redis' | 'fallback';
}

const DEFAULT_TIMEOUT_MS = 1500;

const limiterCache = new Map<string, Ratelimit>();

let redisClient: Redis | null = null;

function getMode(): RateLimitMode {
  return process.env.CHAYRA_RATE_LIMIT_MODE === 'enforce'
    ? 'enforce'
    : 'observe';
}

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Upstash configuration is missing. Check KV_REST_API_URL and KV_REST_API_TOKEN.',
    );
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

function getLimiter(policy: RateLimitPolicy): Ratelimit {
  if (
    !policy.namespace ||
    !/^[a-zA-Z0-9_-]+$/.test(policy.namespace) ||
    !Number.isInteger(policy.limit) ||
    policy.limit < 1 ||
    !/^\d+ [smh]$/.test(policy.window)
  ) {
    throw new Error('Invalid rate-limit policy.');
  }

  const cacheKey = [
    policy.namespace,
    policy.limit,
    policy.window,
  ].join(':');

  const existing = limiterCache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.fixedWindow(
      policy.limit,
      policy.window,
    ),
    prefix: `chayra:ratelimit:${policy.namespace}`,
    analytics: false,
  });

  limiterCache.set(cacheKey, limiter);

  return limiter;
}

function hashIdentifier(identifier: string): string {
  return createHash('sha256')
    .update(identifier)
    .digest('hex');
}

// Read the client IP supplied by the hosting proxy.
// Do not accept arbitrary client-provided identifiers.
export function getClientIp(request: Request): string | null {
  const realIp = request.headers.get('x-real-ip')?.trim();

  if (realIp) {
    return realIp.toLowerCase();
  }

  const forwardedFor =
    request.headers.get('x-forwarded-for');

  if (!forwardedFor) {
    return null;
  }

  const firstIp = forwardedFor
    .split(',')[0]
    ?.trim()
    .toLowerCase();

  return firstIp || null;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error('Rate-limit service timed out.'),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function fallbackResult(
  policy: RateLimitPolicy,
  mode: RateLimitMode,
): RateLimitResult {
  // Availability-first fallback:
  // Redis errors never interrupt crisis-response execution.
  return {
    allowed: true,
    wouldBlock: false,
    mode,
    limit: policy.limit,
    remaining: null,
    reset: null,
    retryAfter: null,
    source: 'fallback',
  };
}

export async function checkRateLimit(
  identifier: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const mode = getMode();

  try {
    if (
      typeof identifier !== 'string' ||
      !identifier.trim()
    ) {
      throw new Error('Rate-limit identifier is missing.');
    }

    const limiter = getLimiter(policy);

    const hashedIdentifier = hashIdentifier(
      identifier.trim(),
    );

    const result = await withTimeout(
      limiter.limit(hashedIdentifier),
      DEFAULT_TIMEOUT_MS,
    );

    const wouldBlock = !result.success;

    return {
      // Observe mode records the decision but never blocks.
      // Enforce mode applies the Redis decision.
      allowed: mode === 'observe' || result.success,
      wouldBlock,
      mode,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: wouldBlock
        ? Math.max(
            1,
            Math.ceil((result.reset - Date.now()) / 1000),
          )
        : null,
      source: 'redis',
    };
  } catch (error) {
    console.error(
      '[ChayRa RateLimit]: Distributed check unavailable.',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    );

    return fallbackResult(policy, mode);
  }
}
