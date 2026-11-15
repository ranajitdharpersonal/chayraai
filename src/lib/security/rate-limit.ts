
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// ============================================================
// CHAYRA AI — DISTRIBUTED RATE LIMIT ENGINE
// Provider: Upstash Redis
// Default mode: OBSERVE
//
// OBSERVE: Record rate-limit decisions, never block.
// ENFORCE: Apply rate-limit decisions.
// Redis failure: Fail open to preserve crisis-response availability.
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
const MAX_IDENTIFIER_LENGTH = 256;

const limiterCache = new Map<string, Ratelimit>();

let redisClient: Redis | null = null;

// ============================================================
// 1. RATE LIMIT MODE
// ============================================================

function getMode(): RateLimitMode {
  return process.env.CHAYRA_RATE_LIMIT_MODE === 'enforce'
    ? 'enforce'
    : 'observe';
}

// ============================================================
// 2. REDIS CLIENT
// ============================================================

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    throw new Error('Upstash configuration is missing.');
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

// ============================================================
// 3. POLICY VALIDATION & LIMITER CACHE
// ============================================================

function validatePolicy(policy: RateLimitPolicy): void {
  if (
    !policy ||
    typeof policy.namespace !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(policy.namespace) ||
    !Number.isInteger(policy.limit) ||
    policy.limit < 1 ||
    policy.limit > 1_000_000 ||
    typeof policy.window !== 'string' ||
    !/^\d+ [smh]$/.test(policy.window)
  ) {
    throw new Error('Invalid rate-limit policy.');
  }

  const duration = Number(policy.window.split(' ')[0]);

  if (!Number.isSafeInteger(duration) || duration < 1) {
    throw new Error('Invalid rate-limit window.');
  }
}

function getLimiter(policy: RateLimitPolicy): Ratelimit {
  validatePolicy(policy);

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

// ============================================================
// 4. TRUSTED CLIENT IP IDENTIFICATION
// ============================================================

/**
 * Vercel supplies x-real-ip at the hosting proxy.
 *
 * We intentionally do not fall back to the first
 * x-forwarded-for value because arbitrary forwarded
 * values can be client-controlled in other proxy setups.
 *
 * For non-Vercel deployments, configure an explicitly
 * trusted proxy before changing this logic.
 */
export function getClientIp(request: Request): string | null {
  const candidate = request.headers
    .get('x-real-ip')
    ?.trim();

  if (!candidate || candidate.length > 64) {
    return null;
  }

  if (isIP(candidate) === 0) {
    return null;
  }

  return candidate.toLowerCase();
}

// ============================================================
// 5. IDENTIFIER HASHING
// ============================================================

function hashIdentifier(identifier: string): string {
  return createHash('sha256')
    .update(identifier.trim().toLowerCase())
    .digest('hex');
}

// ============================================================
// 6. TIMEOUT PROTECTION
// ============================================================

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

// ============================================================
// 7. AVAILABILITY-FIRST FALLBACK
// ============================================================

function fallbackResult(
  policy: RateLimitPolicy,
  mode: RateLimitMode,
): RateLimitResult {
  return {
    // Redis unavailable: do not interrupt crisis response.
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

// ============================================================
// 8. DISTRIBUTED RATE LIMIT CHECK
// ============================================================

export async function checkRateLimit(
  identifier: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const mode = getMode();

  try {
    validatePolicy(policy);

    if (
      typeof identifier !== 'string' ||
      !identifier.trim() ||
      identifier.trim().length > MAX_IDENTIFIER_LENGTH
    ) {
      throw new Error('Invalid rate-limit identifier.');
    }

    const limiter = getLimiter(policy);

    const hashedIdentifier = hashIdentifier(identifier);

    const result = await withTimeout(
      limiter.limit(hashedIdentifier),
      DEFAULT_TIMEOUT_MS,
    );

    const wouldBlock = !result.success;

    const retryAfter = wouldBlock
      ? Math.max(
          1,
          Math.ceil(
            (result.reset - Date.now()) / 1000,
          ),
        )
      : null;

    return {
      // Observe mode records decisions without blocking.
      // Enforce mode applies the Redis decision.
      allowed: mode === 'observe' || result.success,
      wouldBlock,
      mode,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter,
      source: 'redis',
    };
  } catch (error) {
    // Never log user input, identifiers, or Redis credentials.
    console.error(
      '[ChayRa RateLimit]: Distributed check unavailable.',
      {
        namespace: policy?.namespace ?? 'unknown',
        mode,
        reason:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
    );

    return fallbackResult(policy, mode);
  }
}
