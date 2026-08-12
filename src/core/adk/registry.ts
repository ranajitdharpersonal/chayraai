import { GoogleGenAI } from '@google/genai';

// ============================================================
// CHAYRA AI 3.0 — CENTRAL GOOGLE GEN AI CONFIGURATION
// ============================================================
//
// One client for the entire agent fleet.
//
// Auth priority:
// 1. Explicit service-account credentials from environment variables.
// 2. Otherwise, Application Default Credentials (ADC).
//
// IMPORTANT:
// We do NOT require GOOGLE_APPLICATION_CREDENTIALS or a local
// gcp-credentials.json file.
//

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

const location =
  process.env.GOOGLE_CLOUD_LOCATION ||
  'asia-south1';

const clientEmail =
  process.env.GOOGLE_CLIENT_EMAIL?.trim();

const privateKey =
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId) {
  throw new Error(
    '[Google AI] Missing Google Cloud project configuration. ' +
      'Set GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_PROJECT.'
  );
}

// Use explicit service-account credentials only when both values
// are actually available. Otherwise let Google Auth use ADC.
const googleAuthOptions =
  clientEmail && privateKey
    ? {
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      }
    : undefined;

// Avoid a stale GOOGLE_APPLICATION_CREDENTIALS path overriding
// explicit credentials when both are configured locally.
if (
  googleAuthOptions &&
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// ============================================================
// GOOGLE GEN AI CLIENT
// ============================================================

const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location,
  httpOptions: {
    apiVersion: 'v1',
  },
  ...(googleAuthOptions
    ? { googleAuthOptions }
    : {}),
});

// ============================================================
// LEGACY-COMPATIBILITY ADAPTER
// ============================================================
//
// Existing ChayRa agents already expect:
//
// vertexAI.getGenerativeModel({ model }).generateContent(prompt)
//
// Keep that contract so we do not need to rewrite every agent.
//

export const vertexAI = {
  getGenerativeModel({
    model,
  }: {
    model: string;
  }) {
    return {
      async generateContent(prompt: string) {
        const response =
          await ai.models.generateContent({
            model,
            contents: prompt,
          });

        // Preserve the response shape expected by
        // the existing ChayRa agents.
        return {
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: response.text ?? '',
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    };
  },
};

// ============================================================
// ENTERPRISE AGENT REGISTRY
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

export class EnterpriseAgentRegistry {
  private static agents: Map<
    string,
    {
      handler: Function;
      metadata: AgentMetadata;
    }
  > = new Map();

  // ==========================================================
  // 1. ZERO-TRUST AGENT REGISTRATION
  // ==========================================================

  static registerAgent(
    metadata: AgentMetadata,
    handler: Function
  ) {
    console.log(
      `[Enterprise Registry]: Securing Identity for Agent -> ` +
        `${metadata.name} (v${metadata.version}) | ` +
        `Clearance: ${metadata.clearanceLevel}`
    );

    this.agents.set(metadata.name, {
      handler,
      metadata,
    });
  }

  // ==========================================================
  // 2. AGENT GATEWAY + OBSERVABILITY
  // ==========================================================

  static getAgent(name: string) {
    const agent = this.agents.get(name);

    if (!agent) {
      throw new Error(
        `[Agent Gateway] Zero-Trust Alert: Agent '${name}' ` +
          `not found or access denied.`
      );
    }

    const traceId =
      `TRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    console.log(
      `[Live Observability]: Trace [${traceId}] - ` +
        `Agent '${name}' triggered. ` +
        `Status: ${agent.metadata.status}`
    );

    return agent.handler;
  }

  // ==========================================================
  // 3. FLEET STATUS
  // ==========================================================

  static listActiveFleet(): AgentMetadata[] {
    return Array.from(
      this.agents.values()
    ).map((agent) => agent.metadata);
  }
}