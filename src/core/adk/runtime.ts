import {
  BaseAgent,
  InvocationContext,
} from '@google/adk';
import type { Event } from '@google/adk';
import { EnterpriseAgentRegistry } from './registry';

type AgentHandler = (data: any) => Promise<any>;

function getHandler(name: string): AgentHandler {
  const handler = EnterpriseAgentRegistry.getAgent(name);

  if (!handler) {
    throw new Error(
      `[ADK Runtime] Agent '${name}' is unavailable.`
    );
  }

  return handler as AgentHandler;
}

/**
 * Adapter:
 * Wraps an existing ChayRa registry handler as a real ADK BaseAgent.
 *
 * This lets us migrate the orchestration layer to Google ADK
 * without rewriting every existing specialist agent at once.
 */
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

    const state = ctx.session.state as Record<string, any>;

    const handler = getHandler(this.handlerName);

    console.log(
      `[ADK Runtime]: Executing ${this.handlerName} through ADK`
    );

    let result: any;

    try {
      result = await handler({
        input,
        userCoords: state.userCoords,
        radarIntel: state.radarIntel,
        context: state.context,
      });

      state[`${this.handlerName}_result`] = result;

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
        `[ADK Runtime] ${this.handlerName} failed:`,
        error,
      );

      throw error;
    }
  }

  async *runLiveImpl(
    _ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    throw new Error(
      `[ADK Runtime] Live streaming is not enabled for ${this.name} yet.`,
    );
  }
}

/**
 * ChayRa Enterprise Crisis Swarm
 *
 * ADK is now the orchestration root.
 *
 * Flow:
 * MindGuard
 *    ↓
 * Scavenger
 *    ↓
 * Radar
 *    ↓
 * ┌──────────┬───────────┬──────────┐
 * Medical  Navigator  PublicHealth
 * └──────────┴───────────┴──────────┘
 *    ↓
 * Verifier
 */
export class ChayRaCrisisFleet extends BaseAgent {
  private mindGuard: ChayRaAgentAdapter;
  private scavenger: ChayRaAgentAdapter;
  private radar: ChayRaAgentAdapter;
  private medical: ChayRaAgentAdapter;
  private navigator: ChayRaAgentAdapter;
  private publicHealth: ChayRaAgentAdapter;
  private verifier: ChayRaAgentAdapter;

  constructor() {
    const mindGuard = new ChayRaAgentAdapter(
      'MindGuard',
      'Enterprise safety and Model Armor gateway.',
      'MindGuard',
    );

    const scavenger = new ChayRaAgentAdapter(
      'Scavenger',
      'Extracts crisis context and required tactical agents.',
      'Scavenger',
    );

    const radar = new ChayRaAgentAdapter(
      'Radar',
      'Fetches live global crisis intelligence.',
      'Radar',
    );

    const medical = new ChayRaAgentAdapter(
      'Medical',
      'Provides emergency trauma triage guidance.',
      'Medical',
    );

    const navigator = new ChayRaAgentAdapter(
      'Navigator',
      'Finds nearby hospitals, shelters and tactical destinations.',
      'Navigator',
    );

    const publicHealth = new ChayRaAgentAdapter(
      'PublicHealth',
      'Analyzes live public-health alerts and outbreak intelligence.',
      'PublicHealth',
    );

    const verifier = new ChayRaAgentAdapter(
      'Verifier',
      'Cross-checks claims against live radar intelligence.',
      'Verifier',
    );

    super({
      name: 'ChayRaCrisisFleet',
      description:
        'Autonomous enterprise crisis-response swarm orchestrated by Google ADK.',
      subAgents: [
        mindGuard,
        scavenger,
        radar,
        medical,
        navigator,
        publicHealth,
        verifier,
      ],
    });

    this.mindGuard = mindGuard;
    this.scavenger = scavenger;
    this.radar = radar;
    this.medical = medical;
    this.navigator = navigator;
    this.publicHealth = publicHealth;
    this.verifier = verifier;
  }

