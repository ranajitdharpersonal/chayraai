import { EnterpriseAgentRegistry } from '../adk/registry';

// ============================================================
// CHAYRA AI — NAVIGATOR 3.2
// Free-first Overpass provider strategy:
//   1. overpass.ch when an optional free API key is configured
//   2. Anonymous public Overpass instances as fallbacks
//   3. OSRM road routing, with an explicitly labelled straight-line fallback
// ============================================================

type LatLng = {
  lat: number;
  lng: number;
};

type FacilityKind = 'hospital' | 'bunker';
type LookupStatus = 'VERIFIED' | 'NO_DATA' | 'UNAVAILABLE';

type FacilityResult = {
  lat: number;
  lng: number;
  name: string;
  kind: FacilityKind;
  distanceKm: number;
  source: 'OpenStreetMap / Overpass';
  osmType?: string;
  osmId?: number;
};

type RouteResult = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number | null;
  routeType: 'ROAD_ROUTE' | 'STRAIGHT_LINE_ESTIMATE';
  source: string;
};

type FacilityLookupResult = {
  hospital: FacilityResult | null;
  bunker: FacilityResult | null;
  status: LookupStatus;
  source?: string;
  error?: string;
};

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type OverpassEndpoint = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

type CachedLookup = {
  expiresAt: number;
  value: FacilityLookupResult;
};

// ============================================================
// CONFIGURATION
// ============================================================

const SEARCH_RADIUS_METERS = 25_000;
const OVERPASS_QUERY_TIMEOUT_SECONDS = 18;
const OVERPASS_REQUEST_TIMEOUT_MS = 22_000;
const ROUTING_TIMEOUT_MS = 9_000;
const LOOKUP_CACHE_TTL_MS = 60_000;
const MAX_LOOKUP_CACHE_ENTRIES = 300;

// Optional. This is a FREE-plan key from overpass.ch, not a paid-only key.
// Keep it server-side in .env.local; never use NEXT_PUBLIC_ here.
const OVERPASS_CH_API_KEY = (
  process.env.CHAYRA_OVERPASS_API_KEY ?? ''
).trim();

const DEFAULT_PUBLIC_ENDPOINTS: OverpassEndpoint[] = [
  {
    name: 'Overpass Main',
    url: 'https://overpass-api.de/api/interpreter',
  },
  {
    name: 'Private Coffee Overpass',
    url: 'https://overpass.private.coffee/api/interpreter',
  },
  {
    name: 'Maps Mail Overpass',
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  },
];

const lookupCache = new Map<string, CachedLookup>();
const lookupInFlight = new Map<string, Promise<FacilityLookupResult>>();

// ============================================================
// GEO HELPERS
// ============================================================

function isValidCoordinates(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;

  const coords = value as Record<string, unknown>;
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 && coords.lat <= 90 &&
    coords.lng >= -180 && coords.lng <= 180
  );
}

