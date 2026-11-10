
import { NextResponse } from 'next/server';

import { EnterpriseAgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

import '@/core/agents/publicHealth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================
// PUBLIC HEALTH API — 24 HOUR CACHE
// ============================================================

export async function GET() {
  try {
    const cached =
      await PredictiveMemoryBank.getPublicHealthState();

    const timestamp = cached?.analysisTimestamp;

    const cachedAge =
      typeof timestamp === 'string'
        ? Date.now() - new Date(timestamp).getTime()
        : Number.POSITIVE_INFINITY;

    // ✅ ADD THIS HERE
    const cachedSourceStatus =
      cached?.metadata?.sourceStatus ??
      cached?.sourceStatus ??
      'UNAVAILABLE';

    // Return fresh cached state.
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
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    // Refresh only when the saved snapshot is stale.
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
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error(
      '[Public Health API]: Intelligence retrieval failed.',
      error,
    );

    // Last-known-good fallback.
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
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }
    } catch (fallbackError) {
      console.error(
        '[Public Health API]: Cached fallback failed.',
        fallbackError,
      );
    }

    return NextResponse.json(
      {
        type: 'error',
        message: 'Public-health intelligence is temporarily unavailable.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
