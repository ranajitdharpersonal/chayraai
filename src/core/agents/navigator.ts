import { EnterpriseAgentRegistry } from '../adk/registry';
import { generateText } from '../brain/brain';

// ============================================================
// TYPES
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
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string | undefined>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type OverpassEndpoint = {
  name: string;
  url: string;
};

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Configure one or more full Overpass interpreter URLs in .env.local:
 *
 * CHAYRA_OVERPASS_ENDPOINTS=https://your-provider.example/<key>/api/interpreter,https://overpass-api.de/api/interpreter
 *
 * A keyed provider should be placed first. Do not put API keys in source control.
 * The built-in public endpoints are best-effort and have no availability SLA.
 */
const DEFAULT_OVERPASS_ENDPOINTS: OverpassEndpoint[] = [
  {
    name: 'Overpass Main',
    url: 'https://overpass-api.de/api/interpreter',
  },
  {
    name: 'Overpass Maps Mail',
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  },
];

const SEARCH_RADIUS_METERS = 25_000;
const OVERPASS_QUERY_TIMEOUT_SECONDS = 12;
const DEFAULT_REQUEST_TIMEOUT_MS = 14_000;
const MIN_REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUEST_TIMEOUT_MS = 20_000;

function getRequestTimeoutMs(): number {
  const configured = Number(
    process.env.CHAYRA_OVERPASS_TIMEOUT_MS,
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.min(
    MAX_REQUEST_TIMEOUT_MS,
    Math.max(MIN_REQUEST_TIMEOUT_MS, Math.floor(configured)),
  );
}

function getOverpassEndpoints(): OverpassEndpoint[] {
  const configured = (
    process.env.CHAYRA_OVERPASS_ENDPOINTS ?? ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const candidates = [
    ...configured.map((url) => ({
      name: getEndpointName(url),
      url,
    })),
    ...DEFAULT_OVERPASS_ENDPOINTS,
  ];

  const seen = new Set<string>();
  const endpoints: OverpassEndpoint[] = [];

  for (const endpoint of candidates) {
    try {
      const parsed = new URL(endpoint.url);

      // Only HTTPS endpoints are accepted. This prevents accidental
      // transmission of location coordinates to an insecure HTTP host.
      if (parsed.protocol !== 'https:') {
        console.warn(
          `[Navigator]: Ignoring non-HTTPS Overpass endpoint: ${endpoint.url}`,
        );
        continue;
      }

      const normalizedUrl = parsed.toString();

      if (seen.has(normalizedUrl)) {
        continue;
      }

      seen.add(normalizedUrl);
      endpoints.push({
        name: endpoint.name,
        url: normalizedUrl,
      });
    } catch {
      console.warn(
        `[Navigator]: Ignoring invalid Overpass endpoint: ${endpoint.url}`,
      );
    }
  }

  return endpoints;
}

function getEndpointName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Configured Overpass endpoint';
  }
}

// ============================================================
// GEO HELPERS
// ============================================================

function haversineKm(a: LatLng, b: LatLng): number {
  const earthRadiusKm = 6371;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);

  const haversine =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return (
    2 *
    earthRadiusKm *
    Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

function isValidCoordinates(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const coords = value as Record<string, unknown>;

  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

function getElementCoords(element: OverpassElement): LatLng | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

function classifyFacility(
  tags: Record<string, string | undefined> | undefined,
): FacilityKind | null {
  if (!tags) {
    return null;
  }

  const amenity = tags.amenity?.toLowerCase();
  const healthcare = tags.healthcare?.toLowerCase();
  const military = tags.military?.toLowerCase();
  const building = tags.building?.toLowerCase();
  const socialFacility = tags.social_facility?.toLowerCase();

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
    building === 'bunker'
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

  if (name) {
    return name;
  }

  return kind === 'hospital'
    ? 'OSM-mapped Hospital / Clinic'
    : 'OSM-mapped Shelter / Bunker';
}

// ============================================================
// OVERPASS QUERY
// ============================================================

/**
 * One combined query retrieves both facility groups. The earlier version
 * sent separate hospital and bunker queries to every server and retried
 * each request twice, multiplying latency and load during an outage.
 */
function buildFacilityQuery(userCoords: LatLng): string {
  const lat = userCoords.lat.toFixed(6);
  const lng = userCoords.lng.toFixed(6);

  return `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  nwr["amenity"~"^(hospital|clinic|shelter)$"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["healthcare"~"^(hospital|clinic)$"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["social_facility"="shelter"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["military"="bunker"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  nwr["building"="bunker"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
);
out center tags;
`.trim();
}

// ============================================================
// OVERPASS REQUEST
// ============================================================

async function queryOverpassEndpoint(
  endpoint: OverpassEndpoint,
  query: string,
): Promise<
  | {
      ok: true;
      elements: OverpassElement[];
      endpointName: string;
    }
  | {
      ok: false;
      endpointName: string;
      status: number | null;
      error: string;
    }
> {
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent':
          'ChayRa-AI-Enterprise/3.0 (+https://github.com/ranajitdharpersonal/chayraai)',
      },
      body: new URLSearchParams({ data: query }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(getRequestTimeoutMs()),
    });

    if (!response.ok) {
      const statusText = response.statusText || 'Request failed';
      const error = `Overpass HTTP ${response.status} ${statusText}`;

      console.warn(
        `[Navigator]: ${endpoint.name} returned ${error}.`,
      );

      return {
        ok: false,
        endpointName: endpoint.name,
        status: response.status,
        error,
      };
    }

    let data: OverpassResponse;

    try {
      data = (await response.json()) as OverpassResponse;
    } catch {
      return {
        ok: false,
        endpointName: endpoint.name,
        status: response.status,
        error: 'Overpass returned an invalid JSON response.',
      };
    }

    return {
      ok: true,
      elements: Array.isArray(data?.elements) ? data.elements : [],
      endpointName: endpoint.name,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown network error';

    console.warn(
      `[Navigator]: ${endpoint.name} request failed: ${message}`,
    );

    return {
      ok: false,
      endpointName: endpoint.name,
      status: null,
      error: message,
    };
  }
}

