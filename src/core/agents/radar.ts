
import { EnterpriseAgentRegistry } from '../adk/registry';

import {
  getRadarSnapshot,
  type RadarThreat,
} from '../aws/radar-snapshot';

// ============================================================
// CHAYRA AI 3.0 — DAILY RADAR INTELLIGENCE
// Live scanning is reserved for the scheduled Cron endpoint.
// Crisis requests consume the latest saved DynamoDB snapshot.
// ============================================================

const REQUEST_TIMEOUT_MS = 12_000;

const CONFLICT_REFERENCE_AREAS: RadarThreat[] = [
  {
    id: 'reference-ukraine',
    lat: 48.3794,
    lng: 31.1656,
    name: 'REFERENCE AREA: UKRAINE — static location, not a verified live alert',
    type: 'reference',
  },
  {
    id: 'reference-gaza',
    lat: 31.4167,
    lng: 34.3333,
    name: 'REFERENCE AREA: GAZA — static location, not a verified live alert',
    type: 'reference',
  },
  {
    id: 'reference-sudan',
    lat: 12.8628,
    lng: 30.2176,
    name: 'REFERENCE AREA: SUDAN — static location, not a verified live alert',
    type: 'reference',
  },
];

// ============================================================
// SHARED FETCH HELPER
// ============================================================

