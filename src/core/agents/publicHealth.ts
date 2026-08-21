import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';
import { PredictiveMemoryBank } from '../adk/memory';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

interface OfficialAlert {
  id: string;
  name: string;
  url: string;
  source: string;
  date: string;
  verified: true;
  sourceType?: 'RELIEFWEB' | 'WHO';
  countryName?: string;
  countryIso3?: string;
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
  verificationStatus: 'OFFICIAL_SOURCE' | 'MODEL_INFERENCE';
  activeZone: Zone;
  vulnerableZones: Zone[];
}

type SnapshotStatus = 'LIVE' | 'LAST_KNOWN_GOOD' | 'NO_DATA';

interface PublicHealthResult {
  healthAdvisory: string;
  outbreakReports: OutbreakReport[];
  officialAlerts: OfficialAlert[];
  metadata: {
    analysisTimestamp: string;
    source: string;
    sourceStatus: 'AVAILABLE' | 'NO_CURRENT_RECORDS' | 'PARTIAL' | 'UNAVAILABLE';
    snapshotStatus: SnapshotStatus;
    snapshotAgeDays: number | null;
    verificationPolicy: string;
    forecastWindow: string;
    lookbackDays: number;
  };
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}
function toReliefWebDate(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, '+00:00');
}

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isValidZone(zone: any): zone is Zone {
  return Boolean(
    zone &&
    typeof zone.isoCode === 'string' &&
    typeof zone.lat === 'number' &&
    typeof zone.lng === 'number' &&
    Number.isFinite(zone.lat) &&
    Number.isFinite(zone.lng),
  );
}

function calculateSnapshotAgeDays(timestamp: unknown): number | null {
  if (typeof timestamp !== 'string') return null;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return null;
  return Number((Math.max(0, Date.now() - time) / 86_400_000).toFixed(1));
}

function hasVerifiedSnapshot(state: any): boolean {
  return Boolean(
    state &&
    Array.isArray(state.officialAlerts) &&
    state.officialAlerts.length > 0,
  );
}

function withinWindow(value: unknown, from: Date, to: Date): boolean {
  if (typeof value !== 'string') return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
}

async function fetchReliefWebAlerts(fromDate: Date, now: Date): Promise<OfficialAlert[]> {
  const appName = process.env.RELIEFWEB_APPNAME?.trim();
  if (!appName) throw new Error('RELIEFWEB_APPNAME is not configured.');

  const endpoint = `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(appName)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        limit: 50,
        preset: 'latest',
        query: {
          value:
            'outbreak epidemic disease infectious cholera dengue mpox ebola measles influenza nipah malaria polio avian coronavirus hepatitis meningitis yellow fever',
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
            from: toReliefWebDate(fromDate),
            to: toReliefWebDate(now),
          },
        },
        sort: ['date.created:desc'],
        fields: {
          include: [
            'title',
            'url',
            'date.created',
            'source',
            'primary_country',
            'country',
            'headline.summary',
          ],
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `ReliefWeb returned HTTP ${response.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
      );
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];

    return rows
      .map((item: any) => {
        const fields = item?.fields ?? {};
        const primaryCountry = fields?.primary_country;
        const date = normalizeDate(fields?.date?.created);
        return {
          id: String(item?.id ?? `${fields?.title ?? 'report'}-${date}`),
          name: cleanText(fields?.title, 'Public health report'),
          url: String(fields?.url ?? item?.href ?? 'https://reliefweb.int/'),
          source: cleanText(fields?.source?.name ?? fields?.source?.shortname, 'UN ReliefWeb'),
          date,
          verified: true as const,
          sourceType: 'RELIEFWEB' as const,
          countryName: cleanText(primaryCountry?.name),
          countryIso3: cleanText(primaryCountry?.iso3).toUpperCase() || undefined,
        } satisfies OfficialAlert;
      })
      .filter((alert: OfficialAlert) => withinWindow(alert.date, fromDate, now));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWHOAlerts(fromDate: Date, now: Date): Promise<OfficialAlert[]> {
  const endpoint =
    'https://www.who.int/api/news/diseaseoutbreaknews?$top=50&$orderby=PublicationDate%20desc';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`WHO Disease Outbreak News returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const rows = Array.isArray(data?.value) ? data.value : [];

    return rows
      .filter((item: any) => withinWindow(item?.PublicationDate, fromDate, now))
      .map((item: any) => ({
        id: String(item?.Id ?? item?.DonId ?? item?.UrlName ?? `WHO-${item?.PublicationDate}`),
        name: cleanText(item?.Title, 'WHO Disease Outbreak News'),
        url: item?.UrlName
          ? `https://www.who.int/emergencies/disease-outbreak-news/item/${item.UrlName}`
          : 'https://www.who.int/emergencies/disease-outbreak-news',
        source: 'WHO Disease Outbreak News',
        date: normalizeDate(item?.PublicationDate),
        verified: true as const,
        sourceType: 'WHO' as const,
      } satisfies OfficialAlert));
  } finally {
    clearTimeout(timeout);
  }
}

