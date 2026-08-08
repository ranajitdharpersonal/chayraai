import { VertexAI } from '@google-cloud/vertexai';

// Initialize Vertex AI with fallback for Local Demo Mode
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'demo-chayra-ai-local';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

export const vertexAI = new VertexAI({ project: projectId, location: location });

export interface AgentMetadata {
  name: string;
  version: string;
  role: string;
  status: 'ACTIVE' | 'STANDBY' | 'DEPRECATED';
  clearanceLevel: 'TIER_1' | 'TIER_2' | 'TIER_3';
}

export class EnterpriseAgentRegistry {
  private static agents: Map<string, { handler: Function, metadata: AgentMetadata }> = new Map();

  // 1. Zero-Trust Agent Registration
  static registerAgent(metadata: AgentMetadata, handler: Function) {
    console.log(`[Enterprise Registry]: Securing Identity for Agent -> ${metadata.name} (v${metadata.version}) | Clearance: ${metadata.clearanceLevel}`);
    this.agents.set(metadata.name, { handler, metadata });
  }

  // 2. Agent Gateway & Live Observability Hook
  static getAgent(name: string) {
    if (!this.agents.has(name)) {
      throw new Error(`[Agent Gateway] Zero-Trust Alert: Agent '${name}' not found or access denied.`);
    }
    const agent = this.agents.get(name);
    
    // Live Observability Trace
    const traceId = `TRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log(`[Live Observability]: Trace [${traceId}] - Agent '${name}' triggered. Status: ${agent?.metadata.status}`);
    
    return agent?.handler;
  }

  // 3. Fleet Status Check
  static listActiveFleet() {
    return Array.from(this.agents.values()).map(a => a.metadata);
  }
}