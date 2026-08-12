import {
  EnterpriseAgentRegistry,
  vertexAI,
} from '../adk/registry';

import {
  PredictiveMemoryBank,
} from '../adk/memory';

const generativeModel =
  vertexAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
  });

// ============================================================
// PUBLIC HEALTH DATA TYPES
// ============================================================

interface OfficialAlert {
  id: string;
  name: string;
  url: string;
  source: string;
  date: string;
  verified: true;
}

interface Zone {
  isoCode: string;
  lat: number;
  lng: number;
}

interface OutbreakReport {
  title: string;
  description: string;
  spreadForecast: string;

  source: string;
  date: string;

  verificationStatus:
    | 'OFFICIAL_SOURCE'
    | 'MODEL_INFERENCE';

  activeZone: Zone;
  vulnerableZones: Zone[];
}

interface PublicHealthResult {
  healthAdvisory: string;
  outbreakReports: OutbreakReport[];
  officialAlerts: OfficialAlert[];

  metadata: {
    analysisTimestamp: string;
    source: string;
    sourceStatus:
      | 'AVAILABLE'
      | 'NO_CURRENT_RECORDS'
      | 'PARTIAL'
      | 'UNAVAILABLE';

    verificationPolicy: string;
    forecastWindow: string;
  };
}

// ============================================================
// HELPERS
// ============================================================