async function fetchJson(
  url: string,
): Promise<any> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(
        `Source returned HTTP ${response.status}`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// USGS EARTHQUAKE SCAN
// ============================================================

async function fetchUsgsThreats(): Promise<RadarThreat[]> {
  const url =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';

  const data = await fetchJson(url);

  const features = Array.isArray(data?.features)
    ? data.features
    : [];

  return features
    .filter((feature: any) => {
      const coordinates = feature?.geometry?.coordinates;

      return (
        Array.isArray(coordinates) &&
        Number.isFinite(coordinates[0]) &&
        Number.isFinite(coordinates[1]) &&
        Math.abs(coordinates[0]) <= 180 &&
        Math.abs(coordinates[1]) <= 90
      );
    })
    .slice(0, 10)
    .map((feature: any, index: number) => {
      const coordinates =
        feature.geometry.coordinates;

      const magnitude =
        feature.properties?.mag;

      const magnitudeLabel =
        typeof magnitude === 'number'
          ? `M${magnitude.toFixed(1)}`
          : 'MAGNITUDE UNKNOWN';

      return {
        id: String(
          feature.id || `usgs-${index}`,
        ),
        lat: coordinates[1],
        lng: coordinates[0],
        name:
          `USGS EARTHQUAKE ${magnitudeLabel}: ${
            feature.properties?.place || 'Location unavailable'
          }`,
        type: 'earthquake',
      };
    });
}

// ============================================================
// NASA EONET SCAN
// ============================================================

function classifyNasaEvent(category: string): string {
  const normalized = category.toLowerCase();

  if (
    normalized.includes('wildfire') ||
    normalized.includes('fire')
  ) {
    return 'fire';
  }

  if (
    normalized.includes('storm') ||
    normalized.includes('cyclone') ||
    normalized.includes('hurricane')
  ) {
    return 'storm';
  }

  if (normalized.includes('volcano')) {
    return 'volcano';
  }

  if (normalized.includes('flood')) {
    return 'flood';
  }

  return 'environmental';
}

async function fetchNasaThreats(): Promise<RadarThreat[]> {
  const url =
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20';

  const data = await fetchJson(url);

  const events = Array.isArray(data?.events)
    ? data.events
    : [];

  return events.flatMap((event: any) => {
    const geometries = Array.isArray(event?.geometry)
      ? event.geometry
      : [];

    // Use the most recent valid Point geometry.
    const geometry = geometries
      .slice()
      .reverse()
      .find((item: any) => {
        const coordinates = item?.coordinates;

        return (
          item?.type === 'Point' &&
          Array.isArray(coordinates) &&
          Number.isFinite(coordinates[0]) &&
          Number.isFinite(coordinates[1]) &&
          Math.abs(coordinates[0]) <= 180 &&
          Math.abs(coordinates[1]) <= 90
        );
      });

    // Do not invent coordinates for polygon or missing geometry.
    if (!geometry) {
      return [];
    }

    const category =
      event.categories?.[0]?.title || 'Environmental event';

    return [
      {
        id: `nasa-${event.id}`,
        lat: geometry.coordinates[1],
        lng: geometry.coordinates[0],
        name: `NASA EVENT: ${event.title || 'Unnamed event'}`,
        type: classifyNasaEvent(category),
      },
    ];
  });
}

// ============================================================
// LIVE SCAN — CRON ONLY
// ============================================================

export async function scanGlobalThreats(): Promise<RadarThreat[]> {
  console.log(
    '[Radar]: Scheduled scan started — NASA EONET + USGS.',
  );

  const [usgsResult, nasaResult] =
    await Promise.allSettled([
      fetchUsgsThreats(),
      fetchNasaThreats(),
    ]);

  const usgsAvailable =
    usgsResult.status === 'fulfilled';

  const nasaAvailable =
    nasaResult.status === 'fulfilled';

  // Never overwrite a good saved snapshot when both providers fail.
  if (!usgsAvailable && !nasaAvailable) {
    console.error(
      '[Radar]: Both external intelligence sources failed.',
    );

    throw new Error(
      'USGS and NASA radar sources are both unavailable.',
    );
  }

  if (!usgsAvailable) {
    console.warn(
      '[Radar]: USGS unavailable; saving partial NASA results.',
      usgsResult.reason,
    );
  }

  if (!nasaAvailable) {
    console.warn(
      '[Radar]: NASA unavailable; saving partial USGS results.',
      nasaResult.reason,
    );
  }

  const usgsThreats =
    usgsAvailable ? usgsResult.value : [];

  const nasaThreats =
    nasaAvailable ? nasaResult.value : [];

  const threats = [
    ...CONFLICT_REFERENCE_AREAS,
    ...usgsThreats,
    ...nasaThreats,
  ];

  console.log(
    `[Radar]: Scan complete. USGS=${usgsThreats.length}, NASA=${nasaThreats.length}, total=${threats.length}.`,
  );

  return threats;
}

// ============================================================
// FOREGROUND SWARM — SNAPSHOT CONSUMER ONLY
// ============================================================

async function runRadar(_data: { input: string }) {
  console.log(
    '[Radar]: Loading the latest saved global intelligence snapshot...',
  );

  try {
    const snapshot = await getRadarSnapshot();

    if (!snapshot) {
      return (
        'NO SAVED RADAR SNAPSHOT AVAILABLE. ' +
        'The daily scheduled scan has not completed yet.'
      );
    }

    const ageMs =
      Date.now() -
      new Date(snapshot.scannedAt).getTime();

    const ageHours =
      Number.isFinite(ageMs)
        ? Math.max(0, ageMs / 3_600_000)
        : null;

    const dynamicThreats =
      snapshot.threats.filter(
        (threat) => threat.type !== 'reference',
      );

    const nasaCount = dynamicThreats.filter(
  (threat) => threat.id.startsWith('nasa-'),
).length;

const usgsCount = dynamicThreats.filter(
  (threat) => threat.name.startsWith('USGS EARTHQUAKE'),
).length;

const sourceSummary =
  `Snapshot source records: NASA EONET: ${nasaCount}; USGS: ${usgsCount}.`;

if (dynamicThreats.length === 0) {
  return (
    `LATEST STORED RADAR SNAPSHOT: ${snapshot.scannedAt}. ` +
    `${sourceSummary} ` +
    'No qualifying NASA or USGS events were stored. ' +
    'This does not guarantee that no hazards exist.'
  );
}

const topThreats = dynamicThreats
  .slice(0, 5)
  .map((threat) => threat.name)
  .join(' | ');

return (
  `LATEST STORED RADAR SNAPSHOT: ${snapshot.scannedAt}. ` +
  `Snapshot age: ${
    ageHours === null ? 'unknown' : `${ageHours.toFixed(1)} hours`
  }. ` +
  `Recorded ${dynamicThreats.length} NASA/USGS event(s). ` +
  `${sourceSummary} Top events: ${topThreats}`
);

  } catch (error) {
    console.error(
      '[Radar]: DynamoDB snapshot retrieval failed.',
      error,
    );

    return (
      'RADAR SNAPSHOT TEMPORARILY UNAVAILABLE. ' +
      'No live scan was started during this crisis request.'
    );
  }
}

// ============================================================
// ENTERPRISE REGISTRATION
// ============================================================

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Radar',
    version: '3.0.0',
    role: 'Daily Snapshot Threat Intelligence',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runRadar,
);
