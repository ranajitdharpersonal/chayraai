
import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

import { EnterpriseAgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

import {
  checkRateLimit,
  getClientIp,
} from '@/lib/security/rate-limit';

import '@/core/agents/publicHealth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const REFRESH_LOCK_TTL_SECONDS = 300;
const REFRESH_LOCK_KEY = 'chayra:public-health:refresh-lock';

const PUBLIC_HEALTH_RATE_LIMIT_POLICY = {
  namespace: 'public-health',
  limit: 30,
  window: '1 m',
} as const;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

let redisClient: Redis | null = null;

function getRefreshRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

async function acquireRefreshLock(): Promise<{
  acquired: boolean;
  release: () => Promise<void>;
}> {
  const redis = getRefreshRedis();

  // Availability-first: Redis problems must never block
  // the public-health response.
  if (!redis) {
    console.warn(
      '[Public Health API]: Redis unavailable. Refresh lock skipped.',
    );

    return {
      acquired: true,
      release: async () => {},
    };
  }

  const token = randomUUID();

  try {
    const result = await redis.set(
      REFRESH_LOCK_KEY,
      token,
      {
        nx: true,
        ex: REFRESH_LOCK_TTL_SECONDS,
      },
    );

    if (result !== 'OK') {
      return {
        acquired: false,
        release: async () => {},
      };
    }

    return {
      acquired: true,
      release: async () => {
        try {
          await redis.eval(
            RELEASE_LOCK_SCRIPT,
            [REFRESH_LOCK_KEY],
            [token],
          );
        } catch (error) {
          console.warn(
            '[Public Health API]: Refresh lock release failed. TTL will clean it up.',
            error,
          );
        }
      },
    };
  } catch (error) {
    console.warn(
      '[Public Health API]: Redis lock operation failed. Continuing without lock.',
      error,
    );

    return {
      acquired: true,
      release: async () => {},
    };
  }
}

async function refreshPublicHealthInBackground(): Promise<void> {
  const lock = await acquireRefreshLock();

  if (!lock.acquired) {
    console.log(
      '[Public Health API]: Another instance is already refreshing. Skipping duplicate refresh.',
    );
    return;
  }

  try {
    const handler =
      EnterpriseAgentRegistry.getAgent('PublicHealth');

    if (typeof handler !== 'function') {
      throw new Error('PublicHealth agent is unavailable.');
    }

    console.log(
      '[Public Health API]: Starting background snapshot refresh.',
    );

    await handler({
      location: 'Global',
    });

    console.log(
      '[Public Health API]: Background refresh completed.',
    );
  } catch (error) {
    console.error(
      '[Public Health API]: Background refresh failed. Existing snapshot is preserved.',
      error,
    );
  } finally {
    await lock.release();
  }
}

function scheduleBackgroundRefresh(): void {
  after(async () => {
    await refreshPublicHealthInBackground();
  });
}

function getCachedAge(timestamp: unknown): number {
  if (typeof timestamp !== 'string') {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = new Date(timestamp).getTime();

  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - parsed;
}

function getRefreshingResponse(
  cached: Awaited<
    ReturnType<typeof PredictiveMemoryBank.getPublicHealthState>
  >,
) {
  if (cached) {
    return NextResponse.json(
      {
        type: 'success',
        source: 'last-known-good',
        refreshStatus: 'refreshing',
        ...cached,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const timestamp = new Date().toISOString();

  return NextResponse.json(
    {
      type: 'success',
      source: 'refreshing',
      refreshStatus: 'initializing',
      analysisTimestamp: timestamp,
      healthAdvisory:
        'Public-health intelligence is being initialized. Please check again shortly.',
      officialAlerts: [],
      outbreakReports: [],
      sourceStatus: 'UNAVAILABLE',
      metadata: {
        analysisTimestamp: timestamp,
        source: 'WHO Disease Outbreak News + UN ReliefWeb',
        sourceStatus: 'UNAVAILABLE',
        snapshotStatus: 'NO_DATA',
        snapshotAgeDays: null,
        verificationPolicy:
          'No unverified health event is promoted to an official alert.',
        forecastWindow: '15 days',
        lookbackDays: 30,
      },
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '15',
      },
    },
  );
}

// ============================================================
// PUBLIC HEALTH API
// STALE-WHILE-REVALIDATE + DISTRIBUTED REFRESH LOCK
// ============================================================

export async function GET(request: Request) {
  try {
    // 1. Distributed IP-based rate limiting.
    const clientIp = getClientIp(request);

    if (!clientIp) {
      console.warn(
        '[Public Health API]: Trusted client IP unavailable. Rate limit skipped.',
      );
    } else {
      const rateLimit = await checkRateLimit(
        clientIp,
        PUBLIC_HEALTH_RATE_LIMIT_POLICY,
      );

      console.log(
        '[Public Health API]: Rate-limit decision.',
        {
          mode: rateLimit.mode,
          source: rateLimit.source,
          wouldBlock: rateLimit.wouldBlock,
          remaining: rateLimit.remaining,
        },
      );

      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            type: 'error',
            message:
              'Too many requests. Please wait before trying again.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(
                rateLimit.retryAfter ?? 60,
              ),
              'X-RateLimit-Limit': String(
                rateLimit.limit,
              ),
              'X-RateLimit-Remaining': String(
                rateLimit.remaining ?? 0,
              ),
              'Cache-Control': 'no-store',
            },
          },
        );
      }
    }

    // 2. Read the last-known snapshot.
    const cached =
      await PredictiveMemoryBank.getPublicHealthState();

    const timestamp =
      cached?.metadata?.analysisTimestamp ??
      cached?.analysisTimestamp;

    const cachedAge = getCachedAge(timestamp);

    const cachedSourceStatus =
      cached?.metadata?.sourceStatus ??
      cached?.sourceStatus ??
      'UNAVAILABLE';

    const isFresh =
      Boolean(cached) &&
      cachedSourceStatus !== 'UNAVAILABLE' &&
      Number.isFinite(cachedAge) &&
      cachedAge >= 0 &&
      cachedAge < CACHE_TTL_MS;

    // 3. Fresh snapshot: return immediately.
    if (cached && isFresh) {
      return NextResponse.json(
        {
          type: 'success',
          source: 'cache',
          refreshStatus: 'fresh',
          ...cached,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // 4. Stale/missing snapshot:
    // Schedule refresh after sending the response.
    // Never await the PublicHealth agent in this request.
    scheduleBackgroundRefresh();

    // 5. Return stale data immediately, or a 202
    // initialization response when no snapshot exists.
    return getRefreshingResponse(cached);
  } catch (error) {
    console.error(
      '[Public Health API]: Intelligence retrieval failed.',
      error,
    );

    // 6. Last-known-good fallback.
    try {
      const cached =
        await PredictiveMemoryBank.getPublicHealthState();

      if (cached) {
        return NextResponse.json(
          {
            type: 'success',
            source: 'last-known-good',
            refreshStatus: 'refresh-pending',
            ...cached,
          },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }
    } catch (fallbackError) {
      console.error(
        '[Public Health API]: Cached fallback failed.',
        fallbackError,
      );
    }

    // 7. No cached data: schedule recovery and return
    // immediately instead of waiting for external sources.
    try {
      scheduleBackgroundRefresh();

      return getRefreshingResponse(null);
    } catch (scheduleError) {
      console.error(
        '[Public Health API]: Background scheduling failed.',
        scheduleError,
      );

      return NextResponse.json(
        {
          type: 'error',
          message:
            'Public-health intelligence is temporarily unavailable.',
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }
  }
}