// ============================================================
// FACILITY RESOLUTION
// ============================================================

function resolveNearestFacilities(
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

    if (!kind) {
      continue;
    }

    const coords = getElementCoords(element);

    if (!coords) {
      continue;
    }

    const distanceKm = haversineKm(userCoords, coords);

    if (distanceKm > SEARCH_RADIUS_METERS / 1000) {
      continue;
    }

    const identity =
      element.type && typeof element.id === 'number'
        ? `${element.type}/${element.id}`
        : `${kind}/${coords.lat.toFixed(6)}/${coords.lng.toFixed(6)}`;

    if (seen.has(identity)) {
      continue;
    }

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
    hospital: candidates.find((candidate) => candidate.kind === 'hospital') ?? null,
    bunker: candidates.find((candidate) => candidate.kind === 'bunker') ?? null,
  };
}

async function fetchNearestFacilities(
  userCoords: LatLng,
): Promise<FacilityLookupResult> {
  const endpoints = getOverpassEndpoints();
  const query = buildFacilityQuery(userCoords);

  console.log(
    `[Navigator]: Searching mapped hospitals, clinics, shelters and bunkers within ${SEARCH_RADIUS_METERS / 1000}km using one combined query...`,
  );

  if (!endpoints.length) {
    return {
      hospital: null,
      bunker: null,
      status: 'UNAVAILABLE',
      error: 'No valid HTTPS Overpass endpoint is configured.',
    };
  }

  let lastError = 'All configured Overpass endpoints failed.';

  // Try each endpoint once. Avoid repeated retries against an overloaded
  // public service; move to the next configured endpoint instead.
  for (const endpoint of endpoints) {
    console.log(
      `[Navigator]: Querying ${endpoint.name}...`,
    );

    const result = await queryOverpassEndpoint(endpoint, query);

    if (!result.ok) {
      lastError = result.error;
      continue;
    }

    const facilities = resolveNearestFacilities(
      result.elements,
      userCoords,
    );

    console.log(
      `[Navigator]: ${result.endpointName} responded. ` +
        `Mapped hospitals/clinics=${facilities.hospital ? 1 : 0}, ` +
        `mapped shelters/bunkers=${facilities.bunker ? 1 : 0}.`,
    );

    return {
      ...facilities,
      status:
        facilities.hospital || facilities.bunker
          ? 'VERIFIED'
          : 'NO_DATA',
      source: result.endpointName,
    };
  }

  console.error(
    '[Navigator]: All configured Overpass endpoints failed.',
  );

  return {
    hospital: null,
    bunker: null,
    status: 'UNAVAILABLE',
    error: lastError,
  };
}

// ============================================================
// PRIMARY DESTINATION DECISION
// ============================================================

function safePrimaryNeed(value: unknown): FacilityKind {
  return value === 'bunker' ? 'bunker' : 'hospital';
}

