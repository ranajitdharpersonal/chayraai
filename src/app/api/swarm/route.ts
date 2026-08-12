import { NextResponse } from 'next/server';
import { InMemoryRunner } from '@google/adk';
import { createUserContent } from '@google/genai';

import { PredictiveMemoryBank } from '@/core/adk/memory';
import { chayRaCrisisFleet } from '@/core/adk/runtime';

// Load all specialist agents so they register themselves
// with the Enterprise Agent Registry before ADK starts.
import '@/core/agents/mindguard';
import '@/core/agents/scavenger';
import '@/core/agents/radar';
import '@/core/agents/medical';
import '@/core/agents/navigator';
import '@/core/agents/verifier';
import '@/core/agents/publicHealth';

const APP_NAME = 'chayra-enterprise-fleet';
const DEFAULT_USER_ID = 'chayra-user';

export async function POST(req: Request) {
  try {
    const { message, coords, sessionId } = await req.json();

    if (
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return NextResponse.json(
        {
          type: 'error',
          message: 'A valid crisis message is required.',
        },
        { status: 400 }
      );
    }

    const activeSessionId =
      typeof sessionId === 'string' && sessionId.trim()
        ? sessionId
        : `session-${Date.now()}`;

    const userId = DEFAULT_USER_ID;

    console.log(
      `[ADK API]: Starting ChayRa Enterprise Fleet for session ${activeSessionId}`
    );

    // ----------------------------------------------------------
    // 1. CREATE ADK RUNNER
    // ----------------------------------------------------------

    const runner = new InMemoryRunner({
      agent: chayRaCrisisFleet,
      appName: APP_NAME,
    });

    // ----------------------------------------------------------
    // 2. CREATE ADK SESSION
    // ----------------------------------------------------------
    //
    // State is available to every ChayRa adapter through
    // InvocationContext.session.state.
    //
    // Navigator needs user coordinates.
    // Other agents can access shared context here as needed.
    //

    await runner.sessionService.createSession({
      appName: APP_NAME,
      userId,
      sessionId: activeSessionId,
      state: {
        userCoords:
          coords &&
          typeof coords.lat === 'number' &&
          typeof coords.lng === 'number'
            ? coords
            : undefined,

        context: {
          source: 'chayra-web',
          startedAt: new Date().toISOString(),
        },
      },
    });

    // ----------------------------------------------------------
    // 3. RUN THE ENTIRE CRISIS FLEET THROUGH ADK
    // ----------------------------------------------------------

    const newMessage = createUserContent(
      message.trim()
    );

    for await (const event of runner.runAsync({
      userId,
      sessionId: activeSessionId,
      newMessage,
    })) {
      console.log(
        `[ADK Event]: ${event.author || 'unknown'}`
      );
    }

    // ----------------------------------------------------------
    // 4. READ THE FINAL ADK SESSION STATE
    // ----------------------------------------------------------

    const completedSession =
      await runner.sessionService.getSession({
        appName: APP_NAME,
        userId,
        sessionId: activeSessionId,
      });

    if (!completedSession) {
      throw new Error(
        'ADK session could not be retrieved after execution.'
      );
    }

    const state =
      completedSession.state as Record<string, any>;

    const mindGuardResult =
      state['MindGuard_result'] ?? null;

    // ----------------------------------------------------------
    // 5. HANDLE MINDGUARD BLOCK
    // ----------------------------------------------------------

    if (
      mindGuardResult &&
      mindGuardResult.isEmergency === false &&
      !String(
        mindGuardResult.reason ?? ''
      ).includes('Fallback')
    ) {
      return NextResponse.json({
        type: 'spam',
        message:
          mindGuardResult.reason ||
          'Request blocked by ChayRa safety policy.',
      });
    }

    // ----------------------------------------------------------
    // 6. EXTRACT ADK AGENT RESULTS
    // ----------------------------------------------------------

    const scavengerResult =
      state['Scavenger_result'] ?? {
        threatLevel: 'UNKNOWN',
        requiredAgents: [],
      };

    const radarIntel =
      state['Radar_result'] ?? null;

    const medicalData =
      state['Medical_result'] ?? null;

    const navigationData =
      state['Navigator_result'] ?? null;

    const healthData =
      state['PublicHealth_result'] ?? null;

    const evidencePanel =
      state['Verifier_result'] ?? null;

    // ----------------------------------------------------------
    // 7. PERSIST ENTERPRISE MEMORY
    // ----------------------------------------------------------

    await PredictiveMemoryBank.saveSituationState(
      activeSessionId,
      {
        lastInput: message,
        threatLevel:
          scavengerResult.threatLevel,
        intel: radarIntel,
        timestamp:
          new Date().toISOString(),
      }
    );

    // ----------------------------------------------------------
    // 8. RETURN THE SAME API CONTRACT USED BY THE UI
    // ----------------------------------------------------------

    return NextResponse.json({
  type: 'success',
  sessionId: activeSessionId,
  threatLevel: scavengerResult.threatLevel,
  radarIntel,
  medical: medicalData,

  // Keep the full Navigator result
  navigation: navigationData,

  // Expose coordinates directly for the map layer
  destCoords: navigationData?.destCoords ?? null,

  // Optional convenience flag for the UI
  isRealData: navigationData?.isRealData ?? false,

  evidence: evidencePanel,
  healthAdvisory: healthData?.healthAdvisory,
  outbreakReports: healthData?.outbreakReports,
});

  } catch (error: any) {
    console.error(
      '[ADK Swarm Orchestrator]: Critical Failure',
      error
    );

    return NextResponse.json(
      {
        type: 'error',
        message:
          error?.message ||
          'Unknown ADK Swarm Error',
      },
      { status: 500 }
    );
  }
}