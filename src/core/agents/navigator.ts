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

type FacilityResult = {
  lat: number;
  lng: number;
  name: string;
  kind: 'hospital' | 'bunker';
  distanceKm: number;
  source: 'OpenStreetMap / Overpass';
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

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function getElementCoords(
  element: OverpassElement,
): LatLng | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

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

async function fetchNearestFacility(
  userCoords: LatLng,
  type: 'hospital' | 'bunker',
): Promise<FacilityResult | null> {
  const query =
    type === 'hospital'
      ? `[out:json][timeout:20];(
           nwr["amenity"="hospital"](around:25000,${userCoords.lat},${userCoords.lng});
           nwr["amenity"="clinic"](around:25000,${userCoords.lat},${userCoords.lng});
         );out center tags;`
      : `[out:json][timeout:20];(
           nwr["military"="bunker"](around:25000,${userCoords.lat},${userCoords.lng});
           nwr["amenity"="shelter"](around:25000,${userCoords.lat},${userCoords.lng});
         );out center tags;`;

  const url =
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    console.log(
      `[Navigator]: Searching ${type} facilities within 25km...`,
    );

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'ChayRa-AI-Enterprise/3.0 (Hackathon)',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.error(
        `[Navigator]: Overpass ${type} returned HTTP ${response.status}`,
      );
      return null;
    }

    const data = await response.json();

    const elements: OverpassElement[] =
      Array.isArray(data?.elements)
        ? data.elements
        : [];

    const candidates = elements
      .map((element) => {
        const coords = getElementCoords(element);
        if (!coords) return null;

        const distanceKm = haversineKm(
          userCoords,
          coords,
        );

        if (distanceKm > 25) return null;

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
        (value): value is FacilityResult =>
          value !== null,
      )
      .sort(
        (a, b) => a.distanceKm - b.distanceKm,
      );

    const nearest = candidates[0] ?? null;

    if (nearest) {
      console.log(
        `[Navigator]: ${type} → ${nearest.name} (${nearest.distanceKm.toFixed(
          2,
        )} km)`,
      );
    } else {
      console.log(
        `[Navigator]: No verified ${type} facility found within 25km.`,
      );
    }

    return nearest;
  } catch (error) {
    console.error(
      `[Navigator]: ${type} facility lookup failed.`,
      error,
    );
    return null;
  }
}

function safePrimaryNeed(
  value: unknown,
): 'hospital' | 'bunker' {
  return value === 'bunker'
    ? 'bunker'
    : 'hospital';
}

async function getPrimaryDecision(
  emergencyInput: string,
): Promise<{
  primaryNeed: 'hospital' | 'bunker';
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
      await generativeModel.generateContent(prompt);

    const text =
      resp.response.candidates?.[0]?.content?.parts?.[0]?.text ||
      '{}';

    const cleanJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanJson);

    return {
      primaryNeed: safePrimaryNeed(parsed?.primaryNeed),
      instruction:
        typeof parsed?.instruction === 'string' &&
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
      primaryNeed: 'hospital',
      instruction:
        'Move toward the nearest verified safe facility.',
    };
  }
}

async function runNavigator(data: {
  input: string;
  userCoords?: LatLng;
}) {
  console.log(
    '[Navigator]: Executing DUAL-SCAN for real-world safe zones...',
  );

  if (!data.userCoords) {
    return {
      text:
        'SYSTEM WARNING: User coordinates are missing. Enable GPS or drop a tactical pin so ChayRa can search verified facilities within 25km.',
      destCoords: null,
      isRealData: false,
      facility: null,
      hospital: null,
      bunker: null,
    };
  }

  try {
    const decision = await getPrimaryDecision(
      data.input,
    );

    const [hospital, bunker] =
      await Promise.all([
        fetchNearestFacility(
          data.userCoords,
          'hospital',
        ),
        fetchNearestFacility(
          data.userCoords,
          'bunker',
        ),
      ]);

    const primary =
      decision.primaryNeed === 'bunker'
        ? bunker ?? hospital
        : hospital ?? bunker;

    if (hospital && bunker && primary) {
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
        facility: primary,
        hospital,
        bunker,
      };
    }

    return {
      text:
        'No verified hospital, clinic, shelter or bunker was found within 25km of your pinned location. Do not move blindly; seek the safest available hard cover and conserve battery.',
      destCoords: null,
      isRealData: false,
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