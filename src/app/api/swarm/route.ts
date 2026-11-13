
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { InMemoryRunner } from '@google/adk';
import { createUserContent } from '@google/genai';

import { PredictiveMemoryBank } from '@/core/adk/memory';
import { chayRaCrisisFleet } from '@/core/adk/runtime';

import {
  checkRateLimit,
  getClientIp,
} from '@/lib/security/rate-limit';

import '@/core/agents/mindguard';
import '@/core/agents/scavenger';
import '@/core/agents/radar';
import '@/core/agents/medical';
import '@/core/agents/navigator';
import '@/core/agents/publicHealth';
import '@/core/agents/vault';
import '@/core/agents/verifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_NAME = 'chayra-enterprise-fleet';
const DEFAULT_USER_ID = 'chayra-web-guest';
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_REQUEST_BODY_BYTES = 96 * 1024; // 96 KB

const SWARM_RATE_LIMIT_POLICY = {
  namespace: 'swarm',
  limit: 20,
  window: '1 m',
} as const;

const VALID_THREAT_LEVELS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

type Coordinates = {
  lat: number;
  lng: number;
};

type AgentResults = Record<string, any>;
type JsonRecord = Record<string, any>;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the allowed size.');
    this.name = 'RequestBodyTooLargeError';
  }
}

async function readJsonBody(req: Request): Promise<unknown> {
  const contentLength = req.headers.get('content-length');

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isFinite(declaredLength) ||
      declaredLength < 0
    ) {
      throw new Error('Invalid Content-Length header.');
    }

    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
  }

  if (!req.body) {
    throw new Error('Request body is missing.');
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const bodyText = new TextDecoder('utf-8', {
    fatal: true,
  }).decode(bodyBytes);

  return JSON.parse(bodyText);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value),
  );
}

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function resolveSessionId(value: unknown): string {
  if (isValidUUID(value)) {
    return value.toLowerCase();
  }

  return randomUUID();
}

function validateCoordinates(
  value: unknown,
): {
  valid: boolean;
  coordinates?: Coordinates;
} {
  if (value === undefined || value === null) {
    return { valid: true };
  }

  if (!isRecord(value)) {
    return { valid: false };
  }

  const lat = value.lat;
  const lng = value.lng;

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
    return { valid: false };
  }

  return {
    valid: true,
    coordinates: { lat, lng },
  };
}

