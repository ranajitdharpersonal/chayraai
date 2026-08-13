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

type SnapshotStatus =
  | 'LIVE'
  | 'LAST_KNOWN_GOOD'
  | 'NO_DATA';

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

    snapshotStatus: SnapshotStatus;
    snapshotAgeDays: number | null;

    verificationPolicy: string;
    forecastWindow: string;
    lookbackDays: number;
  };
}

function normalizeDate(
  value: unknown,
): string {
  if (
    typeof value === 'string' &&
    !Number.isNaN(
      new Date(value).getTime(),
    )
  ) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function isValidZone(
  zone: any,
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

function calculateSnapshotAgeDays(
  timestamp: unknown,
): number | null {
  if (
    typeof timestamp !== 'string'
  ) {
    return null;
  }

  const time =
    new Date(timestamp).getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  const ageMs =
    Math.max(
      0,
      Date.now() - time,
    );

  return Number(
    (
      ageMs /
      (1000 * 60 * 60 * 24)
    ).toFixed(1),
  );
}

function hasVerifiedSnapshot(
  state: any,
): boolean {
  return Boolean(
    state &&
    Array.isArray(
      state.officialAlerts,
    ) &&
    state.officialAlerts
      .length > 0,
  );
}

async function runPublicHealth(
  data: { location?: string },
): Promise<PublicHealthResult> {
  console.log(
    '[Public Health]: Scanning the last 30 days of trusted health intelligence...',
  );

  const analysisDate =
    new Date().toISOString();

  const LOOKBACK_DAYS = 30;

  let officialAlerts:
    OfficialAlert[] = [];

  const previousHealthState =
    await PredictiveMemoryBank
      .getPublicHealthState();

  const previousAgeDays =
    calculateSnapshotAgeDays(
      previousHealthState
        ?.analysisTimestamp,
    );

  try {
    const now =
      new Date();

    const fromDate =
      new Date(
        now.getTime() -
          LOOKBACK_DAYS *
            24 *
            60 *
            60 *
            1000,
      );

    // ========================================================
    // 1. RELIEFWEB — 30-DAY VERIFIED SNAPSHOT
    // ========================================================

    const appName =
      process.env.RELIEFWEB_APPNAME?.trim() ||
      'chayra-ai';

    const endpoint =
      `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(
        appName,
      )}`;

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        15_000,
      );

    try {
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
          field:
            'date.created',

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

            signal:
              controller.signal,

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
        const detail =
          await response
            .text()
            .catch(
              () => '',
            );

        throw new Error(
          `ReliefWeb returned HTTP ${response.status}${detail ? ` — ${detail.slice(0, 240)}` : ''}`,
        );
      }

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
              id:
                String(
                  item?.id ??
                    `${title}-${created}`,
                ),

              name:
                title,

              url:
                String(
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

              date:
                created,

              verified:
                true as const,
            };
          },
        );

      console.log(
        `[Public Health]: ${officialAlerts.length} verified report(s) found in the last ${LOOKBACK_DAYS} days.`,
      );
    } finally {
      clearTimeout(timeout);
    }

    // ========================================================
    // 2. BUILD CONTEXT
    // ========================================================

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
    // 3. GEMINI — OFFICIAL EVIDENCE + CLEAR INFERENCE
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

OFFICIAL RELIEFWEB RECORDS:
${JSON.stringify(
  officialAlerts,
)}

PREVIOUS HEALTH SNAPSHOT:
${historicalContext}

RULES:

1. ONLY supplied ReliefWeb records are verified evidence.

2. Never invent a disease, outbreak, case count,
   publication date, source, or official confirmation.

3. If verified records exist, summarize them.

4. If no verified current record exists, explicitly say so.

5. Historical memory may be shown as the
   LAST VERIFIED SNAPSHOT, but do not present it
   as a new current event.

6. Future spread is MODEL INFERENCE only.

7. Never present model inference as an official warning.

8. For map data, return ISO country codes.
   Coordinates are required only for regions you
   can infer reliably from the supplied official
   location information. Otherwise use 0 for the
   coordinate fields and the frontend will use the
   country geometry for visualization.

9. Keep verified evidence and inference visibly separate.

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
        ?.content?.parts?.[0]
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
    // 5. LIVE SNAPSHOT RESULT
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

          snapshotStatus:
            'LIVE',

          snapshotAgeDays:
            0,

          verificationPolicy:
            'Official source records are separated from model inference.',

          forecastWindow:
            '15 days',

          lookbackDays:
            LOOKBACK_DAYS,
        },
      };

    await PredictiveMemoryBank
      .savePublicHealthState(
        finalResult,
      );

    return finalResult;
  } catch (error) {
    console.warn(
      '[Public Health]: Live source unavailable. Using last verified snapshot when available.',
      error,
    );

    // ========================================================
    // 6. LAST-KNOWN-GOOD SNAPSHOT
    // ========================================================

    if (
      hasVerifiedSnapshot(
        previousHealthState,
      )
    ) {
      const previousAlerts =
        Array.isArray(
          previousHealthState
            ?.officialAlerts,
        )
          ? (
              previousHealthState
                ?.officialAlerts ??
              []
            ) as OfficialAlert[]
          : [];

      const previousReports =
        Array.isArray(
          previousHealthState
            ?.outbreakReports,
        )
          ? (
              previousHealthState
                ?.outbreakReports ??
              []
            ) as OutbreakReport[]
          : [];

      const staleResult:
        PublicHealthResult = {
          healthAdvisory:
            `Showing the last verified public-health snapshot. Live source refresh is temporarily unavailable.`,

          outbreakReports:
            previousReports,

          officialAlerts:
            previousAlerts,

          metadata: {
            analysisTimestamp:
              previousHealthState
                ?.analysisTimestamp ||
              new Date().toISOString(),

            source:
              previousHealthState
                ?.source ||
              'UN ReliefWeb',

            sourceStatus:
              'PARTIAL',

            snapshotStatus:
              'LAST_KNOWN_GOOD',

            snapshotAgeDays:
              previousAgeDays,

            verificationPolicy:
              previousHealthState
                ?.verificationPolicy ||
              'Official source records are separated from model inference.',

            forecastWindow:
              previousHealthState
                ?.forecastWindow ||
              '15 days',

            lookbackDays:
              LOOKBACK_DAYS,
          },
        };

      await PredictiveMemoryBank
        .savePublicHealthState(
          staleResult,
        );

      return staleResult;
    }

    // ========================================================
    // 7. EMPTY STATE — ONLY WHEN NO SNAPSHOT EXISTS
    // ========================================================

    const fallbackResult:
      PublicHealthResult = {
        healthAdvisory:
          `No verified public-health snapshot is available yet. Live source refresh is temporarily unavailable.`,

        outbreakReports: [],

        officialAlerts: [],

        metadata: {
          analysisTimestamp:
            new Date().toISOString(),

          source:
            'UN ReliefWeb',

          sourceStatus:
            'UNAVAILABLE',

          snapshotStatus:
            'NO_DATA',

          snapshotAgeDays:
            null,

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