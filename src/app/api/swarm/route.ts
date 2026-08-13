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

function extractEventResult(event: any): any | null {
  const author =
    typeof event?.author === 'string'
      ? event.author
      : '';

  if (!author) {
    return null;
  }

  const text =
    event?.content?.parts
      ?.map((part: any) => part?.text)
      ?.filter(
        (value: unknown): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0,
      )
      ?.join('\n')
      ?.trim() || '';

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Some ADK events can contain ordinary text.
    // They are useful for logging but not safe to treat as
    // structured agent output.
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { message, coords, sessionId } =
      await req.json();

    if (
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return NextResponse.json(
        {
          type: 'error',
          message:
            'A valid crisis message is required.',
        },
        { status: 400 },
      );
    }

    const activeSessionId =
      typeof sessionId === 'string' &&
      sessionId.trim()
        ? sessionId
        : `session-${Date.now()}`;

    const userId = DEFAULT_USER_ID;

    console.log(
      `[ADK API]: Starting ChayRa Enterprise Fleet for session ${activeSessionId}`,
    );

    const runner =
      new InMemoryRunner({
        agent: chayRaCrisisFleet,
        appName: APP_NAME,
      });

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
          startedAt:
            new Date().toISOString(),
        },
      },
    });

    const newMessage =
      createUserContent(
        message.trim(),
      );

    // Capture structured agent results directly from ADK events.
    // This is the primary result path. Session state remains the
    // persistence/fallback path.
    const eventResults: Record<
      string,
      any
    > = {};

    for await (const event of runner.runAsync({
      userId,
      sessionId: activeSessionId,
      newMessage,
    })) {
      console.log(
        `[ADK Event]: ${
          event.author || 'unknown'
        }`,
      );

      const structuredResult =
        extractEventResult(event);

      if (
        structuredResult &&
        typeof event.author ===
          'string'
      ) {
        eventResults[
          event.author
        ] = structuredResult;
      }
    }

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

    const state =
      completedSession.state as Record<
        string,
        any
      >;

    const mindGuardResult =
      eventResults.MindGuard ??
      state['MindGuard_result'] ??
      null;

    if (
      mindGuardResult &&
      mindGuardResult.isEmergency ===
        false &&
      !String(
        mindGuardResult.reason ??
          '',
      ).includes('Fallback')
    ) {
      return NextResponse.json({
        type: 'spam',
        message:
          mindGuardResult.reason ||
          'Request blocked by ChayRa safety policy.',
      });
    }

    const scavengerResult =
      eventResults.Scavenger ??
      state['Scavenger_result'] ??
      {
        threatLevel:
          'UNKNOWN',
        requiredAgents: [],
      };

    const radarIntel =
      eventResults.Radar ??
      state['Radar_result'] ??
      null;

    const medicalData =
      eventResults.Medical ??
      state['Medical_result'] ??
      null;

    const navigationData =
      eventResults.Navigator ??
      state['Navigator_result'] ??
      null;

    const healthData =
      eventResults.PublicHealth ??
      state['PublicHealth_result'] ??
      null;

    const evidencePanel =
      eventResults.Verifier ??
      state['Verifier_result'] ??
      null;

    await PredictiveMemoryBank.saveSituationState(
      activeSessionId,
      {
        lastInput: message,
        threatLevel:
          scavengerResult.threatLevel,
        intel: radarIntel,
        timestamp:
          new Date().toISOString(),
      },
    );

    let resiliencePrediction =
      'Resilience engine standing by.';

    const threatLevel =
      String(
        scavengerResult.threatLevel ??
          'UNKNOWN',
      ).toUpperCase();

    if (
      threatLevel === 'HIGH' ||
      threatLevel === 'CRITICAL'
    ) {
      resiliencePrediction =
        await PredictiveMemoryBank
          .predictThreatEvolution(
            activeSessionId,
          );
    }

    const resolvedDestCoords =
      navigationData?.destCoords ??
      state['Navigator_result']
        ?.destCoords ??
      null;

    const resolvedNavigationText =
      navigationData?.text ??
      state['Navigator_result']
        ?.text ??
      null;

    const resolvedIsRealData =
      navigationData?.isRealData ??
      state['Navigator_result']
        ?.isRealData ??
      false;

    console.log(
      '[ADK API]: Navigator result resolution:',
      {
        hasNavigatorEvent:
          Boolean(
            eventResults.Navigator,
          ),
        hasNavigatorState:
          Boolean(
            state[
              'Navigator_result'
            ],
          ),
        hasDestCoords:
          Boolean(
            resolvedDestCoords,
          ),
        isRealData:
          resolvedIsRealData,
      },
    );

    return NextResponse.json({
      type: 'success',
      sessionId:
        activeSessionId,

      threatLevel:
        scavengerResult.threatLevel,

      radarIntel,

      medical:
        medicalData,

      navigation:
        navigationData,

      navigationText:
        resolvedNavigationText,

      destCoords:
        resolvedDestCoords,

      isRealData:
        resolvedIsRealData,

      evidence:
        evidencePanel,

      healthAdvisory:
        healthData
          ?.healthAdvisory,

      outbreakReports:
        healthData
          ?.outbreakReports,

      resiliencePrediction,
    });
  } catch (error: any) {
    console.error(
      '[ADK Swarm Orchestrator]: Critical Failure',
      error,
    );

    return NextResponse.json(
      {
        type: 'error',
        message:
          error?.message ||
          'Unknown ADK Swarm Error',
      },
      { status: 500 },
    );
  }
}