function haversineKm(a: LatLng, b: LatLng): number {
  const radius = 6371;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function getElementCoords(element: OverpassElement): LatLng | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

// ============================================================
// FACILITY CLASSIFICATION
// ============================================================

function classifyFacility(
  tags: Record<string, string | undefined> | undefined,
): FacilityKind | null {
  if (!tags) return null;

  const amenity = tags.amenity?.toLowerCase();
  const healthcare = tags.healthcare?.toLowerCase();
  const military = tags.military?.toLowerCase();
  const building = tags.building?.toLowerCase();
  const socialFacility = tags.social_facility?.toLowerCase();
  const emergency = tags.emergency?.toLowerCase();

  if (
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    healthcare === 'hospital' ||
    healthcare === 'clinic'
  ) {
    return 'hospital';
  }

  if (
    amenity === 'shelter' ||
    socialFacility === 'shelter' ||
    military === 'bunker' ||
    building === 'bunker' ||
    emergency === 'shelter'
  ) {
    return 'bunker';
  }

  return null;
}

function getFacilityName(
  element: OverpassElement,
  kind: FacilityKind,
): string {
  const name = element.tags?.name?.trim();
  if (name) return name;

  return kind === 'hospital'
    ? 'OSM-mapped Hospital / Clinic'
    : 'OSM-mapped Shelter / Bunker';
}

// ============================================================
// ENDPOINT RESOLUTION
// ============================================================

function getOverpassEndpoints(): OverpassEndpoint[] {
  const endpoints: OverpassEndpoint[] = [];

  // overpass.ch runs the standard Overpass API. Its free plan
  // requires an API key, sent in a header to avoid putting it in URLs.
  if (OVERPASS_CH_API_KEY) {
    endpoints.push({
      name: 'Overpass.ch (keyed free plan)',
      url: 'https://api.overpass.ch/v1/interpreter',
      headers: {
        'X-API-Key': OVERPASS_CH_API_KEY,
      },
    });
  }

  // Optional custom anonymous endpoint URLs, comma-separated.
  const configured = (process.env.CHAYRA_OVERPASS_ENDPOINTS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  for (const rawUrl of configured) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') continue;

      endpoints.push({
        name: 'Configured public Overpass',
        url: parsed.toString(),
      });
    } catch {
      console.warn('[Navigator]: Ignoring invalid custom Overpass URL.');
    }
  }

  endpoints.push(...DEFAULT_PUBLIC_ENDPOINTS);

  const seen = new Set<string>();
  return endpoints.filter(endpoint => {
    if (seen.has(endpoint.url)) return false;
    seen.add(endpoint.url);
    return true;
  });
}

// ============================================================
// COMBINED OVERPASS QUERY
// ============================================================

function buildFacilityQuery(coords: LatLng): string {
  const lat = coords.lat.toFixed(6);
  const lng = coords.lng.toFixed(6);

  // One request discovers both facility categories. This keeps
  // request volume lower and works with one-query-at-a-time plans.
  return `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  nwr["amenity"~"^(hospital|clinic|shelter)$"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["healthcare"~"^(hospital|clinic)$"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["social_facility"="shelter"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["emergency"="shelter"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["military"="bunker"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["building"="bunker"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
);
out center tags;
`.trim();
}

// ============================================================
// OVERPASS REQUEST
// ============================================================

