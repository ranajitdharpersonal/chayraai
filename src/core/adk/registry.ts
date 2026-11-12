// ============================================================
// CHAYRA AI — PROVIDER-INDEPENDENT AGENT REGISTRY
// ============================================================
//
// Agent registry is independent of the AI provider.
//
// All model inference is handled through:
// Central Brain → Amazon Bedrock
//
// Session and intelligence persistence:
// Amazon DynamoDB
//
// No Vertex AI, Gemini or Groq inference fallback.
// ============================================================

// ============================================================
// AGENT METADATA
// ============================================================

export interface AgentMetadata {
  name: string;
  version: string;
  role: string;

  status:
    | 'ACTIVE'
    | 'STANDBY'
    | 'DEPRECATED';

  clearanceLevel:
    | 'TIER_1'
    | 'TIER_2'
    | 'TIER_3';
}

// ============================================================
// ENTERPRISE AGENT REGISTRY
// ============================================================

interface RegisteredAgent {
  handler: Function;
  metadata: AgentMetadata;
}

export class EnterpriseAgentRegistry {

  private static agents = new Map<
    string,
    RegisteredAgent
  >();

  // ==========================================================
  // 1. AGENT REGISTRATION
  // ==========================================================

  static registerAgent(
    metadata: AgentMetadata,
    handler: Function
  ): void {

    if (!metadata.name || typeof handler !== 'function') {
      throw new Error(
        '[Agent Registry] Invalid agent registration.'
      );
    }

    this.agents.set(
      metadata.name,
      {
        handler,
        metadata,
      }
    );

    console.log(
      `[Enterprise Registry]: Agent registered -> ` +
      `${metadata.name} (v${metadata.version}) | ` +
      `Clearance: ${metadata.clearanceLevel}`
    );
  }

  // ==========================================================
  // 2. AGENT DISCOVERY
  // ==========================================================

  static getAgent(name: string): Function {

    const agent = this.agents.get(name);

    if (!agent) {
      throw new Error(
        `[Agent Gateway]: Agent '${name}' not found.`
      );
    }

    const traceId =
      `TRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    console.log(
      `[Agent Gateway]: Trace [${traceId}] -> ` +
      `${name} | Status: ${agent.metadata.status}`
    );

    return agent.handler;
  }

  // ==========================================================
  // 3. FLEET STATUS
  // ==========================================================

  static listActiveFleet(): AgentMetadata[] {

    return Array.from(
      this.agents.values()
    ).map(
      (agent) => agent.metadata
    );
  }

  // ==========================================================
  // 4. REGISTRY SIZE
  // ==========================================================

  static getFleetSize(): number {
    return this.agents.size;
  }

  // ==========================================================
  // 5. REGISTRY HEALTH
  // ==========================================================

  static getRegistryHealth() {

    const agents = this.listActiveFleet();

    return {
      status: agents.length > 0
        ? 'OPERATIONAL'
        : 'EMPTY',

      totalAgents: agents.length,

      activeAgents: agents.filter(
        (agent) => agent.status === 'ACTIVE'
      ).length,

      timestamp: new Date().toISOString(),
    };
  }
}
