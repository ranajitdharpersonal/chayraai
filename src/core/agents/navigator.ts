import {
  EnterpriseAgentRegistry,
  vertexAI,
} from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
});

type LatLng = {
  lat: number;
  lng: number;
};

type FacilityKind = 'hospital' | 'bunker';

type LookupStatus =
  | 'VERIFIED'
  | 'NO_DATA'
  | 'UNAVAILABLE';

type FacilityResult = {
  lat: number;
  lng: number;
  name: string;
  kind: FacilityKind;
  distanceKm: number;
  source: 'OpenStreetMap / Overpass';
};

type FacilityLookupResult = {
  facility: FacilityResult | null;
  status: LookupStatus;
  source?: string;
  error?: string;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: {
    name?: string;
    amenity?: string;
    military?: string;
  };
};

const OVERPASS_ENDPOINTS = [
  {
    name: 'Overpass Main',
    url: 'https://overpass-api.de/api/interpreter',
  },
  {
    name: 'Overpass Private Coffee',
    url: 'https://overpass.private.coffee/api/interpreter',
  },
  {
    name: 'Overpass Maps Mail',
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  },
] as const;

const MAX_ATTEMPTS_PER_ENDPOINT = 2;
const RETRY_DELAY_MS = 700;
const REQUEST_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function haversineKm(
  a: LatLng,
  b: LatLng,
): number {
  const R = 6371;
  const dLat =
    ((b.lat - a.lat) * Math.PI) / 180;
  const dLng =
    ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 =
    (a.lat * Math.PI) / 180;
  const lat2 =
    (b.lat * Math.PI) / 180;

  const sinLat =
    Math.sin(dLat / 2);
  const sinLng =
    Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) *
      Math.cos(lat2) *
      sinLng *
      sinLng;

  return (
    2 *
    R *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(h),
      ),
    )
  );
}

function getElementCoords(
  element: OverpassElement,
): LatLng | null {
  const lat =
    element.lat ??
    element.center?.lat;

  const lng =
    element.lon ??
    element.center?.lon;

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return { lat, lng };
}

function isTransientOverpassStatus(
  status: number,
): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function buildFacilityQuery(
  userCoords: LatLng,
  type: FacilityKind,
): string {
  return (
    type === 'hospital'
      ? `[out:json][timeout:20];(
           nwr["amenity"="hospital"](around:25000,${userCoords.lat},${userCoords.lng});
           nwr["amenity"="clinic"](around:25000,${userCoords.lat},${userCoords.lng});
         );out center tags;`
      : `[out:json][timeout:20];(
           nwr["military"="bunker"](around:25000,${userCoords.lat},${userCoords.lng});
           nwr["amenity"="shelter"](around:25000,${userCoords.lat},${userCoords.lng});
         );out center tags;`
  );
}

async function queryOverpassEndpoint(
  endpoint: {
    name: string;
    url: string;
  },
  query: string,
): Promise<
  | {
      ok: true;
      elements: OverpassElement[];
      endpointName: string;
    }
  | {
      ok: false;
      retryable: boolean;
      status: number | null;
      endpointName: string;
      error: string;
    }