async function getPrimaryDecision(
  emergencyInput: string,
): Promise<{
  primaryNeed: FacilityKind;
  instruction: string;
}> {
  try {
    const prompt = `
You are the Navigator agent for a civilian emergency-response application.

Choose which mapped facility type should be presented as the primary option:
- hospital: injury, illness, fire injury, collapse, accident, trauma or poisoning
- bunker: immediate physical danger where a mapped shelter/bunker may be relevant

Emergency:
"${emergencyInput}"

Return ONLY valid JSON:
{
  "primaryNeed": "hospital" | "bunker",
  "instruction": "one concise safety instruction"
}
`;

    const text = (await generateText(prompt)) || '{}';
    const cleanJson = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanJson);

    return {
      primaryNeed: safePrimaryNeed(parsed?.primaryNeed),
      instruction:
        typeof parsed?.instruction === 'string' && parsed.instruction.trim()
          ? parsed.instruction.trim()
          : 'Follow local emergency-service instructions and use only a facility you can confirm is accessible.',
    };
  } catch (error) {
    console.warn(
      '[Navigator]: AI destination preference unavailable; using hospital as the default primary category.',
      error,
    );

    return {
      primaryNeed: 'hospital',
      instruction:
        'Follow local emergency-service instructions and use only a facility you can confirm is accessible.',
    };
  }
}

// ============================================================
// NAVIGATOR AGENT
// ============================================================

async function runNavigator(data: {
  input: string;
  userCoords?: LatLng;
}) {
  console.log(
    '[Navigator]: Starting combined real-world facility lookup...',
  );

  if (!isValidCoordinates(data.userCoords)) {
    console.warn(
      '[Navigator]: Valid user coordinates were not supplied to the agent.',
    );

    return {
      text:
        'Location coordinates are missing or invalid. Enable GPS or drop a map pin so ChayRa can search mapped facilities within 25km.',
      destCoords: null,
      isRealData: false,
      lookupStatus: 'UNAVAILABLE' as const,
      facility: null,
      hospital: null,
      bunker: null,
      userCoords: null,
    };
  }

  // Start the Bedrock preference decision and OSM lookup together.
  // The previous implementation waited for Bedrock before starting its
  // long series of external Overpass requests.
  const [decision, lookup] = await Promise.all([
    getPrimaryDecision(data.input),
    fetchNearestFacilities(data.userCoords),
  ]);

  const hospital = lookup.hospital;
  const bunker = lookup.bunker;

  const primary =
    decision.primaryNeed === 'bunker'
      ? bunker ?? hospital
      : hospital ?? bunker;

  if (!hospital && !bunker) {
    if (lookup.status === 'UNAVAILABLE') {
      return {
        text:
          'LIVE FACILITY LOOKUP UNAVAILABLE: ChayRa could not reach the configured OpenStreetMap facility-search service. No nearby facility could be verified in this request. Please retry or contact local emergency services; do not interpret this as proof that no hospital or shelter exists.',
        destCoords: null,
        isRealData: false,
        lookupStatus: 'UNAVAILABLE' as const,
        facility: null,
        hospital: null,
        bunker: null,
        userCoords: data.userCoords,
        lookupError: lookup.error ?? null,
      };
    }

    return {
      text:
        'NO MAPPED FACILITY FOUND: The OpenStreetMap query returned no tagged hospital, clinic, shelter or bunker within 25km. This does not prove that no facility exists. Contact local emergency services for current directions.',
      destCoords: null,
      isRealData: false,
      lookupStatus: 'NO_DATA' as const,
      facility: null,
      hospital: null,
      bunker: null,
      userCoords: data.userCoords,
    };
  }

  const alternative =
    primary?.kind === 'hospital' ? bunker : hospital;

  const primaryDescription = primary
    ? `Nearest mapped ${primary.kind}: ${primary.name} (${primary.distanceKm.toFixed(1)} km).`
    : 'No mapped facility was found for the preferred category.';

  const alternativeDescription = alternative
    ? ` Alternative mapped ${alternative.kind}: ${alternative.name} (${alternative.distanceKm.toFixed(1)} km).`
    : '';

  const disclaimer =
    ' OpenStreetMap data confirms only that the location is mapped; it does not confirm that the facility is open, accessible, staffed or safe right now. Follow official local emergency instructions.';

  return {
    text:
      `${primaryDescription}${alternativeDescription} ${decision.instruction}${disclaimer}`,
    destCoords: primary
      ? {
          lat: primary.lat,
          lng: primary.lng,
        }
      : null,
    isRealData: Boolean(primary),
    lookupStatus: 'VERIFIED' as const,
    facility: primary,
    hospital,
    bunker,
    userCoords: data.userCoords,
    lookupSource: lookup.source ?? null,
    verificationLevel: 'OSM_MAPPED_NOT_LIVE_VERIFIED' as const,
  };
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Navigator',
    version: '3.0.0',
    role: 'Tactical Routing',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_2',
  },
  runNavigator,
);
