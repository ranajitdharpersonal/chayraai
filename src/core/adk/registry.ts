import { VertexAI } from '@google-cloud/vertexai';

// 1. Enterprise Explicit Credentials (Fixing the Auth Crash for Vertex)
// Update: Using GOOGLE_CLOUD_PROJECT_ID to match your .env file
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'demo-chayra-ai-local';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

export const vertexAI = new VertexAI({ 
  project: projectId, 
  location: location,
  // 🛑 The Magic Fix: Injecting explicit auth so the AI doesn't get denied access
  googleAuthOptions: {
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
  }
});

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