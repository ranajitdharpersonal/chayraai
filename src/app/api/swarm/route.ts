
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { InMemoryRunner } from '@google/adk';
import { createUserContent } from '@google/genai';

import { PredictiveMemoryBank } from '@/core/adk/memory';
import { chayRaCrisisFleet } from '@/core/adk/runtime';

// ============================================================
// SPECIALIST AGENT REGISTRATION
// ============================================================

import '@/core/agents/mindguard';
import '@/core/agents/scavenger';
import '@/core/agents/radar';
import '@/core/agents/medical';
import '@/core/agents/navigator';
import '@/core/agents/publicHealth';
import '@/core/agents/vault';
import '@/core/agents/verifier';

// ============================================================
// RUNTIME CONFIGURATION
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_NAME = 'chayra-enterprise-fleet';

const DEFAULT_USER_ID = 'chayra-web-guest';

const MAX_MESSAGE_LENGTH = 20_000;

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

// ============================================================
// REQUEST HELPERS
// ============================================================

function isRecord(
  value: unknown,
): value is JsonRecord {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value),
  );
}

function isValidUUID(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function resolveSessionId(
  value: unknown,
): string {
  // Accept only UUID session identifiers.
  // Old static identifiers such as demo-session-2026
  // are replaced with new unique identifiers.

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
    return {
      valid: true,
    };
  }

  if (!isRecord(value)) {
    return {
      valid: false,
    };
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
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    coordinates: {
      lat,
      lng,
    },
  };
}

function getSafeThreatLevel(
  value: unknown,
): string {
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

// ============================================================
// ADK EVENT EXTRACTION
// ============================================================

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
    // Radar and Vault intentionally return plain text.
    // Other agents must return structured JSON.

    if (
      author === 'Radar' ||
      author === 'Vault'
    ) {
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

// ============================================================
// SAFE DEFAULT RESULTS
// ============================================================

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
      'Navigation result unavailable. Enable GPS or provide a tactical pin to search for verified facilities.',
    destCoords: null,
    isRealData: false,
    lookupStatus: 'UNAVAILABLE',
    facility: null,
    hospital: null,
    bunker: null,
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

// ============================================================
// MAIN SWARM API
// ============================================================

export async function POST(req: Request) {
  const requestId = randomUUID();

  console.log(
    `[ADK API]: Incoming swarm request [${requestId}].`,
  );

  try {

    // --------------------------------------------------------
    // 1. PARSE REQUEST BODY
    // --------------------------------------------------------

    let payload: JsonRecord;

    try {
      const parsed = await req.json();

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

    } catch {
      return NextResponse.json(
        {
          type: 'error',
          message: 'Request body must contain valid JSON.',
        },
        { status: 400 },
      );
    }

    // --------------------------------------------------------
    // 2. VALIDATE USER INPUT
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 3. VALIDATE GPS COORDINATES
    // --------------------------------------------------------

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

    const userCoords =
      coordinateResult.coordinates;

    // --------------------------------------------------------
    // 4. RESOLVE UNIQUE SESSION
    // --------------------------------------------------------

    const activeSessionId =
      resolveSessionId(payload.sessionId);

    const userId = DEFAULT_USER_ID;

    console.log(
      `[ADK API]: Session initialized. Session=${activeSessionId}`,
    );

    // --------------------------------------------------------
    // 5. INITIALIZE ADK RUNNER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 6. PREPARE USER MESSAGE
    // --------------------------------------------------------

    const newMessage = createUserContent(
      message,
    );

    // --------------------------------------------------------
    // 7. EXECUTE CRISIS FLEET
    // --------------------------------------------------------

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

      console.log(
        `[ADK Event]: ${author}`,
      );

      const extracted =
        extractEventResult(event);

      if (extracted) {
        eventResults[extracted.author] =
          extracted.result;
      }
    }

    console.log(
      '[ADK API]: Agent execution completed.',
    );

    // --------------------------------------------------------
    // 8. RETRIEVE COMPLETED ADK SESSION
    // --------------------------------------------------------

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

    const sessionState =
      isRecord(completedSession.state)
        ? completedSession.state
        : {};

    // --------------------------------------------------------
    // 9. MINDGUARD RESULT
    // --------------------------------------------------------

    const mindGuardResult =
      resolveAgentResult(
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

    // --------------------------------------------------------
    // 10. SCAVENGER RESULT
    // --------------------------------------------------------

    const scavengerResult =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Scavenger',
      );

    const threatLevel =
      getSafeThreatLevel(
        scavengerResult?.threatLevel,
      );

    // --------------------------------------------------------
    // 11. RADAR RESULT
    // --------------------------------------------------------

    const radarIntel =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Radar',
      );

    // --------------------------------------------------------
    // 12. MEDICAL RESULT
    // --------------------------------------------------------

    const rawMedicalData =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Medical',
      );

    const medicalData =
      Array.isArray(rawMedicalData)
        ? rawMedicalData.filter(
            (item: unknown) =>
              typeof item === 'string',
          )
        : getDefaultMedicalResult();

    // --------------------------------------------------------
    // 13. NAVIGATOR RESULT
    // --------------------------------------------------------

    const rawNavigationData =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Navigator',
      );

    const navigationData =
      isRecord(rawNavigationData)
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

    // --------------------------------------------------------
    // 14. VAULT RESULT
    // --------------------------------------------------------

    const rawVaultData =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Vault',
      );

    const vaultData =
      typeof rawVaultData === 'string'
        ? rawVaultData
        : 'Identity standby. Rescue beacon was not generated in this cycle.';

    // --------------------------------------------------------
    // 15. PUBLIC HEALTH RESULT
    // --------------------------------------------------------

    const rawHealthData =
      resolveAgentResult(
        eventResults,
        sessionState,
        'PublicHealth',
      );

    const healthData =
      isRecord(rawHealthData)
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

    // --------------------------------------------------------
    // 16. VERIFIER RESULT
    // --------------------------------------------------------

    const rawEvidence =
      resolveAgentResult(
        eventResults,
        sessionState,
        'Verifier',
      );

    const evidencePanel =
      isRecord(rawEvidence)
        ? rawEvidence
        : getDefaultEvidence();

    // --------------------------------------------------------
    // 17. SAVE PERSISTENT MEMORY
    // --------------------------------------------------------

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

      // Memory failure must not cancel the completed rescue result.

      console.error(
        '[ADK API]: Memory persistence failed. Returning the completed swarm response.',
        memoryError,
      );
    }

    // --------------------------------------------------------
    // 18. RESILIENCE PREDICTION
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 19. RESPONSE DIAGNOSTICS
    // --------------------------------------------------------

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
          hasCoordinates: Boolean(resolvedDestCoords),
          isRealData: resolvedIsRealData,
        },
      },
    );

    // --------------------------------------------------------
    // 20. FINAL RESPONSE
    // --------------------------------------------------------

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

        // Navigation
        navigation: navigationData,

        navigationText: resolvedNavigationText,

        destCoords: resolvedDestCoords,

        isRealData: resolvedIsRealData,

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
