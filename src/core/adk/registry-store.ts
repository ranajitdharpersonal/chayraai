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

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:
        process.env.GOOGLE_CLOUD_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT,

      clientEmail:
        process.env.GOOGLE_CLIENT_EMAIL,

      privateKey:
        process.env.GOOGLE_PRIVATE_KEY?.replace(
          /\\n/g,
          '\n'
        ),
    }),
  });
}

const db = getFirestore();

const REGISTRY_COLLECTION =
  'chayra_enterprise_agent_registry';

export class AgentRegistryStore {
  /**
   * Persist an agent's enterprise identity and lifecycle metadata.
   *
   * The actual executable handler never goes into Firestore.
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
      // Registry persistence should not prevent a local
      // emergency request from executing.
      console.error(
        `[Agent Registry]: Failed to persist ${metadata.name}.`,
        error
      );
    }
  }

  /**
   * Update the last heartbeat of a registered agent.
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
   * Discover the durable enterprise fleet catalog.
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
   * Read one persisted agent record.
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
}