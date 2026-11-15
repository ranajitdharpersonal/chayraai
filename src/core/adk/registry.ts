
export interface AgentMetadata {
  name: string;
  version: string;
  role: string;
  status: 'ACTIVE' | 'STANDBY' | 'DEPRECATED';
  clearanceLevel: 'TIER_1' | 'TIER_2' | 'TIER_3';
}

interface RegisteredAgent {
  handler: Function;
  metadata: AgentMetadata;
}

export class EnterpriseAgentRegistry {
  private static agents = new Map<string, RegisteredAgent>();

  static registerAgent(
    metadata: AgentMetadata,
    handler: Function,
  ): void {
    if (
      !metadata.name ||
      typeof metadata.name !== 'string' ||
      typeof handler !== 'function'
    ) {
      throw new Error(
        '[Agent Registry] Invalid agent registration.',
      );
    }

    if (this.agents.has(metadata.name)) {
      throw new Error(
        `[Agent Registry] Agent '${metadata.name}' is already registered.`,
      );
    }

    this.agents.set(metadata.name, {
      handler,
      metadata,
    });

    console.log(
      `[Enterprise Registry]: Agent registered -> ` +
      `${metadata.name} (v${metadata.version}) | ` +
      `Clearance: ${metadata.clearanceLevel}`,
    );
  }

  static getAgent(name: string): Function {
    const agent = this.agents.get(name);

    if (!agent) {
      throw new Error(
        `[Agent Gateway]: Agent '${name}' not found.`,
      );
    }

    if (agent.metadata.status !== 'ACTIVE') {
      throw new Error(
        `[Agent Gateway]: Agent '${name}' is not active.`,
      );
    }

    const traceId =
      `TRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    console.log(
      `[Agent Gateway]: Trace [${traceId}] -> ` +
      `${name} | Status: ${agent.metadata.status}`,
    );

    return agent.handler;
  }

  static listActiveFleet(): AgentMetadata[] {
    return Array.from(this.agents.values())
      .filter((agent) => agent.metadata.status === 'ACTIVE')
      .map((agent) => agent.metadata);
  }

  static getFleetSize(): number {
    return this.agents.size;
  }

  static getRegistryHealth() {
    const agents = Array.from(this.agents.values());

    const activeAgents = agents.filter(
      (agent) => agent.metadata.status === 'ACTIVE',
    ).length;

    return {
      status: activeAgents > 0 ? 'OPERATIONAL' : 'EMPTY',
      totalAgents: agents.length,
      activeAgents,
      timestamp: new Date().toISOString(),
    };
  }
}
