import {
  getApps,
  initializeApp,
  cert,
} from 'firebase-admin/app';

import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';

import { vertexAI } from './registry';

// ============================================================
// FIREBASE / FIRESTORE INITIALIZATION
// ============================================================

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
    '[Memory Bank]: Missing GOOGLE_CLOUD_PROJECT_ID.'
  );
}

if (!clientEmail) {
  throw new Error(
    '[Memory Bank]: Missing GOOGLE_CLIENT_EMAIL.'
  );
}

if (!privateKey) {
  throw new Error(
    '[Memory Bank]: Missing GOOGLE_PRIVATE_KEY.'
  );
}

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

// ============================================================
// GEMINI 3.5 FLASH — PREDICTIVE MEMORY ENGINE
// ============================================================

const generativeModel =
  vertexAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
  });

// ============================================================
// PUBLIC HEALTH MEMORY TYPES
// ============================================================

export interface PublicHealthMemoryState {
  analysisTimestamp?: string;

  source?: string;

  sourceStatus?:
    | 'AVAILABLE'
    | 'NO_CURRENT_RECORDS'
    | 'PARTIAL'
    | 'UNAVAILABLE';

  healthAdvisory?: string;

  officialAlerts?: unknown[];

  outbreakReports?: unknown[];

  verificationPolicy?: string;

  forecastWindow?: string;

  lastUpdated?: unknown;

  systemVersion?: string;
}

// ============================================================
// PREDICTIVE MEMORY BANK
// ============================================================

export class PredictiveMemoryBank {

  // ==========================================================
  // 1. ENTERPRISE SESSION STATE
  // ==========================================================

  static async saveSituationState(
    sessionId: string,
    data: any
  ): Promise<void> {
    console.log(
      `[Memory Bank]: Committing enterprise state to Firestore for session ${sessionId}...`
    );

    try {
      const docRef = db
        .collection('chayra_enterprise_memory')
        .doc(sessionId);

      await docRef.set(
        {
          situationContext:
            data.lastInput || 'UNKNOWN',

          threatLevel:
            data.threatLevel || 'LOW',

          activeIntel:
            data.intel || 'NONE',

          systemVersion:
            '3.0.0',

          lastUpdated:
            FieldValue.serverTimestamp(),

          eventLog:
            FieldValue.arrayUnion({
              eventTime:
                new Date().toISOString(),

              eventType:
                'SWARM_CYCLE_COMPLETE',

              agentsDeployed: [
                'MindGuard',
                'Scavenger',
                'Radar',
                'Medical',
                'Navigator',
                'Vault',
                'Verifier',
              ],
            }),
        },
        {
          merge: true,
        }
      );

    } catch (error) {
      console.error(
        '[Memory Bank]: Critical DB Sync Failure.',
        error
      );

      throw new Error(
        'Enterprise Database Connection Failed. Please verify GCP Service Account.'
      );
    }
  }

  // ==========================================================
  // 2. HISTORICAL CRISIS RETRIEVAL
  // ==========================================================

  static async getSituationHistory(
    sessionId: string
  ) {
    console.log(
      `[Memory Bank]: Retrieving historical threat data for ${sessionId}...`
    );

    try {
      const docRef = db
        .collection('chayra_enterprise_memory')
        .doc(sessionId);

      const doc =
        await docRef.get();

      return doc.exists
        ? doc.data()
        : null;

    } catch (error) {
      console.error(
        '[Memory Bank]: Retrieval Failed.',
        error
      );

      return null;
    }
  }

  // ==========================================================
  // 3. PUBLIC HEALTH STATE — PERSIST
  // ==========================================================

  static async savePublicHealthState(
    data: PublicHealthMemoryState
  ): Promise<void> {
    console.log(
      '[Memory Bank]: Persisting public-health intelligence...'
    );

    try {
      const docRef = db
        .collection(
          'chayra_public_health_memory'
        )
        .doc(
          'global_health_watch'
        );

      await docRef.set(
        {
          analysisTimestamp:
            data.analysisTimestamp ||
            new Date().toISOString(),

          source:
            data.source ||
            'UN ReliefWeb',

          sourceStatus:
            data.sourceStatus ||
            'UNAVAILABLE',

          healthAdvisory:
            data.healthAdvisory ||
            'No advisory available.',

          officialAlerts:
            data.officialAlerts ||
            [],

          outbreakReports:
            data.outbreakReports ||
            [],

          verificationPolicy:
            data.verificationPolicy ||
            'Official source records are separated from model inference.',

          forecastWindow:
            data.forecastWindow ||
            '15 days',

          systemVersion:
            '3.0.0',

          lastUpdated:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      console.log(
        '[Memory Bank]: Public-health intelligence persisted.'
      );

    } catch (error) {
      // Health-memory persistence should not kill
      // the live crisis-response pipeline.
      console.error(
        '[Memory Bank]: Public-health persistence failed.',
        error
      );
    }
  }

  // ==========================================================
  // 4. PUBLIC HEALTH STATE — RETRIEVE
  // ==========================================================

  static async getPublicHealthState(): Promise<
    PublicHealthMemoryState | null
  > {
    console.log(
      '[Memory Bank]: Retrieving historical public-health state...'
    );

    try {
      const docRef = db
        .collection(
          'chayra_public_health_memory'
        )
        .doc(
          'global_health_watch'
        );

      const doc =
        await docRef.get();

      if (!doc.exists) {
        return null;
      }

      return (
        doc.data() as
          PublicHealthMemoryState
      );

    } catch (error) {
      console.error(
        '[Memory Bank]: Public-health retrieval failed.',
        error
      );

      return null;
    }
  }

  // ==========================================================
  // 5. PREDICTIVE MEMORY / RESILIENCE ENGINE
  // ==========================================================

  static async predictThreatEvolution(
    sessionId: string
  ): Promise<string> {
    console.log(
      '[Memory Bank]: Analyzing historical state for prediction...'
    );

    const history =
      await this.getSituationHistory(
        sessionId
      );

    if (!history) {
      return (
        'Insufficient historical data to generate resilience insights.'
      );
    }

    try {
      const prompt = `
You are the Predictive Memory Engine for an Enterprise Crisis Fleet.

Analyze the following saved situation history and predict the next likely threat evolution within 24 hours.

Keep the output to 2 concise sentences, focusing on preparedness.

Situation History:
${JSON.stringify(history)}
`;

      const resp =
        await generativeModel.generateContent(
          prompt
        );

      return (
        resp.response
          .candidates?.[0]
          ?.content?.parts?.[0]
          ?.text ||
        'Prediction engine is standing by.'
      );

    } catch (error) {
      console.error(
        '[Memory Bank]: Prediction generation failed.',
        error
      );

      return (
        'Prediction engine currently offline. Please rely on live radar.'
      );
    }
  }
}