function normalizeDate(
  value: unknown
): string {
  if (
    typeof value === 'string' &&
    !Number.isNaN(
      new Date(value).getTime()
    )
  ) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function isValidZone(
  zone: any
): zone is Zone {
  return (
    zone &&
    typeof zone.isoCode === 'string' &&
    typeof zone.lat === 'number' &&
    typeof zone.lng === 'number' &&
    Number.isFinite(zone.lat) &&
    Number.isFinite(zone.lng)
  );
}

// ============================================================
// PUBLIC HEALTH AGENT
// ============================================================

async function runPublicHealth(
  data: { location?: string }
): Promise<PublicHealthResult> {
  console.log(
    '[Public Health]: Fetching trusted epidemic intelligence...'
  );

  let officialAlerts: OfficialAlert[] = [];

  try {
    // ========================================================
    // 1. FETCH CURRENT REAL-WORLD HEALTH INTELLIGENCE
    // ========================================================

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15_000
    );

    try {
      const url =
        'https://api.reliefweb.int/v1/disasters' +
        '?appname=chayra-ai' +
        '&profile=list' +
        '&preset=latest' +
        '&query[value]=epidemic' +
        '&limit=15';

      const response = await fetch(
        url,
        {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `ReliefWeb returned HTTP ${response.status}`
        );
      }

      const apiData =
        await response.json();

      const rawAlerts =
        Array.isArray(apiData?.data)
          ? apiData.data
          : [];

      officialAlerts =
        rawAlerts.map(
          (item: any): OfficialAlert => ({
            id: String(
              item?.id ?? 'unknown'
            ),

            name: String(
              item?.fields?.name ??
                'Unspecified outbreak'
            ),

            url: String(
              item?.href ??
                'https://reliefweb.int/'
            ),

            source: 'UN ReliefWeb',

            date: normalizeDate(
              item?.fields?.date?.created
            ),

            verified: true,
          })
        );
    } finally {
      clearTimeout(timeout);
    }

    // ========================================================
    // 2. CURRENT DATE
    // ========================================================

    const analysisDate =
      new Date().toISOString();

    // ========================================================
    // 3. LOAD HISTORICAL PUBLIC HEALTH MEMORY
    // ========================================================

    const previousHealthState =
      await PredictiveMemoryBank.getPublicHealthState();

    // Keep the historical context bounded so we do not
    // unnecessarily increase Gemini input tokens.
    const historicalContext =
      previousHealthState
        ? JSON.stringify({
            analysisTimestamp:
              previousHealthState.analysisTimestamp,

            sourceStatus:
              previousHealthState.sourceStatus,

            healthAdvisory:
              previousHealthState.healthAdvisory,

            officialAlerts:
              Array.isArray(
                previousHealthState.officialAlerts
              )
                ? previousHealthState
                    .officialAlerts
                    .slice(-10)
                : [],

            outbreakReports:
              Array.isArray(
                previousHealthState.outbreakReports
              )
                ? previousHealthState
                    .outbreakReports
                    .slice(-10)
                : [],
          })
        : 'No previous public-health state available.';

    // ========================================================
    // 4. PUBLIC HEALTH INTELLIGENCE PROMPT
    // ========================================================

    const prompt = `
You are the Public Health Intelligence Agent for
the ChayRa Enterprise Crisis Fleet.

Current analysis timestamp:
${analysisDate}

User location context:
${data.location || 'Not provided'}

CURRENT OFFICIAL SOURCE RECORDS:
${JSON.stringify(officialAlerts)}

PREVIOUS PUBLIC HEALTH MEMORY:
${historicalContext}

Rules:

1. Treat ONLY supplied official records as verified facts.
2. Never invent an outbreak, source, publication date,
   case count, or official confirmation.
3. Historical context may be used to identify trends,
   but it does not become a verified current alert.
4. Predictions about vulnerable regions are MODEL INFERENCE.
5. Clearly distinguish official evidence from inference.
6. If evidence is insufficient, explicitly say so.
7. Never convert uncertainty into an emergency claim.
8. Never invent official dates or source names.
9. Keep the advisory concise and operational.
10. Use approximate country-center coordinates only when
    reasonably inferable.

Task 1:
Summarize meaningful public-health trends visible in
the current and historical records.

Task 2:
Identify possible vulnerable neighboring regions for
the next 15 days ONLY as model inference.

Task 3:
Return exact source/date information for verified records.

Return ONLY valid JSON:

{
  "advisoryText": "2-3 concise sentences.",
  "outbreakReports": [
    {
      "title": "string",
      "description": "summary based only on available evidence",
      "spreadForecast": "clearly labeled model inference",
      "source": "UN ReliefWeb",
      "date": "exact date from supplied official record",
      "activeZone": {
        "isoCode": "ISO-3166 alpha-3",
        "lat": 0,
        "lng": 0
      },
      "vulnerableZones": [
        {
          "isoCode": "ISO-3166 alpha-3",
          "lat": 0,
          "lng": 0
        }
      ]
    }
  ]
}
`;

    // ========================================================
    // 5. GEMINI ANALYSIS
    // ========================================================

    const resp =
      await generativeModel.generateContent(
        prompt
      );

    const text =
      resp.response.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text || '{}';

    const cleanJson =
      text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

    const result =
      JSON.parse(cleanJson);

    // ========================================================
    // 6. HARDEN MODEL OUTPUT
    // ========================================================

    const rawReports =
      Array.isArray(
        result?.outbreakReports
      )
        ? result.outbreakReports
        : [];

    const outbreakReports:
      OutbreakReport[] =
        rawReports
          .filter(
            (report: any) =>
              report &&
              typeof report.title === 'string' &&
              isValidZone(
                report.activeZone
              )
          )
          .map(
            (report: any) => ({
              title:
                report.title,

              description:
                String(
                  report.description ??
                    'No detailed description available.'
                ),

              spreadForecast:
                String(
                  report.spreadForecast ??
                    'Insufficient evidence for a reliable forecast.'
                ),

              // Model output never determines provenance.
              source:
                'UN ReliefWeb',

              date:
                normalizeDate(
                  report.date
                ),

              verificationStatus:
                'MODEL_INFERENCE',

              activeZone:
                report.activeZone,

              vulnerableZones:
                Array.isArray(
                  report.vulnerableZones
                )
                  ? report.vulnerableZones
                      .filter(
                        isValidZone
                      )
                  : [],
            })
          );

    // ========================================================
    // 7. BUILD FINAL RESULT
    // ========================================================

    const finalResult:
      PublicHealthResult = {
      healthAdvisory:
        typeof result?.advisoryText ===
        'string'
          ? result.advisoryText
          : (
              officialAlerts.length > 0
                ? 'Current public-health signals are under active analysis.'
                : 'No verified public-health alert was available from the current source.'
            ),

      outbreakReports,

      officialAlerts,

      metadata: {
        analysisTimestamp:
          analysisDate,

        source:
          'UN ReliefWeb',

        sourceStatus:
          officialAlerts.length > 0
            ? 'AVAILABLE'
            : 'NO_CURRENT_RECORDS',

        verificationPolicy:
          'Official source records are separated from model inference.',

        forecastWindow:
          '15 days',
      },
    };

    // ========================================================
    // 8. PERSIST PUBLIC HEALTH MEMORY
    // ========================================================

    await PredictiveMemoryBank.savePublicHealthState(
      finalResult
    );

    return finalResult;

  } catch (error) {
    console.error(
      '[Public Health]: Intelligence pipeline failed.',
      error
    );

    // ========================================================
    // 9. SAFE FALLBACK
    // ========================================================

    const fallbackResult:
      PublicHealthResult = {
      healthAdvisory:
        'Public-health intelligence is temporarily unavailable. No new verified alert could be confirmed from the current source.',

      outbreakReports: [],

      officialAlerts,

      metadata: {
        analysisTimestamp:
          new Date().toISOString(),

        source:
          'UN ReliefWeb',

        sourceStatus:
          officialAlerts.length > 0
            ? 'PARTIAL'
            : 'UNAVAILABLE',

        verificationPolicy:
          'No unverified health event is promoted to an official alert.',

        forecastWindow:
          '15 days',
      },
    };

    await PredictiveMemoryBank.savePublicHealthState(
      fallbackResult
    );

    return fallbackResult;
  }
}

// ============================================================
// ENTERPRISE REGISTRATION
// ============================================================

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'PublicHealth',
    version: '3.0.0',
    role: 'Health Intelligence',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_2',
  },
  runPublicHealth
);