function hasFacilityCoordinates(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const nested = isRecord(value.coordinates)
    ? value.coordinates
    : {};

  const lat = value.lat ?? nested.lat;
  const lng = value.lng ?? nested.lng;

  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function getSafeThreatLevel(value: unknown): string {
  const level = String(value ?? '')
    .trim()
    .toUpperCase();

  return VALID_THREAT_LEVELS.includes(
    level as (typeof VALID_THREAT_LEVELS)[number],
  )
    ? level
    : 'UNKNOWN';
}

function resolveAgentResult(
  eventResults: AgentResults,
  sessionState: JsonRecord,
  agentName: string,
): any {
  return (
    eventResults[agentName] ??
    sessionState[`${agentName}_result`] ??
    null
  );
}

function extractEventResult(
  event: any,
): {
  author: string;
  result: any;
} | null {
  const author =
    typeof event?.author === 'string'
      ? event.author
      : '';

  if (!author) {
    return null;
  }

  const parts = Array.isArray(event?.content?.parts)
    ? event.content.parts
    : [];

  const text = parts
    .map((part: any) => part?.text)
    .filter(
      (value: unknown): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0,
    )
    .join('\n')
    .trim();

  if (!text) {
    return null;
  }

  try {
    return {
      author,
      result: JSON.parse(text),
    };
  } catch {
    if (author === 'Radar' || author === 'Vault') {
      return {
        author,
        result: text,
      };
    }

    console.warn(
      `[ADK API]: Ignoring malformed structured output from ${author}.`,
    );

    return null;
  }
}

function getDefaultMedicalResult(): string[] {
  return [
    'Stay calm and assess the immediate situation.',
    'Check responsiveness and breathing.',
    'Seek emergency medical assistance for serious injuries.',
  ];
}

function getDefaultNavigationResult() {
  return {
    text:
      'Navigation result unavailable. Enable GPS or provide a tactical pin to search for mapped facilities.',
    destCoords: null,
    isRealData: false,
    lookupStatus: 'UNAVAILABLE',
    facility: null,
    hospital: null,
    bunker: null,
    facilities: {
      hospital: null,
      bunker: null,
    },
    routes: {
      hospital: null,
      bunker: null,
    },
  };
}

function getDefaultEvidence() {
  return {
    source: 'System Offline',
    sourceTime: new Date().toISOString(),
    confidenceReason:
      'Verification unavailable. No claim was independently verified.',
    hasConflictingInfo: false,
    isVerified: false,
    lastCheckedTimestamp: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const requestId = randomUUID();

  console.log(
    `[ADK API]: Incoming swarm request [${requestId}].`,
  );

  try {
    // 0. Distributed IP-based rate limiting.
    // Missing trusted proxy IP: skip limiter to preserve
    // local development and non-proxy deployment usability.
    const clientIp = getClientIp(req);

    if (!clientIp) {
      console.warn(
        '[ADK API]: Trusted client IP unavailable. Rate limit skipped.',
        { requestId },
      );
    } else {
      const rateLimit = await checkRateLimit(
        clientIp,
        SWARM_RATE_LIMIT_POLICY,
      );

      console.log(
        '[ADK API]: Rate-limit decision.',
        {
          requestId,
          mode: rateLimit.mode,
          source: rateLimit.source,
          wouldBlock: rateLimit.wouldBlock,
          remaining: rateLimit.remaining,
        },
      );

      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            type: 'error',
            message:
              'Too many requests. Please wait before trying again.',
            requestId,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(
                rateLimit.retryAfter ?? 60,
              ),
              'X-RateLimit-Limit': String(
                rateLimit.limit,
              ),
              'X-RateLimit-Remaining': String(
                rateLimit.remaining ?? 0,
              ),
              'Cache-Control': 'no-store',
            },
          },
        );
      }
    }

    // 1. Parse and size-limit request body.
    let payload: JsonRecord;

    try {
      const parsed = await readJsonBody(req);

      if (!isRecord(parsed)) {
        return NextResponse.json(
          {
            type: 'error',
            message: 'Invalid request body.',
          },
          { status: 400 },
        );
      }

      payload = parsed;
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          {
            type: 'error',
            message: 'Request body exceeds the allowed size.',
          },
          { status: 413 },
        );
      }

      return NextResponse.json(
        {
          type: 'error',
          message: 'Request body must contain valid JSON.',
        },
        { status: 400 },
      );
    }

    // 2. Validate user input.
    if (
      typeof payload.message !== 'string' ||
      !payload.message.trim()
    ) {
      return NextResponse.json(
        {
          type: 'error',
          message: 'A valid crisis message is required.',
        },
        { status: 400 },
      );
    }

    const message = payload.message.trim();

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          type: 'error',
          message:
            `Message exceeds the ${MAX_MESSAGE_LENGTH} character limit.`,
        },
        { status: 413 },
      );
    }

    // 3. Validate GPS coordinates.
    const coordinateResult =
      validateCoordinates(payload.coords);

    if (!coordinateResult.valid) {
      return NextResponse.json(
        {
          type: 'error',
          message:
            'Invalid GPS coordinates. Please provide valid latitude and longitude.',
        },
        { status: 400 },
      );
    }

    const userCoords = coordinateResult.coordinates;

    // 4. Resolve unique session.
    const activeSessionId =
      resolveSessionId(payload.sessionId);

    const userId = DEFAULT_USER_ID;

    console.log(
      `[ADK API]: Session initialized. Session=${activeSessionId}`,
    );

    // 5. Initialize ADK runner.
    const runner = new InMemoryRunner({
      agent: chayRaCrisisFleet,
      appName: APP_NAME,
    });

    await runner.sessionService.createSession({
      appName: APP_NAME,
      userId,
      sessionId: activeSessionId,
      state: {
        userCoords,
        radarIntel: null,
        context: {
          source: 'chayra-web',
          requestId,
          startedAt: new Date().toISOString(),
        },
      },
    });

    // 6. Prepare user message.
    const newMessage = createUserContent(message);

    // 7. Execute crisis fleet.
    const eventResults: AgentResults = {};

    console.log(
      '[ADK API]: Starting enterprise crisis fleet execution.',
    );

    for await (
      const event of runner.runAsync({
        userId,
        sessionId: activeSessionId,
        newMessage,
      })
    ) {
      const author =
        typeof event?.author === 'string'
          ? event.author
          : 'unknown';

      console.log(`[ADK Event]: ${author}`);

      const extracted = extractEventResult(event);

      if (extracted) {
        eventResults[extracted.author] = extracted.result;
      }
    }

    console.log(
      '[ADK API]: Agent execution completed.',
    );

    // 8. Retrieve completed ADK session.
    const completedSession =
      await runner.sessionService.getSession({
        appName: APP_NAME,
        userId,
        sessionId: activeSessionId,
      });

    if (!completedSession) {
      throw new Error(
        'ADK session could not be retrieved after execution.',
      );
    }

    const sessionState = isRecord(completedSession.state)
      ? completedSession.state
      : {};

    // 9. MindGuard result.
    const mindGuardResult = resolveAgentResult(
      eventResults,
      sessionState,
      'MindGuard',
    );

    if (
      mindGuardResult?.isEmergency === false ||
      mindGuardResult?.securityStatus === 'REJECTED'
    ) {
      console.warn(
        '[ADK API]: MindGuard rejected the request.',
      );

      return NextResponse.json(
        {
          type: 'spam',
          message:
            mindGuardResult.reason ||
            'Request rejected by basic input validation.',
          requestId,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // 10. Scavenger result.
    const scavengerResult = resolveAgentResult(
      eventResults,
      sessionState,
      'Scavenger',
    );

    const threatLevel = getSafeThreatLevel(
      scavengerResult?.threatLevel,
    );

    // 11. Radar result.
    const radarIntel = resolveAgentResult(
      eventResults,
      sessionState,
      'Radar',
    );

    // 12. Medical result.
    const rawMedicalData = resolveAgentResult(
      eventResults,
      sessionState,
      'Medical',
    );

    const medicalData = Array.isArray(rawMedicalData)
      ? rawMedicalData.filter(
        (item: unknown) => typeof item === 'string',
      )
      : getDefaultMedicalResult();

    // 13. Navigator result.
    const rawNavigationData = resolveAgentResult(
      eventResults,
      sessionState,
      'Navigator',
    );

    const navigationData = isRecord(rawNavigationData)
      ? rawNavigationData
      : getDefaultNavigationResult();

    const resolvedDestCoords =
      navigationData.destCoords ?? null;

    const resolvedNavigationText =
      typeof navigationData.text === 'string'
        ? navigationData.text
        : getDefaultNavigationResult().text;

    const resolvedIsRealData =
      navigationData.isRealData === true;

    // Keep the new multi-facility contract while preserving
    // the legacy hospital/bunker fields for older UI consumers.
    const resolvedFacilities = isRecord(
      navigationData.facilities,
    )
      ? navigationData.facilities
      : {
        hospital: navigationData.hospital ?? null,
        bunker: navigationData.bunker ?? null,
      };

    const resolvedRoutes = isRecord(
      navigationData.routes,
    )
      ? navigationData.routes
      : {
        hospital: null,
        bunker: null,
      };

    const hospitalFacility =
      resolvedFacilities.hospital ?? null;

    const bunkerFacility =
      resolvedFacilities.bunker ?? null;

    const facilityCoordinateCount = [
      hospitalFacility,
      bunkerFacility,
    ].filter(hasFacilityCoordinates).length;

    // 14. Vault result.
    const rawVaultData = resolveAgentResult(
      eventResults,
      sessionState,
      'Vault',
    );

    const vaultData =
      typeof rawVaultData === 'string'
        ? rawVaultData
        : 'Identity standby. Rescue beacon was not generated in this cycle.';

    // 15. Public Health result.
    const rawHealthData = resolveAgentResult(
      eventResults,
      sessionState,
      'PublicHealth',
    );

    const healthData = isRecord(rawHealthData)
      ? rawHealthData
      : null;

    const healthAdvisory =
      typeof healthData?.healthAdvisory === 'string'
        ? healthData.healthAdvisory
        : 'Public-health intelligence is temporarily unavailable.';

    const officialAlerts =
      Array.isArray(healthData?.officialAlerts)
        ? healthData.officialAlerts
        : [];

    const outbreakReports =
      Array.isArray(healthData?.outbreakReports)
        ? healthData.outbreakReports
        : [];

    const healthMetadata =
      healthData?.metadata ?? null;

    // 16. Verifier result.
    const rawEvidence = resolveAgentResult(
      eventResults,
      sessionState,
      'Verifier',
    );

    const evidencePanel = isRecord(rawEvidence)
      ? rawEvidence
      : getDefaultEvidence();

    // 17. Save persistent memory.
    try {
      await PredictiveMemoryBank.saveSituationState(
        activeSessionId,
        {
          lastInput: message,
          threatLevel,
          intel:
            typeof radarIntel === 'string'
              ? radarIntel
              : JSON.stringify(radarIntel ?? 'NONE'),
          timestamp: new Date().toISOString(),
        },
      );

      console.log(
        '[ADK API]: Session memory persistence completed.',
      );
    } catch (memoryError) {
      console.error(
        '[ADK API]: Memory persistence failed. Returning the completed swarm response.',
        memoryError,
      );
    }

    // 18. Resilience prediction.
    let resiliencePrediction =
      'Resilience engine standing by.';

    if (
      threatLevel === 'HIGH' ||
      threatLevel === 'CRITICAL'
    ) {
      try {
        resiliencePrediction =
          await PredictiveMemoryBank.predictThreatEvolution(
            activeSessionId,
          );
      } catch (predictionError) {
        console.error(
          '[ADK API]: Resilience prediction failed.',
          predictionError,
        );

        resiliencePrediction =
          'Prediction temporarily unavailable. Rely on verified live intelligence.';
      }
    }

    // 19. Response diagnostics.
    const routeTypes = Object.values(resolvedRoutes)
      .filter(isRecord)
      .map((route: JsonRecord) =>
        typeof route.routeType === 'string'
          ? route.routeType
          : 'UNKNOWN',
      );

    console.log(
      '[ADK API]: Crisis fleet response prepared.',
      {
        requestId,
        threatLevel,
        agents: {
          mindGuard: Boolean(mindGuardResult),
          scavenger: Boolean(scavengerResult),
          radar: radarIntel !== null,
          medical: Array.isArray(medicalData),
          navigator: Boolean(rawNavigationData),
          vault: Boolean(rawVaultData),
          publicHealth: Boolean(healthData),
          verifier: Boolean(rawEvidence),
        },
        navigation: {
          hasUserCoordinates: Boolean(userCoords),
          hasPrimaryDestination: hasFacilityCoordinates(
            resolvedDestCoords,
          ),
          facilityCoordinateCount,
          routeTypes,
          isRealData: resolvedIsRealData,
        },
      },
    );

    // 20. Final response.
    return NextResponse.json(
      {
        type: 'success',
        requestId,
        sessionId: activeSessionId,
        threatLevel,

        // Radar
        radarIntel,

        // Medical
        medical: medicalData,

        // Navigation: preserve legacy payload and expose
        // facilities/routes as first-class response fields.
        navigation: navigationData,
        navigationText: resolvedNavigationText,
        destCoords: resolvedDestCoords,
        isRealData: resolvedIsRealData,
        facilities: resolvedFacilities,
        routes: resolvedRoutes,

        // Legacy facility fields
        hospital: hospitalFacility,
        bunker: bunkerFacility,

        // Vault
        vault: vaultData,

        // Verification
        evidence: evidencePanel,

        // Public Health
        healthAdvisory,
        officialAlerts,
        outbreakReports,
        healthMetadata,

        // Predictive Memory
        resiliencePrediction,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[ADK Swarm Orchestrator]: Critical execution failure.',
      {
        error,
        requestId,
      },
    );

    return NextResponse.json(
      {
        type: 'error',
        requestId,
        message:
          'ChayRa could not complete the crisis request. Please retry.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
