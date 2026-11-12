
import {
  BaseAgent,
  InvocationContext,
} from '@google/adk';

import type { Event } from '@google/adk';

import { EnterpriseAgentRegistry } from './registry';

// ============================================================
// TYPES
// ============================================================

type Coordinates = {
  lat: number;
  lng: number;
};

type AgentHandler = (data: any) => Promise<any>;

type SpecialistAgent = {
  name: string;
  agent: ChayRaAgentAdapter;
};

// ============================================================
// HELPERS
// ============================================================

function getHandler(name: string): AgentHandler {
  const handler =
    EnterpriseAgentRegistry.getAgent(name);

  if (!handler) {
    throw new Error(
      `[ADK Runtime] Agent '${name}' is unavailable.`,
    );
  }

  return handler as AgentHandler;
}

function isValidCoordinates(
  value: unknown,
): value is Coordinates {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const coords = value as Record<string, unknown>;

  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

function normalizeRequiredAgents(
  value: unknown,
): string[] {
  const allowedAgents = [
    'Medical',
    'Navigator',
    'Vault',
  ];

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (agent): agent is string =>
          typeof agent === 'string' &&
          allowedAgents.includes(agent),
      ),
    ),
  );
}

// ============================================================
// ADK AGENT ADAPTER
// ============================================================

class ChayRaAgentAdapter extends BaseAgent {
  private handlerName: string;

  constructor(
    name: string,
    description: string,
    handlerName: string,
  ) {
    super({
      name,
      description,
    });

    this.handlerName = handlerName;
  }

  async *runAsyncImpl(
    ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    const input =
      ctx.userContent?.parts?.[0]?.text ?? '';

    const state =
      ctx.session.state as Record<string, any>;

    const handler =
      getHandler(this.handlerName);

    console.log(
      `[ADK Runtime]: Executing ${this.handlerName} through ADK.`,
    );

    try {
      const result = await handler({
        input,
        userCoords: state.userCoords,
        radarIntel: state.radarIntel,
        context: state.context,
      });

      // Save the complete result in ADK session state.
      state[`${this.handlerName}_result`] = result;

      // Forward the complete result to the API event stream.
      yield {
        id: `adk-${this.handlerName}-${Date.now()}`,
        invocationId: ctx.invocationId,
        author: this.name,
        content: {
          parts: [
            {
              text: JSON.stringify(result),
            },
          ],
        },
        actions: {},
        timestamp: Date.now(),
      } as Event;

    } catch (error) {
      console.error(
        `[ADK Runtime]: ${this.handlerName} failed.`,
        error,
      );

      throw error;
    }
  }

  async *runLiveImpl(
    _ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    throw new Error(
      `[ADK Runtime] Live streaming is not enabled for ${this.name}.`,
    );
  }
}

// ============================================================
// CHAYRA ENTERPRISE CRISIS FLEET
// ============================================================

export class ChayRaCrisisFleet extends BaseAgent {
  private mindGuard: ChayRaAgentAdapter;
  private scavenger: ChayRaAgentAdapter;
  private radar: ChayRaAgentAdapter;
  private medical: ChayRaAgentAdapter;
  private navigator: ChayRaAgentAdapter;
  private publicHealth: ChayRaAgentAdapter;
  private verifier: ChayRaAgentAdapter;
  private vault: ChayRaAgentAdapter;

  constructor() {
    const mindGuard = new ChayRaAgentAdapter(
      'MindGuard',
      'Basic structural input validation; not a prompt-injection security filter.',
      'MindGuard',
    );

    const scavenger = new ChayRaAgentAdapter(
      'Scavenger',
      'Extracts crisis context and suggests specialist agents.',
      'Scavenger',
    );

    const radar = new ChayRaAgentAdapter(
      'Radar',
      'Reads the latest saved global threat snapshot.',
      'Radar',
    );

    const medical = new ChayRaAgentAdapter(
      'Medical',
      'Provides emergency medical triage guidance.',
      'Medical',
    );

    const navigator = new ChayRaAgentAdapter(
      'Navigator',
      'Searches nearby hospitals, clinics, shelters and bunkers using user coordinates.',
      'Navigator',
    );

    const publicHealth = new ChayRaAgentAdapter(
      'PublicHealth',
      'Reads cached WHO and UN ReliefWeb intelligence snapshots.',
      'PublicHealth',
    );

    const verifier = new ChayRaAgentAdapter(
      'Verifier',
      'Cross-checks user claims against available radar intelligence.',
      'Verifier',
    );

    const vault = new ChayRaAgentAdapter(
      'Vault',
      'Generates rescue beacons and offline communication guidance.',
      'Vault',
    );

    super({
      name: 'ChayRaCrisisFleet',

      description:
        'Autonomous crisis response fleet orchestrated through Google ADK.',

      subAgents: [
        mindGuard,
        scavenger,
        radar,
        medical,
        navigator,
        publicHealth,
        verifier,
        vault,
      ],
    });

    this.mindGuard = mindGuard;
    this.scavenger = scavenger;
    this.radar = radar;
    this.medical = medical;
    this.navigator = navigator;
    this.publicHealth = publicHealth;
    this.verifier = verifier;
    this.vault = vault;
  }

  // ==========================================================
  // MAIN EXECUTION
  // ==========================================================

