import {
  getApps,
  initializeApp,
  cert,
} from 'firebase-admin/app';

import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';

import type { AgentMetadata } from './registry';

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

const clientEmail =
  process.env.GOOGLE_CLIENT_EMAIL;

const privateKey =
  process.env.GOOGLE_PRIVATE_KEY?.replace(
    /\\n/g,
    '\n'
  );

if (!projectId) {
  throw new Error(
    '[Agent Registry]: Missing GOOGLE_CLOUD_PROJECT_ID.'
  );
}

if (!clientEmail) {
  throw new Error(
    '[Agent Registry]: Missing GOOGLE_CLIENT_EMAIL.'
  );
}

if (!privateKey) {
  throw new Error(
    '[Agent Registry]: Missing GOOGLE_PRIVATE_KEY.'
  );
}

// ============================================================
// FIREBASE / FIRESTORE INITIALIZATION
// ============================================================

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = getFirestore();

const REGISTRY_COLLECTION =
  'chayra_enterprise_agent_registry';

// ============================================================
// ENTERPRISE AGENT HEALTH TYPES
// ============================================================

export type AgentHealthStatus =
  | 'HEALTHY'
  | 'STALE'
  | 'OFFLINE';

export interface AgentFleetHealth {
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

  health: AgentHealthStatus;

  lastHeartbeat: string | null;
}

// ============================================================
// ENTERPRISE AGENT REGISTRY STORE
// ============================================================

export class AgentRegistryStore {
  /**
   * Persist an agent's enterprise identity and lifecycle metadata.
   *
   * IMPORTANT:
   * The executable handler is NEVER stored in Firestore.
   * Only durable metadata is persisted.
   */
  static async registerAgent(
    metadata: AgentMetadata
  ): Promise<void> {
    const docRef = db
      .collection(REGISTRY_COLLECTION)
      .doc(metadata.name);

    try {
      await docRef.set(
        {
          name: metadata.name,
          version: metadata.version,
          role: metadata.role,
          status: metadata.status,
          clearanceLevel:
            metadata.clearanceLevel,

          lastRegistered:
            FieldValue.serverTimestamp(),

          lastHeartbeat:
            FieldValue.serverTimestamp(),

          registryVersion: '3.0.0',
        },
        {
          merge: true,
        }
      );

      console.log(
        `[Agent Registry]: Persisted ${metadata.name} ` +
          `(v${metadata.version}) to Firestore.`
      );
    } catch (error) {
      // Registry persistence must never prevent the
      // emergency runtime from executing.
      console.error(
        `[Agent Registry]: Failed to persist ${metadata.name}.`,
        error
      );
    }
  }

  /**
   * Update the last heartbeat timestamp for an agent.
   */
  static async heartbeat(
    agentName: string
  ): Promise<void> {
    try {
      await db
        .collection(REGISTRY_COLLECTION)
        .doc(agentName)
        .set(
          {
            lastHeartbeat:
              FieldValue.serverTimestamp(),
          },
          {
            merge: true,
          }
        );
    } catch (error) {
      console.error(
        `[Agent Registry]: Heartbeat failed for ${agentName}.`,
        error
      );
    }
  }

  /**
   * Discover the complete durable enterprise agent catalog.
   */
  static async listPersistedAgents(): Promise<
    AgentMetadata[]
  > {
    try {
      const snapshot = await db
        .collection(REGISTRY_COLLECTION)
        .get();

      return snapshot.docs.map(
        (doc) =>
          doc.data() as AgentMetadata
      );
    } catch (error) {
      console.error(
        '[Agent Registry]: Persistent discovery failed.',
        error
      );

      return [];
    }
  }

  /**
   * Read one persisted agent record by name.
   */
  static async getPersistedAgent(
    agentName: string
  ): Promise<AgentMetadata | null> {
    try {
      const doc = await db
        .collection(REGISTRY_COLLECTION)
        .doc(agentName)
        .get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() as AgentMetadata;
    } catch (error) {
      console.error(
        `[Agent Registry]: Failed to read ${agentName}.`,
        error
      );

      return null;
    }
  }

  /**
   * Evaluate the health of every registered enterprise agent.
   *
   * Heartbeat policy:
   *
   * < 10 minutes   → HEALTHY
   * 10–30 minutes  → STALE
   * > 30 minutes   → OFFLINE
   */
  static async getFleetHealth(): Promise<
    AgentFleetHealth[]
  > {
    try {
      const snapshot = await db
        .collection(REGISTRY_COLLECTION)
        .get();

      const now = Date.now();

      return snapshot.docs.map((doc) => {
        const data = doc.data();

        const heartbeatTimestamp =
          data.lastHeartbeat;

        let lastHeartbeat:
          | string
          | null = null;

        if (
          heartbeatTimestamp &&
          typeof heartbeatTimestamp.toDate ===
            'function'
        ) {
          lastHeartbeat =
            heartbeatTimestamp
              .toDate()
              .toISOString();
        }

        let health:
          | AgentHealthStatus = 'OFFLINE';

        if (lastHeartbeat) {
          const elapsedMs =
            now -
            new Date(lastHeartbeat).getTime();

          const elapsedMinutes =
            elapsedMs / (1000 * 60);

          if (elapsedMinutes < 10) {
            health = 'HEALTHY';
          } else if (elapsedMinutes <= 30) {
            health = 'STALE';
          } else {
            health = 'OFFLINE';
          }
        }

        return {
          name:
            data.name ??
            doc.id,

          version:
            data.version ??
            'UNKNOWN',

          role:
            data.role ??
            'UNKNOWN',

          status:
            data.status ??
            'STANDBY',

          clearanceLevel:
            data.clearanceLevel ??
            'TIER_3',

          health,

          lastHeartbeat,
        };
      });
    } catch (error) {
      console.error(
        '[Agent Registry]: Fleet health evaluation failed.',
        error
      );

      return [];
    }
  }
}