import { NextResponse } from 'next/server';

import {
  EnterpriseAgentRegistry,
} from '@/core/adk/registry';

import {
  PredictiveMemoryBank,
} from '@/core/adk/memory';

// Ensure the PublicHealth handler registers itself.
import '@/core/agents/publicHealth';

const CACHE_TTL_MS =
  24 * 60 * 60 * 1000;

export async function GET() {
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

    // Use a recent verified snapshot without
    // spending another model/source request.
    if (
      cached &&
      Number.isFinite(cachedAge) &&
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

    // Last-known-good fallback.
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