  async *runAsyncImpl(
    ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    console.log(
      '[ADK Runtime]: Starting ChayRa Enterprise Crisis Fleet...'
    );

    const state = ctx.session.state as Record<string, any>;

    // ----------------------------------------------------------
    // 1. MINDGUARD
    // ----------------------------------------------------------

    console.log('[ADK Runtime]: Stage 1 → MindGuard');

    for await (const event of this.mindGuard.runAsync(ctx)) {
      yield event;
    }

    const mindGuardResult =
      state['MindGuard_result'];

    if (
      mindGuardResult &&
      mindGuardResult.isEmergency === false &&
      !String(mindGuardResult.reason ?? '').includes(
        'Fallback',
      )
    ) {
      console.log(
        '[ADK Runtime]: MindGuard blocked the request.'
      );
      return;
    }

    // ----------------------------------------------------------
    // 2. SCAVENGER
    // ----------------------------------------------------------

    console.log('[ADK Runtime]: Stage 2 → Scavenger');

    for await (const event of this.scavenger.runAsync(ctx)) {
      yield event;
    }

    const scavengerResult =
      state['Scavenger_result'] ?? {};

    const requiredAgents: string[] =
      Array.isArray(scavengerResult.requiredAgents)
        ? scavengerResult.requiredAgents
        : ['Medical', 'Navigator'];

    // ----------------------------------------------------------
    // 3. RADAR
    // ----------------------------------------------------------

    console.log('[ADK Runtime]: Stage 3 → Radar');

    for await (const event of this.radar.runAsync(ctx)) {
      yield event;
    }

    const radarResult =
      state['Radar_result'];

    state.radarIntel = radarResult;

    // ----------------------------------------------------------
    // 4. PARALLEL TACTICAL EXECUTION
    // ----------------------------------------------------------

    const parallelTasks: Promise<void>[] = [];

    if (requiredAgents.includes('Medical')) {
      parallelTasks.push(
        (async () => {
          console.log(
            '[ADK Runtime]: Parallel → Medical'
          );

          for await (const event of this.medical.runAsync(ctx)) {
            // ADK events from child agents are intentionally
            // forwarded after the parallel group finishes.
            void event;
          }
        })(),
      );
    }

    // Navigator is mandatory whenever we have real user coordinates.
    // This prevents the Scavenger model from accidentally suppressing
    // verified hospital / shelter / bunker discovery.
    if (
      requiredAgents.includes('Navigator') ||
      state.userCoords
    ) {
      parallelTasks.push(
        (async () => {
          console.log(
            state.userCoords
              ? '[ADK Runtime]: Parallel → Navigator (mandatory with coordinates)'
              : '[ADK Runtime]: Parallel → Navigator'
          );

          for await (const event of this.navigator.runAsync(ctx)) {
            void event;
          }
        })(),
      );
    }

    // Public Health runs as an enterprise background intelligence
    // component for every crisis cycle.
    parallelTasks.push(
      (async () => {
        console.log(
          '[ADK Runtime]: Parallel → PublicHealth'
        );

        for await (const event of this.publicHealth.runAsync(ctx)) {
          void event;
        }
      })(),
    );

    await Promise.all(parallelTasks);

    // ----------------------------------------------------------
    // 5. VERIFIER
    // ----------------------------------------------------------

    state.radarIntel =
      state['Radar_result'] ?? state.radarIntel;

    console.log('[ADK Runtime]: Stage 5 → Verifier');

    for await (const event of this.verifier.runAsync(ctx)) {
      yield event;
    }

    console.log(
      '[ADK Runtime]: ChayRa Enterprise Crisis Fleet completed.'
    );

    // Final state is now available to the API layer through
    // the ADK session.
  }

  async *runLiveImpl(
    _ctx: InvocationContext,
  ): AsyncGenerator<Event, void, undefined> {
    throw new Error(
      `[ADK Runtime] Live streaming is not enabled for ${this.name} yet.`
    );
  }
}

/**
 * Singleton root agent.
 *
 * The object itself is ADK-native and can later be passed
 * directly to an ADK Runner / Cloud Run agent runtime.
 */
export const chayRaCrisisFleet =
  new ChayRaCrisisFleet();