import { NextResponse } from 'next/server';

import {
  EnterpriseAgentRegistry,
} from '@/core/adk/registry';

import {
  PredictiveMemoryBank,
} from '@/core/adk/memory';

// Ensure the PublicHealth handler registers itself.
import '@/core/agents/publicHealth';

// Public Health is intentionally cached for the background/normal UI path,
// but the dedicated Health tab can request a live refresh explicitly with:
// GET /api/public-health?refresh=1
const CACHE_TTL_MS =
  24 * 60 * 60 * 1000;

export async function GET(
  request: Request,
) {
  const url =
    new URL(
      request.url,
    );

  const forceRefresh =
    url.searchParams.get(
      'refresh',
    ) === '1';

  try {
    const cached =
      await PredictiveMemoryBank
        .getPublicHealthState();

    const cachedTimestamp =
      cached?.analysisTimestamp;

    const cachedAge =
      typeof cachedTimestamp ===
      'string'
        ? Date.now() -
          new Date(
            cachedTimestamp,
          ).getTime()
        : Number.POSITIVE_INFINITY;

    // Preserve the existing low-cost cache behavior for
    // normal requests. The Health tab can explicitly bypass
    // this cache with ?refresh=1.
    if (
      !forceRefresh &&
      cached &&
      Number.isFinite(
        cachedAge,
      ) &&
      cachedAge >= 0 &&
      cachedAge < CACHE_TTL_MS
    ) {
      return NextResponse.json({
        type: 'success',
        source: 'cache',
        ...cached,
      });
    }

    const handler =
      EnterpriseAgentRegistry
        .getAgent(
          'PublicHealth',
        );

    console.log(
      `[Public Health API]: ${
        forceRefresh
          ? 'Forcing live source refresh.'
          : 'Refreshing stale public-health snapshot.'
      }`,
    );

    const result =
      await handler({
        location:
          'Global',
      });

    return NextResponse.json({
      type: 'success',
      source: 'live',
      ...result,
    });
  } catch (error: any) {
    console.error(
      '[Public Health API]: Failed to load intelligence.',
      error,
    );

    // Preserve the existing last-known-good fallback.
    try {
      const cached =
        await PredictiveMemoryBank
          .getPublicHealthState();

      if (cached) {
        return NextResponse.json({
          type: 'success',
          source:
            'last-known-good',
          ...cached,
          metadata: {
            ...(cached as any).metadata,
            snapshotStatus:
              'LAST_KNOWN_GOOD',
          },
        });
      }
    } catch (fallbackError) {
      console.error(
        '[Public Health API]: Snapshot fallback failed.',
        fallbackError,
      );
    }

    return NextResponse.json(
      {
        type: 'error',
        message:
          'Public-health intelligence is temporarily unavailable.',
      },
      {
        status: 503,
      },
    );
  }
}