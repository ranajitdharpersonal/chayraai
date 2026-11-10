
import { NextResponse } from 'next/server';

import { getRadarSnapshot } from '@/core/aws/radar-snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ============================================================
// READ-ONLY RADAR SNAPSHOT API
// No live NASA/USGS scans from frontend requests.
// ============================================================

export async function GET() {
  try {
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
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const ageMs =
      Date.now() - new Date(snapshot.scannedAt).getTime();

    return NextResponse.json(
      {
        success: true,
        snapshotAvailable: true,
        activeThreats: snapshot.threats.length,
        threats: snapshot.threats,
        scannedAt: snapshot.scannedAt,
        snapshotAgeHours:
          Number.isFinite(ageMs)
            ? Number((Math.max(0, ageMs) / 3_600_000).toFixed(2))
            : null,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('[Radar API]: Snapshot retrieval failed.', error);

    return NextResponse.json(
      {
        success: false,
        snapshotAvailable: false,
        error: 'Radar snapshot temporarily unavailable.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
