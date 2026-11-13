
import { NextResponse } from 'next/server';

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

const PUBLIC_HEALTH_RATE_LIMIT_POLICY = {
  namespace: 'public-health',
  limit: 30,
  window: '1 m',
} as const;

// ============================================================
// PUBLIC HEALTH API — 24 HOUR CACHE
// + DISTRIBUTED RATE LIMITING
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

    // 2. Retrieve cached public-health state.
    const cached =
      await PredictiveMemoryBank.getPublicHealthState();

    const timestamp = cached?.analysisTimestamp;

    const cachedAge =
      typeof timestamp === 'string'
        ? Date.now() - new Date(timestamp).getTime()
        : Number.POSITIVE_INFINITY;

    const cachedSourceStatus =
      cached?.metadata?.sourceStatus ??
      cached?.sourceStatus ??
      'UNAVAILABLE';

    // 3. Return fresh cached state.
    if (
      cached &&
      cachedSourceStatus !== 'UNAVAILABLE' &&
      Number.isFinite(cachedAge) &&
      cachedAge >= 0 &&
      cachedAge < CACHE_TTL_MS
    ) {
      return NextResponse.json(
        {
          type: 'success',
          source: 'cache',
          ...cached,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // 4. Refresh only when the saved snapshot is stale.
    const handler =
      EnterpriseAgentRegistry.getAgent('PublicHealth');

    if (typeof handler !== 'function') {
      throw new Error('PublicHealth agent is unavailable.');
    }

    console.log(
      '[Public Health API]: Refreshing expired health snapshot.',
    );

    const result = await handler({
      location: 'Global',
    });

    return NextResponse.json(
      {
        type: 'success',
        source: 'live',
        ...result,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[Public Health API]: Intelligence retrieval failed.',
      error,
    );

    // 5. Last-known-good fallback.
    try {
      const cached =
        await PredictiveMemoryBank.getPublicHealthState();

      if (cached) {
        return NextResponse.json(
          {
            type: 'success',
            source: 'last-known-good',
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

    // 6. Service unavailable.
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
