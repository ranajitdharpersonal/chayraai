
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { scanGlobalThreats } from '@/core/agents/radar';
import { saveRadarSnapshot } from '@/core/aws/radar-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(
    request.headers.get('authorization') || '',
  );

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

// ============================================================
// DAILY RADAR CRON
// ============================================================

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: 'Cron secret is not configured.' },
      { status: 500 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.' },
      { status: 401 },
    );
  }

  console.log('[Radar Cron]: Starting scheduled global scan...');

  try {
    const threats = await scanGlobalThreats();

    await saveRadarSnapshot(threats);

    const result = {
      success: true,
      scannedAt: new Date().toISOString(),
      activeThreats: threats.length,
      sourceCounts: {
        nasa: threats.filter((t) => t.id.startsWith('nasa-')).length,
        usgs: threats.filter((t) =>
          t.name.startsWith('USGS EARTHQUAKE'),
        ).length,
        reference: threats.filter((t) => t.type === 'reference').length,
      },
    };

    console.log('[Radar Cron]: Daily snapshot saved.', result);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[Radar Cron]: Scheduled scan failed.', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Daily radar scan failed. Previous snapshot was preserved.',
      },
      { status: 500 },
    );
  }
}
