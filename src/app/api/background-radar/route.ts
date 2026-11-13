
import { NextResponse } from 'next/server';

import { getRadarSnapshot } from '@/core/aws/radar-snapshot';

import {
  checkRateLimit,
  getClientIp,
} from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKGROUND_RADAR_RATE_LIMIT_POLICY = {
  namespace: 'background-radar',
  limit: 60,
  window: '1 m',
} as const;

// ============================================================
// READ-ONLY RADAR SNAPSHOT API
// No live NASA/USGS scans from frontend requests.
// Distributed rate limiting protects snapshot access.
// ============================================================

export async function GET(request: Request) {
  try {
    // 1. Distributed IP-based rate limiting.
    const clientIp = getClientIp(request);

    if (!clientIp) {
      console.warn(
        '[Radar API]: Trusted client IP unavailable. Rate limit skipped.',
      );
    } else {
      const rateLimit = await checkRateLimit(
        clientIp,
        BACKGROUND_RADAR_RATE_LIMIT_POLICY,
      );

      console.log(
        '[Radar API]: Rate-limit decision.',
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
            success: false,
            snapshotAvailable: false,
            error:
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

    // 2. Retrieve read-only radar snapshot.
    const snapshot = await getRadarSnapshot();

    if (!snapshot) {
      return NextResponse.json(
        {
          success: true,
          snapshotAvailable: false,
          activeThreats: 0,
          threats: [],
          scannedAt: null,
          message: 'Daily radar snapshot is not available yet.',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // 3. Calculate snapshot age.
    const ageMs =
      Date.now() - new Date(snapshot.scannedAt).getTime();

    // 4. Return snapshot.
    return NextResponse.json(
      {
        success: true,
        snapshotAvailable: true,
        activeThreats: snapshot.threats.length,
        threats: snapshot.threats,
        scannedAt: snapshot.scannedAt,
        snapshotAgeHours:
          Number.isFinite(ageMs)
            ? Number(
                (Math.max(0, ageMs) / 3_600_000).toFixed(2),
              )
            : null,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[Radar API]: Snapshot retrieval failed.',
      error,
    );

    return NextResponse.json(
      {
        success: false,
        snapshotAvailable: false,
        error: 'Radar snapshot temporarily unavailable.',
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