async function runPublicHealth(data: { location?: string }): Promise<PublicHealthResult> {
  const LOOKBACK_DAYS = 30;
  const analysisDate = new Date().toISOString();
  const now = new Date();
  const fromDate = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  console.log(`[Public Health]: Scanning the last ${LOOKBACK_DAYS} days of trusted health intelligence...`);

  const previousHealthState = await PredictiveMemoryBank.getPublicHealthState();
  const previousAgeDays = calculateSnapshotAgeDays(previousHealthState?.analysisTimestamp);

  let reliefWebError: string | null = null;
  let whoError: string | null = null;
  let officialAlerts: OfficialAlert[] = [];

  try {
    officialAlerts = await fetchReliefWebAlerts(fromDate, now);
    console.log(`[Public Health]: ReliefWeb → ${officialAlerts.length} relevant report(s).`);
  } catch (error: any) {
    reliefWebError = error?.message || 'ReliefWeb request failed.';
    console.warn(`[Public Health]: ${reliefWebError}`);
  }

  try {
    const whoAlerts = await fetchWHOAlerts(fromDate, now);
    console.log(`[Public Health]: WHO DON → ${whoAlerts.length} report(s).`);
    const dedupe = new Map<string, OfficialAlert>();
    [...officialAlerts, ...whoAlerts].forEach((alert) => dedupe.set(alert.id, alert));
    officialAlerts = Array.from(dedupe.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch (error: any) {
    whoError = error?.message || 'WHO Disease Outbreak News request failed.';
    console.warn(`[Public Health]: ${whoError}`);
  }

  const historicalContext = previousHealthState
    ? JSON.stringify({
      analysisTimestamp: previousHealthState.analysisTimestamp,
      sourceStatus: previousHealthState.sourceStatus,
      healthAdvisory: previousHealthState.healthAdvisory,
      officialAlerts: Array.isArray(previousHealthState.officialAlerts)
        ? previousHealthState.officialAlerts.slice(-10)
        : [],
      outbreakReports: Array.isArray(previousHealthState.outbreakReports)
        ? previousHealthState.outbreakReports.slice(-10)
        : [],
    })
    : 'No previous public-health memory available.';

  try {
    const prompt = `
You are the Public Health Intelligence Agent for the ChayRa Enterprise Crisis Fleet.

Current timestamp:
${analysisDate}

Analysis window:
LAST ${LOOKBACK_DAYS} DAYS

User location:
${data.location || 'Not provided'}

VERIFIED SOURCE RECORDS:
${JSON.stringify(officialAlerts)}

PREVIOUS HEALTH SNAPSHOT:
${historicalContext}

RULES:
1. Only the supplied WHO or UN ReliefWeb records are official evidence.
2. Never invent a disease, outbreak, date, source, case count, or confirmation.
3. Historical memory may be shown only as LAST VERIFIED SNAPSHOT.
4. Future spread is MODEL INFERENCE only.
5. Use source countryIso3 when supplied; otherwise use a reliable ISO-3166 alpha-3 code or 0 coordinates.
6. If there is no meaningful disease/outbreak signal, return an empty outbreakReports array.
7. Keep official evidence separate from model inference.

Return ONLY JSON:
{
  "advisoryText": "2-3 concise sentences",
  "outbreakReports": [
    {
      "title": "string",
      "description": "official evidence summary",
      "spreadForecast": "MODEL INFERENCE: ...",
      "source": "WHO Disease Outbreak News or UN ReliefWeb",
      "date": "exact source date",
      "activeZone": { "isoCode": "ISO-3166 alpha-3", "lat": 0, "lng": 0 },
      "vulnerableZones": [
        { "isoCode": "ISO-3166 alpha-3", "lat": 0, "lng": 0 }
      ]
    }
  ]
}
`;

    const resp = await generativeModel.generateContent(prompt);
    const rawText =
      resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let result: any = {};
    try {
      result = JSON.parse(cleanJson);
    } catch {
      console.warn('[Public Health]: Gemini returned malformed JSON.');
    }

    const outbreakReports: OutbreakReport[] =
      (Array.isArray(result?.outbreakReports) ? result.outbreakReports : [])
        .filter(
          (report: any) =>
            report &&
            typeof report.title === 'string' &&
            isValidZone(report.activeZone),
        )
        .map((report: any) => ({
          title: report.title,
          description: cleanText(report.description, 'No detailed description available.'),
          spreadForecast: cleanText(
            report.spreadForecast,
            'MODEL INFERENCE: Insufficient evidence for a reliable forecast.',
          ),
          source: cleanText(report.source, 'Trusted official source'),
          date: normalizeDate(report.date),
          verificationStatus: 'MODEL_INFERENCE' as const,
          activeZone: report.activeZone,
          vulnerableZones: Array.isArray(report.vulnerableZones)
            ? report.vulnerableZones.filter(isValidZone)
            : [],
        }));

    const liveSourceAvailable = officialAlerts.length > 0;
    const resultToSave: PublicHealthResult = {
      healthAdvisory:
        typeof result?.advisoryText === 'string'
          ? result.advisoryText
          : liveSourceAvailable
            ? `Found ${officialAlerts.length} verified public-health report(s) across WHO Disease Outbreak News and UN ReliefWeb in the last ${LOOKBACK_DAYS} days.`
            : previousHealthState?.healthAdvisory ||
            `No verified public-health event was confirmed by the currently reachable trusted sources in the last ${LOOKBACK_DAYS} days.`,
      outbreakReports,
      officialAlerts,
      metadata: {
        analysisTimestamp: analysisDate,
        source:
          'WHO Disease Outbreak News + UN ReliefWeb',
        sourceStatus: liveSourceAvailable
          ? 'AVAILABLE'
          : reliefWebError || whoError
            ? 'PARTIAL'
            : 'NO_CURRENT_RECORDS',
        snapshotStatus: liveSourceAvailable
          ? 'LIVE'
          : hasVerifiedSnapshot(previousHealthState)
            ? 'LAST_KNOWN_GOOD'
            : 'NO_DATA',
        snapshotAgeDays: liveSourceAvailable ? 0 : previousAgeDays,
        verificationPolicy:
          'WHO and UN ReliefWeb records are treated as official-source evidence; predicted spread remains model inference.',
        forecastWindow: '15 days',
        lookbackDays: LOOKBACK_DAYS,
      },
    };

    await PredictiveMemoryBank.savePublicHealthState(resultToSave);
    return resultToSave;
  } catch (error) {
    console.warn(
      '[Public Health]: Analysis failed. Using last verified snapshot when available.',
      error,
    );

    if (hasVerifiedSnapshot(previousHealthState)) {
      const stale: PublicHealthResult = {
        healthAdvisory:
          'Showing the last verified public-health snapshot. Live source refresh is temporarily unavailable.',
        outbreakReports: Array.isArray(previousHealthState?.outbreakReports)
          ? (previousHealthState.outbreakReports as OutbreakReport[])
          : [],
        officialAlerts: Array.isArray(previousHealthState?.officialAlerts)
          ? (previousHealthState.officialAlerts as OfficialAlert[])
          : [],
        metadata: {
          analysisTimestamp:
            previousHealthState?.analysisTimestamp || new Date().toISOString(),
          source:
            previousHealthState?.source ||
            'WHO Disease Outbreak News + UN ReliefWeb',
          sourceStatus: 'PARTIAL',
          snapshotStatus: 'LAST_KNOWN_GOOD',
          snapshotAgeDays: previousAgeDays,
          verificationPolicy:
            previousHealthState?.verificationPolicy ||
            'Official-source records are separated from model inference.',
          forecastWindow: previousHealthState?.forecastWindow || '15 days',
          lookbackDays: LOOKBACK_DAYS,
        },
      };
      await PredictiveMemoryBank.savePublicHealthState(stale);
      return stale;
    }

    const fallback: PublicHealthResult = {
      healthAdvisory:
        'No verified public-health snapshot is available yet. Live trusted-source refresh is temporarily unavailable.',
      outbreakReports: [],
      officialAlerts: [],
      metadata: {
        analysisTimestamp: new Date().toISOString(),
        source: 'WHO Disease Outbreak News + UN ReliefWeb',
        sourceStatus: 'UNAVAILABLE',
        snapshotStatus: 'NO_DATA',
        snapshotAgeDays: null,
        verificationPolicy:
          'No unverified health event is promoted to an official alert.',
        forecastWindow: '15 days',
        lookbackDays: LOOKBACK_DAYS,
      },
    };
    await PredictiveMemoryBank.savePublicHealthState(fallback);
    return fallback;
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