async function queryEndpoint(
  endpoint: OverpassEndpoint,
  query: string,
): Promise<OverpassElement[] | null> {
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent':
          'ChayRa-AI/3.2 (+https://github.com/ranajitdharpersonal/chayraai)',
        ...endpoint.headers,
      },
      body: new URLSearchParams({ data: query }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(OVERPASS_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        // Ignore unreadable error body.
      }

      console.warn(
        `[Navigator]: ${endpoint.name} HTTP ${response.status}. ${detail}`,
      );
      return null;
    }

    const data = await response.json() as OverpassResponse;
    if (!Array.isArray(data.elements)) {
      console.warn(`[Navigator]: ${endpoint.name} returned an invalid response.`);
      return null;
    }

    return data.elements;
  } catch (error) {
    console.warn(
      `[Navigator]: ${endpoint.name} request failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ============================================================
// RESULT RESOLUTION
// ============================================================

function resolveFacilities(
  elements: OverpassElement[],
  userCoords: LatLng,
): {
  hospital: FacilityResult | null;
  bunker: FacilityResult | null;
} {
  const candidates: FacilityResult[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    const kind = classifyFacility(element.tags);
    if (!kind) continue;

    const coords = getElementCoords(element);
    if (!coords) continue;

    const distanceKm = haversineKm(userCoords, coords);
    if (distanceKm > SEARCH_RADIUS_METERS / 1000) continue;

    const identity =
      element.type && typeof element.id === 'number'
        ? `${element.type}/${element.id}`
        : `${kind}/${coords.lat}/${coords.lng}`;

    if (seen.has(identity)) continue;
    seen.add(identity);

    candidates.push({
      lat: coords.lat,
      lng: coords.lng,
      name: getFacilityName(element, kind),
      kind,
      distanceKm,
      source: 'OpenStreetMap / Overpass',
      osmType: element.type,
      osmId: element.id,
    });
  }

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    hospital: candidates.find(item => item.kind === 'hospital') ?? null,
    bunker: candidates.find(item => item.kind === 'bunker') ?? null,
  };
}

function refreshCachedDistances(
  result: FacilityLookupResult,
  userCoords: LatLng,
): FacilityLookupResult {
  const refresh = (facility: FacilityResult | null) =>
    facility
      ? {
          ...facility,
          distanceKm: haversineKm(userCoords, facility),
        }
      : null;

  return {
    ...result,
    hospital: refresh(result.hospital),
    bunker: refresh(result.bunker),
  };
}

function pruneLookupCache(): void {
  const now = Date.now();

  for (const [key, value] of lookupCache.entries()) {
    if (value.expiresAt <= now) lookupCache.delete(key);
  }

  while (lookupCache.size > MAX_LOOKUP_CACHE_ENTRIES) {
    const oldestKey = lookupCache.keys().next().value;
    if (!oldestKey) break;
    lookupCache.delete(oldestKey);
  }
}

async function performFacilityLookup(
  userCoords: LatLng,
): Promise<FacilityLookupResult> {
  const endpoints = getOverpassEndpoints();
  const query = buildFacilityQuery(userCoords);

  console.log(
    `[Navigator]: Searching hospitals, clinics, shelters and bunkers within ${SEARCH_RADIUS_METERS / 1000}km.`,
  );

  if (!endpoints.length) {
    return {
      hospital: null,
      bunker: null,
      status: 'UNAVAILABLE',
      error: 'No valid Overpass endpoints are configured.',
    };
  }

  let successfulResponses = 0;
  const failedEndpoints: string[] = [];

  for (const endpoint of endpoints) {
    console.log(`[Navigator]: Querying ${endpoint.name}...`);

    const elements = await queryEndpoint(endpoint, query);
    if (elements === null) {
      failedEndpoints.push(endpoint.name);
      continue;
    }

    successfulResponses += 1;
    const facilities = resolveFacilities(elements, userCoords);

    console.log(
      `[Navigator]: ${endpoint.name} returned ${elements.length} OSM elements. ` +
      `Hospital=${Boolean(facilities.hospital)}, Shelter/Bunker=${Boolean(facilities.bunker)}.`,
    );

    if (facilities.hospital || facilities.bunker) {
      return {
        ...facilities,
        status: 'VERIFIED',
        source: endpoint.name,
      };
    }

    // Do not stop on a valid-but-empty answer. A later public
    // instance may have a more complete or fresher regional extract.
  }

  if (successfulResponses === endpoints.length) {
    return {
      hospital: null,
      bunker: null,
      status: 'NO_DATA',
      error: 'All reachable Overpass endpoints returned no matching facilities.',
    };
  }

  return {
    hospital: null,
    bunker: null,
    status: 'UNAVAILABLE',
    error:
      `Facility lookup incomplete. Successful endpoints: ${successfulResponses}/${endpoints.length}. Failed: ${failedEndpoints.join(', ') || 'unknown'}.`,
  };
}

async function fetchNearestFacilities(
  userCoords: LatLng,
): Promise<FacilityLookupResult> {
  pruneLookupCache();

  // Five decimal places are roughly metre-scale. This avoids
  // reusing a result for a materially different nearby location.
  const cacheKey =
    `${userCoords.lat.toFixed(5)}:${userCoords.lng.toFixed(5)}`;

  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('[Navigator]: Reusing recent facility lookup cache.');
    return refreshCachedDistances(cached.value, userCoords);
  }

  const pending = lookupInFlight.get(cacheKey);
  if (pending) {
    console.log('[Navigator]: Joining in-flight facility lookup.');
    return refreshCachedDistances(await pending, userCoords);
  }

  const request = performFacilityLookup(userCoords);
  lookupInFlight.set(cacheKey, request);

  try {
    const result = await request;

    // Cache only results from a successful facility discovery.
    // Do not cache outages or timeouts as if they were valid data.
    if (result.status === 'VERIFIED') {
      lookupCache.set(cacheKey, {
        expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS,
        value: result,
      });
    }

    return result;
  } finally {
    lookupInFlight.delete(cacheKey);
    pruneLookupCache();
  }
}

// ============================================================
// OSRM ROAD ROUTING
// ============================================================

function getDirectLine(
  origin: LatLng,
  destination: LatLng,
): RouteResult {
  return {
    coordinates: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    distanceMeters: haversineKm(origin, destination) * 1000,
    durationSeconds: null,
    routeType: 'STRAIGHT_LINE_ESTIMATE',
    source: 'Geodesic estimate — not a road route',
  };
}

async function getRoadRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteResult> {
  const baseUrl = (
    process.env.CHAYRA_ROUTING_URL ||
    'https://router.project-osrm.org'
  ).replace(/\/+$/, '');

  const coordinates =
    `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;

  const url =
    `${baseUrl}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&steps=false';

  try {
    console.log('[Navigator]: Requesting road route from OSRM...');

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    const data = await response.json();
    const route = data?.routes?.[0];
    const rawCoordinates = route?.geometry?.coordinates;

    if (
      data?.code !== 'Ok' ||
      !Array.isArray(rawCoordinates) ||
      rawCoordinates.length < 2
    ) {
      throw new Error('OSRM did not return valid road geometry.');
    }

    const points: [number, number][] = rawCoordinates
      .map((point: unknown) => {
        if (
          !Array.isArray(point) ||
          typeof point[0] !== 'number' ||
          typeof point[1] !== 'number' ||
          !Number.isFinite(point[0]) ||
          !Number.isFinite(point[1]) ||
          Math.abs(point[1]) > 90 ||
          Math.abs(point[0]) > 180
        ) {
          return null;
        }

        // GeoJSON is [longitude, latitude]; Leaflet is [latitude, longitude].
        return [point[1], point[0]] as [number, number];
      })
      .filter(
        (point: [number, number] | null): point is [number, number] =>
          point !== null,
      )
      .slice(0, 3000);

    if (points.length < 2) {
      throw new Error('OSRM geometry contained too few valid points.');
    }

    return {
      coordinates: points,
      distanceMeters:
        typeof route.distance === 'number' && Number.isFinite(route.distance)
          ? route.distance
          : 0,
      durationSeconds:
        typeof route.duration === 'number' && Number.isFinite(route.duration)
          ? route.duration
          : null,
      routeType: 'ROAD_ROUTE',
      source: 'OpenStreetMap road network / OSRM',
    };
  } catch (error) {
    console.warn(
      '[Navigator]: Road routing unavailable; using a straight-line estimate.',
      error instanceof Error ? error.message : error,
    );

    return getDirectLine(origin, destination);
  }
}

// ============================================================
// PRIMARY DESTINATION PREFERENCE
// ============================================================

function getPrimaryNeed(input: string): FacilityKind {
  const shelterKeywords =
    /\b(air raid|airstrike|bombing|missile|shelling|gunfire|shooting|crossfire|armed attack|war zone|explosion|incoming attack|bunker|shelter)\b/i;

  return shelterKeywords.test(input)
    ? 'bunker'
    : 'hospital';
}

// ============================================================
// NAVIGATOR AGENT
// ============================================================

async function runNavigator(data: {
  input: string;
  userCoords?: LatLng;
}) {
  console.log('[Navigator]: Starting facility discovery and road routing...');

  if (!isValidCoordinates(data.userCoords)) {
    return {
      text: 'Location is missing or invalid. Enable GPS or drop a tactical map pin.',
      destCoords: null,
      isRealData: false,
      lookupStatus: 'UNAVAILABLE' as const,
      facility: null,
      hospital: null,
      bunker: null,
      facilities: { hospital: null, bunker: null },
      routes: { hospital: null, bunker: null },
      userCoords: null,
    };
  }

  const userCoords = data.userCoords;
  const lookup = await fetchNearestFacilities(userCoords);
  const hospital = lookup.hospital;
  const bunker = lookup.bunker;

  if (!hospital && !bunker) {
    const message = lookup.status === 'UNAVAILABLE'
      ? 'FACILITY SEARCH UNAVAILABLE: The configured OpenStreetMap services could not be reached. No nearby facility could be verified in this request.'
      : 'NO MAPPED FACILITY FOUND: Reachable OpenStreetMap services returned no tagged hospital, clinic, shelter or bunker within 25km. This does not prove that none exists.';

    console.warn(`[Navigator]: ${message}`);

    return {
      text: `${message} Contact local emergency services for current assistance.`,
      destCoords: null,
      isRealData: false,
      lookupStatus: lookup.status,
      facility: null,
      hospital: null,
      bunker: null,
      facilities: { hospital: null, bunker: null },
      routes: { hospital: null, bunker: null },
      userCoords,
      lookupError: lookup.error ?? null,
      lookupSource: lookup.source ?? null,
    };
  }

  const primaryNeed = getPrimaryNeed(data.input || '');
  const primary = primaryNeed === 'bunker'
    ? bunker ?? hospital
    : hospital ?? bunker;

  const [hospitalRoute, bunkerRoute] = await Promise.all([
    hospital
      ? getRoadRoute(userCoords, hospital)
      : Promise.resolve(null),
    bunker
      ? getRoadRoute(userCoords, bunker)
      : Promise.resolve(null),
  ]);

  const alternative = primary?.kind === 'hospital'
    ? bunker
    : hospital;

  const primaryRoute = primary?.kind === 'hospital'
    ? hospitalRoute
    : bunkerRoute;

  const primaryDescription = primary
    ? `Nearest mapped ${primary.kind}: ${primary.name}, ${primary.distanceKm.toFixed(1)}km away.`
    : 'No preferred facility was mapped.';

  const alternativeDescription = alternative
    ? ` Alternative: ${alternative.name}, ${alternative.distanceKm.toFixed(1)}km away.`
    : '';

  const routeDescription = primaryRoute?.routeType === 'ROAD_ROUTE'
    ? ` Road route distance: ${(primaryRoute.distanceMeters / 1000).toFixed(1)}km.`
    : primaryRoute
      ? ' Only a straight-line distance estimate is available; no road route was returned.'
      : ' Road routing unavailable.';

  const disclaimer =
    ' OpenStreetMap mapping does not confirm current opening hours, staffing, accessibility or physical safety. Follow official emergency instructions.';

  console.log('[Navigator]: Facility discovery completed.', {
    provider: lookup.source ?? 'unknown',
    hospitalFound: Boolean(hospital),
    shelterFound: Boolean(bunker),
    hospitalRoute: hospitalRoute?.routeType ?? 'UNAVAILABLE',
    shelterRoute: bunkerRoute?.routeType ?? 'UNAVAILABLE',
    lookupStatus: lookup.status,
  });

  return {
    text: `${primaryDescription}${alternativeDescription}${routeDescription}${disclaimer}`,
    destCoords: primary
      ? { lat: primary.lat, lng: primary.lng }
      : null,
    isRealData: Boolean(primary),
    lookupStatus: lookup.status,
    facility: primary,
    hospital,
    bunker,
    facilities: { hospital, bunker },
    routes: {
      hospital: hospitalRoute,
      bunker: bunkerRoute,
    },
    userCoords,
    primaryNeed,
    primaryKind: primary?.kind ?? null,
    lookupSource: lookup.source ?? null,
    verificationLevel: 'OSM_MAPPED_NOT_LIVE_VERIFIED' as const,
  };
}

// ============================================================
// ENTERPRISE REGISTRATION
// ============================================================

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Navigator',
    version: '3.2.0',
    role: 'Tactical Routing',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_2',
  },
  runNavigator,
);