  async *runAsyncImpl(
    ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    console.log(
      '[ADK Runtime]: Starting ChayRa Enterprise Crisis Fleet...',
    );

    const state =
      ctx.session.state as Record<string, any>;

    const userCoords = state.userCoords;

    const hasUserCoordinates =
      isValidCoordinates(userCoords);

    console.log(
      `[ADK Runtime]: Location available: ${hasUserCoordinates}.`,
    );

    // --------------------------------------------------------
    // STAGE 1 — MINDGUARD
    // --------------------------------------------------------

    console.log(
      '[ADK Runtime]: Stage 1 → MindGuard.',
    );

    for await (
      const event of this.mindGuard.runAsync(ctx)
    ) {
      yield event;
    }

    const mindGuardResult =
      state.MindGuard_result;

    if (
      mindGuardResult &&
      mindGuardResult.isEmergency === false
    ) {
      console.warn(
        '[ADK Runtime]: MindGuard rejected the request.',
      );

      return;
    }

    // --------------------------------------------------------
    // STAGE 2 — SCAVENGER
    // --------------------------------------------------------

    console.log(
      '[ADK Runtime]: Stage 2 → Scavenger.',
    );

    for await (
      const event of this.scavenger.runAsync(ctx)
    ) {
      yield event;
    }

    const scavengerResult =
      state.Scavenger_result ?? {};

    // Scavenger may recommend optional agents.
    const modelRequiredAgents =
      normalizeRequiredAgents(
        scavengerResult.requiredAgents,
      );

    // --------------------------------------------------------
    // MANDATORY AGENT ROUTING
    // --------------------------------------------------------

    // Medical is always part of a crisis-response cycle.
    //
    // Navigator is mandatory whenever valid user coordinates
    // exist. A model decision must never silently disable
    // nearby hospital / shelter / bunker discovery.

    const requiredAgents = new Set<string>();

    requiredAgents.add('Medical');

    if (hasUserCoordinates) {
      requiredAgents.add('Navigator');
    }

    // Vault remains conditional on Scavenger's recommendation.
    if (modelRequiredAgents.includes('Vault')) {
      requiredAgents.add('Vault');
    }

    state.requiredAgents =
      Array.from(requiredAgents);

    console.log(
      '[ADK Runtime]: Specialist routing plan:',
      {
        modelSuggested: modelRequiredAgents,
        scheduledAgents: state.requiredAgents,
        locationAvailable: hasUserCoordinates,
      },
    );

    if (!hasUserCoordinates) {
      console.warn(
        '[ADK Runtime]: Navigator skipped because valid GPS/pin coordinates are missing.',
      );
    }

    // --------------------------------------------------------
    // STAGE 3 — RADAR
    // --------------------------------------------------------

    console.log(
      '[ADK Runtime]: Stage 3 → Radar.',
    );

    for await (
      const event of this.radar.runAsync(ctx)
    ) {
      yield event;
    }

    const radarResult =
      state.Radar_result;

    state.radarIntel = radarResult;

    // --------------------------------------------------------
    // STAGE 4 — PARALLEL SPECIALIST EXECUTION
    // --------------------------------------------------------

    console.log(
      '[ADK Runtime]: Stage 4 → Parallel specialist execution.',
    );

    const specialists: SpecialistAgent[] = [
      {
        name: 'Medical',
        agent: this.medical,
      },
      {
        name: 'Navigator',
        agent: this.navigator,
      },
      {
        name: 'Vault',
        agent: this.vault,
      },
      {
        name: 'PublicHealth',
        agent: this.publicHealth,
      },
    ];

    const parallelEvents: Event[] = [];

    const parallelTasks =
      specialists
        .filter(specialist => {
          if (
            specialist.name === 'PublicHealth'
          ) {
            return true;
          }

          return requiredAgents.has(
            specialist.name,
          );
        })
        .map(async specialist => {
          console.log(
            `[ADK Runtime]: Parallel → ${specialist.name}.`,
          );

          try {
            for await (
              const event of specialist.agent.runAsync(ctx)
            ) {
              parallelEvents.push(event);
            }

            console.log(
              `[ADK Runtime]: ${specialist.name} completed.`,
            );

          } catch (error) {
            // An individual specialist failure should not
            // prevent the remaining agents from running.

            console.error(
              `[ADK Runtime]: ${specialist.name} execution failed.`,
              error,
            );
          }
        });

    await Promise.all(parallelTasks);

    // Forward all successfully completed specialist events
    // to the root runner and API event collector.

    for (const event of parallelEvents) {
      yield event;
    }

    // --------------------------------------------------------
    // STAGE 5 — VERIFIER
    // --------------------------------------------------------

    state.radarIntel =
      state.Radar_result ?? state.radarIntel;

    console.log(
      '[ADK Runtime]: Stage 5 → Verifier.',
    );

    try {
      for await (
        const event of this.verifier.runAsync(ctx)
      ) {
        yield event;
      }
    } catch (error) {
      console.error(
        '[ADK Runtime]: Verifier execution failed.',
        error,
      );
    }

    // --------------------------------------------------------
    // FINAL EXECUTION SUMMARY
    // --------------------------------------------------------

    console.log(
      '[ADK Runtime]: ChayRa Enterprise Crisis Fleet completed.',
      {
        coordinatesAvailable: hasUserCoordinates,

        agentsScheduled: state.requiredAgents,

        agentsCompleted: {
          mindGuard: Boolean(state.MindGuard_result),
          scavenger: Boolean(state.Scavenger_result),
          radar: state.Radar_result !== undefined,
          medical: state.Medical_result !== undefined,
          navigator: state.Navigator_result !== undefined,
          vault: state.Vault_result !== undefined,
          publicHealth:
            state.PublicHealth_result !== undefined,
          verifier: state.Verifier_result !== undefined,
        },
      },
    );
  }

  async *runLiveImpl(
    _ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    throw new Error(
      `[ADK Runtime] Live streaming is not enabled for ${this.name}.`,
    );
  }
}

// ============================================================
// ROOT AGENT
// ============================================================

export const chayRaCrisisFleet =
  new ChayRaCrisisFleet();