> {
  const url =
    `${endpoint.url}?data=${encodeURIComponent(query)}`;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS_PER_ENDPOINT;
    attempt += 1
  ) {
    try {
      const response = await fetch(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'ChayRa-AI-Enterprise/3.0 (Hackathon)',
          },
          signal:
            AbortSignal.timeout(
              REQUEST_TIMEOUT_MS,
            ),
        },
      );

      if (response.ok) {
        const data =
          await response.json();

        const elements: OverpassElement[] =
          Array.isArray(
            data?.elements,
          )
            ? data.elements
            : [];

        return {
          ok: true,
          elements,
          endpointName:
            endpoint.name,
        };
      }

      const retryable =
        isTransientOverpassStatus(
          response.status,
        );

      console.warn(
        `[Navigator]: ${endpoint.name} returned HTTP ${response.status} on attempt ${attempt}/${MAX_ATTEMPTS_PER_ENDPOINT}.`,
      );

      if (
        retryable &&
        attempt < MAX_ATTEMPTS_PER_ENDPOINT
      ) {
        await sleep(
          RETRY_DELAY_MS,
        );
        continue;
      }

      return {
        ok: false,
        retryable,
        status: response.status,
        endpointName:
          endpoint.name,
        error:
          `Overpass returned HTTP ${response.status}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Overpass request error';

      console.warn(
        `[Navigator]: ${endpoint.name} request failed on attempt ${attempt}/${MAX_ATTEMPTS_PER_ENDPOINT}: ${message}`,
      );

      if (
        attempt <
        MAX_ATTEMPTS_PER_ENDPOINT
      ) {
        await sleep(
          RETRY_DELAY_MS,
        );
        continue;
      }

      return {
        ok: false,
        retryable: true,
        status: null,
        endpointName:
          endpoint.name,
        error: message,
      };
    }
  }

  return {
    ok: false,
    retryable: true,
    status: null,
    endpointName:
      endpoint.name,
    error:
      'Overpass lookup exhausted its retry budget.',
  };
}

async function fetchNearestFacility(
  userCoords: LatLng,
  type: FacilityKind,
): Promise<FacilityLookupResult> {
  const query =
    buildFacilityQuery(
      userCoords,
      type,
    );

  console.log(
    `[Navigator]: Searching ${type} facilities within 25km...`,
  );

  let sawSuccessfulEndpoint =
    false;

  let lastError =
    'All Overpass endpoints failed.';

  for (
    const endpoint of OVERPASS_ENDPOINTS
  ) {
    const result =
      await queryOverpassEndpoint(
        endpoint,
        query,
      );

    if (!result.ok) {
      lastError =
        result.error;

      console.warn(
        `[Navigator]: ${type} lookup unavailable via ${result.endpointName}. Trying next endpoint.`,
      );

      continue;
    }

    sawSuccessfulEndpoint = true;

    const candidates =
      result.elements
        .map((element) => {
          const coords =
            getElementCoords(
              element,
            );

          if (!coords) {
            return null;
          }

          const distanceKm =
            haversineKm(
              userCoords,
              coords,
            );

          if (
            distanceKm > 25
          ) {
            return null;
          }

          return {
            lat: coords.lat,
            lng: coords.lng,
            name:
              element.tags?.name?.trim() ||
              (type === 'hospital'
                ? 'Nearest Hospital / Clinic'
                : 'Nearest Shelter / Bunker'),
            kind: type,
            distanceKm,
            source:
              'OpenStreetMap / Overpass' as const,
          };
        })
        .filter(
          (
            value,
          ): value is FacilityResult =>
            value !== null,
        )
        .sort(
          (a, b) =>
            a.distanceKm -
            b.distanceKm,
        );

    const nearest =
      candidates[0] ?? null;

    if (nearest) {
      console.log(
        `[Navigator]: ${type} → ${nearest.name} (${nearest.distanceKm.toFixed(
          2,
        )} km) via ${result.endpointName}`,
      );

      return {
        facility: nearest,
        status: 'VERIFIED',
        source:
          result.endpointName,
      };
    }

    // IMPORTANT:
    // A successful Overpass response with zero candidates
    // means "no verified facility found", not "lookup failed".
    console.log(
      `[Navigator]: No verified ${type} facility found within 25km via ${result.endpointName}.`,
    );

    return {
      facility: null,
      status: 'NO_DATA',
      source:
        result.endpointName,
    };
  }

  if (!sawSuccessfulEndpoint) {
    console.error(
      `[Navigator]: ${type} lookup unavailable across all Overpass endpoints.`,
    );

    return {
      facility: null,
      status: 'UNAVAILABLE',
      error: lastError,
    };
  }

  return {
    facility: null,
    status: 'NO_DATA',
  };
}

function safePrimaryNeed(
  value: unknown,
): FacilityKind {
  return value === 'bunker'
    ? 'bunker'
    : 'hospital';
}

async function getPrimaryDecision(
  emergencyInput: string,
): Promise<{
  primaryNeed: FacilityKind;
  instruction: string;
}> {
  try {
    const prompt = `
You are the Navigator Agent in a crisis rescue system.

Choose the preferred destination type:
- hospital = medical injury, fire injury, collapse, accident, trauma, poisoning, sick person
- bunker = active violence, explosion, armed threat, bombardment, structural danger, unsafe area

Emergency:
"${emergencyInput}"

Return ONLY valid JSON:
{
  "primaryNeed": "hospital" | "bunker",
  "instruction": "one concise rescue instruction"
}
`;

    const resp =
      await generativeModel.generateContent(
        prompt,
      );

    const text =
      resp.response.candidates?.[0]?.content?.parts?.[0]?.text ||
      '{}';

    const cleanJson =
      text
        .replace(
          /```json/g,
          '',
        )
        .replace(
          /```/g,
          '',
        )
        .trim();

    const parsed =
      JSON.parse(cleanJson);

    return {
      primaryNeed:
        safePrimaryNeed(
          parsed?.primaryNeed,
        ),
      instruction:
        typeof parsed?.instruction ===
          'string' &&
        parsed.instruction.trim()
          ? parsed.instruction.trim()
          : 'Move toward the nearest verified safe facility.',
    };
  } catch (error) {
    console.warn(
      '[Navigator]: AI destination decision unavailable; continuing with verified facility search.',
      error,
    );

    return {
      primaryNeed:
        'hospital',
      instruction:
        'Move toward the nearest verified safe facility.',
    };
  }
}

async function runNavigator(
  data: {
    input: string;
    userCoords?: LatLng;
  },
) {
  console.log(
    '[Navigator]: Executing DUAL-SCAN for real-world safe zones...',
  );

  if (!data.userCoords) {
    return {
      text:
        'SYSTEM WARNING: User coordinates are missing. Enable GPS or drop a tactical pin so ChayRa can search verified facilities within 25km.',
      destCoords: null,
      isRealData: false,
      lookupStatus:
        'UNAVAILABLE' as const,
      facility: null,
      hospital: null,
      bunker: null,
    };
  }

  try {
    const decision =
      await getPrimaryDecision(
        data.input,
      );

    // Preserve the existing parallel dual-scan behavior.
    const [
      hospitalLookup,
      bunkerLookup,
    ] = await Promise.all([
      fetchNearestFacility(
        data.userCoords,
        'hospital',
      ),
      fetchNearestFacility(
        data.userCoords,
        'bunker',
      ),
    ]);

    const hospital =
      hospitalLookup.facility;

    const bunker =
      bunkerLookup.facility;

    const primary =
      decision.primaryNeed === 'bunker'
        ? bunker ?? hospital
        : hospital ?? bunker;

    const anyUnavailable =
      hospitalLookup.status ===
        'UNAVAILABLE' ||
      bunkerLookup.status ===
        'UNAVAILABLE';

    if (
      hospital &&
      bunker &&
      primary
    ) {
      const alternative =
        primary.kind === 'hospital'
          ? bunker
          : hospital;

      return {
        text:
          `Verified nearest ${primary.kind}: ${primary.name} (${primary.distanceKm.toFixed(
            1,
          )} km). ` +
          `Alternative ${alternative.kind}: ${alternative.name} (${alternative.distanceKm.toFixed(
            1,
          )} km). ${decision.instruction}`,
        destCoords: {
          lat: primary.lat,
          lng: primary.lng,
        },
        isRealData: true,
        lookupStatus:
          'VERIFIED' as const,
        facility: primary,
        hospital,
        bunker,
      };
    }

    if (primary) {
      return {
        text:
          `Verified ${primary.kind} found within 25km: ${primary.name} (${primary.distanceKm.toFixed(
            1,
          )} km). ${decision.instruction}`,
        destCoords: {
          lat: primary.lat,
          lng: primary.lng,
        },
        isRealData: true,
        lookupStatus:
          'VERIFIED' as const,
        facility: primary,
        hospital,
        bunker,
      };
    }

    // IMPORTANT:
    // Do not claim "no facility exists" when an upstream
    // Overpass service failed.
    if (anyUnavailable) {
      return {
        text:
          'LIVE FACILITY LOOKUP TEMPORARILY UNAVAILABLE: ChayRa could not verify hospitals, clinics, shelters or bunkers from the external OpenStreetMap service right now. Please retry shortly; do not treat this as proof that no facility exists.',
        destCoords: null,
        isRealData: false,
        lookupStatus:
          'UNAVAILABLE' as const,
        facility: null,
        hospital,
        bunker,
      };
    }

    // Only reach this branch when the external lookup
    // successfully responded but returned no matching facility.
    return {
      text:
        'No verified hospital, clinic, shelter or bunker was found within 25km of your pinned location. Do not move blindly; seek the safest available hard cover and conserve battery.',
      destCoords: null,
      isRealData: false,
      lookupStatus:
        'NO_DATA' as const,
      facility: null,
      hospital,
      bunker,
    };
  } catch (error) {
    console.error(
      '[Navigator]: Routing failed.',
      error,
    );

    return {
      text:
        'SYSTEM WARNING: Safe-zone lookup is temporarily unavailable. Do not rely on an unverified location; seek immediate hard cover and await rescue guidance.',
      destCoords: null,
      isRealData: false,
      lookupStatus:
        'UNAVAILABLE' as const,
      facility: null,
      hospital: null,
      bunker: null,
    };
  }
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