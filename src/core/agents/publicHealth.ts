import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel =
  vertexAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
  });

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

async function runPublicHealth(
  data: { location?: string }
) {
  console.log(
    '[Public Health]: Fetching trusted epidemic intelligence...'
  );

  let officialAlerts: OfficialAlert[] = [];

  try {
    // ==========================================================
    // 1. FETCH CURRENT REAL-WORLD HEALTH INTELLIGENCE
    // ==========================================================

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

            name:
              String(
                item?.fields?.name ??
                  'Unspecified outbreak'
              ),

            url:
              String(
                item?.href ??
                  'https://reliefweb.int/'
              ),

            source:
              'UN ReliefWeb',

            date:
              normalizeDate(
                item?.fields?.date?.created
              ),

            verified: true,
          })
        );

    } finally {
      clearTimeout(timeout);
    }

    // ==========================================================
    // 2. CURRENT DATE — NEVER HARDCODE
    // ==========================================================

    const analysisDate =
      new Date().toISOString();

    // ==========================================================
    // 3. PUBLIC HEALTH INTELLIGENCE PROMPT
    // ==========================================================
    //
    // IMPORTANT:
    // The model may analyze and forecast.
    // It must NEVER invent an official source,
    // official publication date, or verified outbreak.
    //

    const prompt = `
You are the Public Health Intelligence Agent for
the ChayRa Enterprise Crisis Fleet.

Analysis timestamp:
${analysisDate}

User location context:
${data.location || 'Not provided'}

Official source records:
${JSON.stringify(officialAlerts)}

Rules:

1. Treat only the supplied official records as verified facts.
2. Never invent an outbreak, source, publication date,
   case count, or official confirmation.
3. Predictions about vulnerable regions are MODEL INFERENCE,
   not verified facts.
4. Clearly distinguish official evidence from inference.
5. If there is insufficient evidence, say so.
6. Do not convert uncertainty into an emergency claim.
7. Use only the coordinates supplied by the model when they
   are reasonable approximate country-center coordinates.
8. Keep the advisory concise and operational.

Task 1:
Summarize meaningful public-health trends visible
in the supplied records.

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
      "description": "summary based only on official data",
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

    // ==========================================================
    // 4. GEMINI ANALYSIS
    // ==========================================================

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

    // ==========================================================
    // 5. HARDEN MODEL OUTPUT
    // ==========================================================

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

              // IMPORTANT:
              // Never trust Gemini to invent provenance.
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
                  ? report.vulnerableZones.filter(
                      isValidZone
                    )
                  : [],
            })
          );

    return {
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

  } catch (error) {
    console.error(
      '[Public Health]: Intelligence pipeline failed.',
      error
    );

    // ========================================================
    // 6. SAFE FALLBACK
    // ========================================================

    return {
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
  }
}

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