// 🛑 NEW: The official Gen AI SDK for 3.5+ Models
import { GoogleGenAI } from '@google/genai';

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'demo-chayra-ai-local';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// 1. Initialize the new unified SDK (🛑 THE EXACT FIX IS HERE)
const ai = new GoogleGenAI({ 
  vertexai: true,         // <-- Eta ekhon boolean hobe
  project: projectId,     // <-- Ekdom top level-e
  location: location,     // <-- Ekdom top level-e
  // Explicit credentials jate auth theek moto set hoy
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }
} as any);

// 🛑 MASTERSTROKE WRAPPER: 
export const vertexAI = {
  getGenerativeModel: ({ model }: { model: string }) => {
    return {
      generateContent: async (prompt: string) => {
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
        });
        
        // Pushing back the response in the exact format your existing agents expect
        return {
          response: {
            candidates: [
              {
                content: {
                  parts: [{ text: response.text }]
                }
              }
            ]
          }
        };
      }
    };
  }
};

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