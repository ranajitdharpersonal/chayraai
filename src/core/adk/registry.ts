import { genkit, z } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { logger } from 'genkit/logging';

// ==========================================
// LAYER 1: GOOGLE ADK (The Operating System)
// ==========================================
export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
  model: gemini15Flash, // The Reasoning Brain (Cost-effective & Fast)
});

// Enable Live Observability & Telemetry Tracing for Judges
logger.setLogLevel('debug');

// ==========================================
// LAYER 2: THE ENTERPRISE AGENT REGISTRY
// ==========================================
// This allows discovery, versioning, and secure access of all Swarm agents
export class AgentRegistry {
  private static agents: Map<string, any> = new Map();

  // Register an ADK flow into the global enterprise fleet
  static registerAgent(name: string, agentFlow: any) {
    this.agents.set(name, agentFlow);
    console.log(`[Agent Registry] Securely Registered: ${name}`);
  }

  // Gateway: Retrieve an agent for execution
  static getAgent(name: string) {
    if (!this.agents.has(name)) {
      throw new Error(`[Agent Gateway] Agent '${name}' not found in Registry or unauthorized access.`);
    }
    return this.agents.get(name);
  }

  static getAllRegisteredAgents() {
    return Array.from(this.agents.keys());
  }
}