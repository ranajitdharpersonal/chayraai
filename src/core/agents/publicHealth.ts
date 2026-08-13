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
    lookbackDays: number;
  };
}

function normalizeDate(value: unknown): string {
  if (
    typeof value === 'string' &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function isValidZone(zone: any): zone is Zone {
  return (
    zone &&
    typeof zone.isoCode === 'string' &&
    typeof zone.lat === 'number' &&
    typeof zone.lng === 'number' &&
    Number.isFinite(zone.lat) &&
    Number.isFinite(zone.lng)
  );
}

function cleanText(
  value: unknown,
  fallback = '',
): string {
  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  return fallback;
}

async function runPublicHealth(
  data: { location?: string },
): Promise<PublicHealthResult> {
  console.log(
    '[Public Health]: Scanning the last 15 days of trusted health intelligence...',
  );

  const analysisDate =
    new Date().toISOString();

  const LOOKBACK_DAYS = 15;

  let officialAlerts: OfficialAlert[] = [];

  try {
    const now = new Date();

    const fromDate = new Date(
      now.getTime() -
        LOOKBACK_DAYS *
          24 *
          60 *
          60 *
          1000,
    );

    // ========================================================
    // 1. RELIEFWEB REPORTS API
    // ========================================================
    //
    // Keep the existing 15-day window and official-record-only
    // model policy. The request body uses the documented v2
    // report query fields. In the previous version,
    // "disaster.name" and "disaster_type.name" were used as
    // query fields; the documented query field forms are
    // "disaster" and "disaster_type".
    //
    // ReliefWeb requires an appname. Keep using the existing
    // environment variable when present.
    // ========================================================

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15_000,
    );

    try {
      const appName =
        process.env.RELIEFWEB_APPNAME?.trim() ||
        'chayra-ai';

      const endpoint =
        `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(
          appName,
        )}`;

      const requestBody = {
        limit: 20,

        preset: 'latest',

        query: {
          value:
            'epidemic outbreak disease',

          fields: [
            'body',
            'country',
            'disaster',
            'disaster_type',
            'format.name',
            'headline.title',
            'headline.summary',
            'language',
            'primary_country',
            'source',
            'theme.name',
            'title',
          ],

          operator: 'OR',
        },

        filter: {
          field: 'date.created',

          value: {
            from:
              fromDate.toISOString(),
            to:
              now.toISOString(),
          },
        },

        sort: [
          'date.created:desc',
        ],

        fields: {
          include: [
            'title',
            'url',
            'date.created',
            'source',
            'primary_country',
            'disaster',
            'disaster_type',
            'theme',
          ],
        },
      };

      const response =
        await fetch(
          endpoint,
          {
            method: 'POST',
            signal: controller.signal,

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },

            body:
              JSON.stringify(
                requestBody,
              ),
          },
        );

      if (!response.ok) {
        const errorDetail =
          await response
            .text()
            .catch(() => '');

        console.warn(
          `[Public Health]: ReliefWeb returned HTTP ${response.status}.`,
          errorDetail.slice(0, 500),
        );
      } else {
        const apiData =
          await response.json();

        const rawReports =
          Array.isArray(
            apiData?.data,
          )
            ? apiData.data
            : [];

        officialAlerts =
          rawReports.map(
            (item: any) => {
              const fields =
                item?.fields || {};

              const title =
                cleanText(
                  fields.title,
                  'Public health report',
                );

              const created =
                normalizeDate(
                  fields?.date?.created,
                );

              return {
                id: String(
                  item?.id ??
                    `${title}-${created}`,
                ),

                name: title,

                url: String(
                  fields.url ??
                    item?.href ??
                    'https://reliefweb.int/',
                ),

                source:
                  cleanText(
                    fields?.source?.name ??
                      fields?.source
                        ?.shortname,
                    'UN ReliefWeb',
                  ),

                date: created,

                verified:
                  true as const,
              };
            },
          );

        console.log(
          `[Public Health]: ${officialAlerts.length} official report(s) found in the last ${LOOKBACK_DAYS} days.`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }

    // ========================================================
    // 2. HISTORICAL PUBLIC HEALTH MEMORY
    // ========================================================

    const previousHealthState =
      await PredictiveMemoryBank
        .getPublicHealthState();

    const historicalContext =
      previousHealthState
        ? JSON.stringify({
            analysisTimestamp:
              previousHealthState
                .analysisTimestamp,

            sourceStatus:
              previousHealthState
                .sourceStatus,

            healthAdvisory:
              previousHealthState
                .healthAdvisory,

            officialAlerts:
              Array.isArray(
                previousHealthState
                  .officialAlerts,
              )
                ? previousHealthState
                    .officialAlerts
                    .slice(-10)
                : [],

            outbreakReports:
              Array.isArray(
                previousHealthState
                  .outbreakReports,
              )
                ? previousHealthState
                    .outbreakReports
                    .slice(-10)
                : [],
          })
        : 'No previous public-health memory available.';

    // ========================================================
    // 3. GEMINI HEALTH INTELLIGENCE
    // ========================================================

    const prompt = `
You are the Public Health Intelligence Agent
for the ChayRa Enterprise Crisis Fleet.

Current timestamp:
${analysisDate}

Analysis window:
LAST ${LOOKBACK_DAYS} DAYS

User location:
${data.location || 'Not provided'}

OFFICIAL RELIEFWEB REPORTS:
${JSON.stringify(officialAlerts)}

PREVIOUS HEALTH MEMORY:
${historicalContext}

IMPORTANT RULES:

1. Treat ONLY the supplied ReliefWeb records
   as verified source evidence.

2. Never invent an outbreak, disease,
   publication date, source, case count,
   or official confirmation.

3. If no relevant official report exists,
   say clearly that no verified outbreak
   was found in the selected ${LOOKBACK_DAYS}-day window.

4. Historical memory can reveal trends,
   but historical memory is NOT proof of a
   new current outbreak.

5. A vulnerable-zone prediction is
   MODEL INFERENCE only.

6. Never present model inference as an
   official warning.

7. Never convert uncertainty into an
   emergency classification.

8. Keep the final advisory concise.

9. Do not manufacture coordinates when
   a reasonable location cannot be inferred.

10. The source/date in an outbreak report
    must correspond to a supplied official
    record whenever possible.

TASK 1:
Identify meaningful disease/outbreak signals
reported within the last ${LOOKBACK_DAYS} days.

TASK 2:
Summarize the recent trend using only
the supplied records and historical context.

TASK 3:
Predict potentially vulnerable neighboring
regions for the NEXT 15 DAYS.
Clearly label this as MODEL INFERENCE.

TASK 4:
Return exact source/date information for
each verified report.

Return ONLY valid JSON:

{
  "advisoryText": "2-3 concise sentences",
  "outbreakReports": [
    {
      "title": "string",
      "description": "official evidence summary",
      "spreadForecast": "MODEL INFERENCE: ...",
      "source": "exact supplied source",
      "date": "exact supplied report date",
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

    const resp =
      await generativeModel
        .generateContent(
          prompt,
        );

    const text =
      resp.response
        .candidates?.[0]
        ?.content
        ?.parts?.[0]
        ?.text ||
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

    let result: any = {};

    try {
      result =
        JSON.parse(
          cleanJson,
        );
    } catch {
      console.warn(
        '[Public Health]: Gemini returned malformed JSON.',
      );
    }

    // ========================================================
    // 4. HARDEN MODEL OUTPUT
    // ========================================================

    const rawReports =
      Array.isArray(
        result?.outbreakReports,
      )
        ? result.outbreakReports
        : [];

    const outbreakReports:
      OutbreakReport[] =
        rawReports
          .filter(
            (report: any) =>
              report &&
              typeof report.title ===
                'string' &&
              isValidZone(
                report.activeZone,
              ),
          )
          .map(
            (report: any) => ({
              title:
                report.title,

              description:
                cleanText(
                  report.description,
                  'No detailed description available.',
                ),

              spreadForecast:
                cleanText(
                  report.spreadForecast,
                  'MODEL INFERENCE: Insufficient evidence for a reliable forecast.',
                ),

              source:
                cleanText(
                  report.source,
                  'UN ReliefWeb',
                ),

              date:
                normalizeDate(
                  report.date,
                ),

              verificationStatus:
                'MODEL_INFERENCE',

              activeZone:
                report.activeZone,

              vulnerableZones:
                Array.isArray(
                  report.vulnerableZones,
                )
                  ? report
                      .vulnerableZones
                      .filter(
                        isValidZone,
                      )
                  : [],
            }),
          );

    // ========================================================
    // 5. FINAL HEALTH RESULT
    // ========================================================

    const finalResult:
      PublicHealthResult = {
        healthAdvisory:
          typeof result?.advisoryText ===
          'string'
            ? result.advisoryText
            : officialAlerts.length > 0
              ? `Found ${officialAlerts.length} verified public-health report(s) from the last ${LOOKBACK_DAYS} days.`
              : `No verified disease/outbreak report was found in the last ${LOOKBACK_DAYS} days from the current trusted source.`,

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

          lookbackDays:
            LOOKBACK_DAYS,
        },
      };

    // ========================================================
    // 6. PERSIST HEALTH MEMORY
    // ========================================================

    await PredictiveMemoryBank
      .savePublicHealthState(
        finalResult,
      );

    return finalResult;
  } catch (error) {
    console.error(
      '[Public Health]: Intelligence pipeline failed.',
      error,
    );

    const fallbackResult:
      PublicHealthResult = {
        healthAdvisory:
          `Public-health intelligence is temporarily unavailable. No new verified outbreak could be confirmed in the last ${LOOKBACK_DAYS} days.`,

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

          lookbackDays:
            LOOKBACK_DAYS,
        },
      };

    await PredictiveMemoryBank
      .savePublicHealthState(
        fallbackResult,
      );

    return fallbackResult;
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
  runPublicHealth,
);