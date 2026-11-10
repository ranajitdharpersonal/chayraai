
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import {
  getChayRaTableName,
  getDynamoDocumentClient,
} from '../aws/dynamo';

import { generateText } from '../brain/brain';

// ============================================================
// DYNAMODB KEY CONFIGURATION
// ============================================================

const SESSION_SORT_KEY = 'STATE';
const PUBLIC_HEALTH_PK = 'PUBLIC_HEALTH';
const PUBLIC_HEALTH_SK = 'GLOBAL_HEALTH_WATCH';

function getSessionKey(sessionId: string) {
  if (!sessionId?.trim()) {
    throw new Error('[Memory Bank]: A valid session ID is required.');
  }

  return {
    pk: `SESSION#${sessionId}`,
    sk: SESSION_SORT_KEY,
  };
}

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

  metadata?: {
    analysisTimestamp?: string;
    source?: string;
    sourceStatus?:
    | 'AVAILABLE'
    | 'NO_CURRENT_RECORDS'
    | 'PARTIAL'
    | 'UNAVAILABLE';

    snapshotStatus?: 'LIVE' | 'LAST_KNOWN_GOOD' | 'NO_DATA';
    snapshotAgeDays?: number | null;
    verificationPolicy?: string;
    forecastWindow?: string;
    lookbackDays?: number;
  };
}


// ============================================================
// PREDICTIVE MEMORY BANK
// ============================================================

export class PredictiveMemoryBank {
  // ==========================================================
  // 1. SAVE ENTERPRISE SESSION STATE
  // ==========================================================

  static async saveSituationState(
    sessionId: string,
    data: any,
  ): Promise<void> {
    console.log(
      `[Memory Bank]: Saving enterprise state to DynamoDB for session ${sessionId}...`,
    );

    try {
      const client = getDynamoDocumentClient();
      const tableName = getChayRaTableName();
      const key = getSessionKey(sessionId);

      const event = {
        eventTime: new Date().toISOString(),
        eventType: 'SWARM_CYCLE_COMPLETE',
        agentsDeployed: [
          'MindGuard',
          'Scavenger',
          'Radar',
          'Medical',
          'Navigator',
          'Vault',
          'Verifier',
        ],
      };

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,

          UpdateExpression: `
            SET situationContext = :situationContext,
                threatLevel = :threatLevel,
                activeIntel = :activeIntel,
                systemVersion = :systemVersion,
                lastUpdated = :lastUpdated,
                eventLog = list_append(
                  if_not_exists(eventLog, :emptyList),
                  :newEvent
                )
          `,

          ExpressionAttributeValues: {
            ':situationContext': data?.lastInput || 'UNKNOWN',
            ':threatLevel': data?.threatLevel || 'LOW',
            ':activeIntel': data?.intel || 'NONE',
            ':systemVersion': '3.0.0',
            ':lastUpdated': new Date().toISOString(),
            ':emptyList': [],
            ':newEvent': [event],
          },
        }),
      );

      console.log(
        '[Memory Bank]: Enterprise session state saved to DynamoDB.',
      );
    } catch (error) {
      console.error(
        '[Memory Bank]: Critical DynamoDB sync failure.',
        error,
      );

      throw new Error(
        'Enterprise database connection failed. Please verify AWS DynamoDB configuration.',
      );
    }
  }

  // ==========================================================
  // 2. RETRIEVE HISTORICAL CRISIS STATE
  // ==========================================================

  static async getSituationHistory(
    sessionId: string,
  ): Promise<Record<string, any> | null> {
    console.log(
      `[Memory Bank]: Retrieving historical threat data for ${sessionId}...`,
    );

    try {
      const client = getDynamoDocumentClient();

      const result = await client.send(
        new GetCommand({
          TableName: getChayRaTableName(),
          Key: getSessionKey(sessionId),
        }),
      );

      return (
        (result.Item as Record<string, any> | undefined) ?? null
      );
    } catch (error) {
      console.error(
        '[Memory Bank]: Historical retrieval failed.',
        error,
      );

      return null;
    }
  }

  // ==========================================================
  // 3. SAVE PUBLIC HEALTH STATE
  // ==========================================================

  static async savePublicHealthState(
    data: PublicHealthMemoryState,
  ): Promise<void> {
    console.log(
      '[Memory Bank]: Persisting public-health intelligence to DynamoDB...',
    );

    try {
      const client = getDynamoDocumentClient();


      const metadata = data.metadata ?? {};

      const analysisTimestamp =
        metadata.analysisTimestamp ||
        data.analysisTimestamp ||
        new Date().toISOString();

      const source =
        metadata.source ||
        data.source ||
        'WHO Disease Outbreak News + UN ReliefWeb';

      const sourceStatus =
        metadata.sourceStatus ||
        data.sourceStatus ||
        'UNAVAILABLE';

      const verificationPolicy =
        metadata.verificationPolicy ||
        data.verificationPolicy ||
        'Official source records are separated from model inference.';

      const forecastWindow =
        metadata.forecastWindow ||
        data.forecastWindow ||
        '15 days';

      const lastUpdated = new Date().toISOString();

      const item = {
        pk: PUBLIC_HEALTH_PK,
        sk: PUBLIC_HEALTH_SK,

        // Flattened fields preserve compatibility with existing callers.
        analysisTimestamp,
        source,
        sourceStatus,

        healthAdvisory:
          data.healthAdvisory || 'No advisory available.',

        officialAlerts:
          data.officialAlerts || [],

        outbreakReports:
          data.outbreakReports || [],

        verificationPolicy,
        forecastWindow,

        systemVersion: '3.0.0',
        lastUpdated,

        // Preserve the complete UI metadata object.
        metadata: {
          ...metadata,
          analysisTimestamp,
          source,
          sourceStatus,
          verificationPolicy,
          forecastWindow,
        },
      };


      await client.send(
        new PutCommand({
          TableName: getChayRaTableName(),
          Item: item,
        }),
      );

      console.log(
        '[Memory Bank]: Public-health intelligence persisted to DynamoDB.',
      );
    } catch (error) {
      console.error(
        '[Memory Bank]: Public-health persistence failed.',
        error,
      );
    }
  }

  // ==========================================================
  // 4. RETRIEVE PUBLIC HEALTH STATE
  // ==========================================================

  static async getPublicHealthState(): Promise<
    PublicHealthMemoryState | null
  > {
    console.log(
      '[Memory Bank]: Retrieving public-health memory from DynamoDB...',
    );

    try {
      const client = getDynamoDocumentClient();

      const result = await client.send(
        new GetCommand({
          TableName: getChayRaTableName(),
          Key: {
            pk: PUBLIC_HEALTH_PK,
            sk: PUBLIC_HEALTH_SK,
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as PublicHealthMemoryState;
    } catch (error) {
      console.error(
        '[Memory Bank]: Public-health retrieval failed.',
        error,
      );

      return null;
    }
  }

  // ==========================================================
  // 5. PREDICTIVE MEMORY / RESILIENCE ENGINE
  // ==========================================================

  static async predictThreatEvolution(
    sessionId: string,
  ): Promise<string> {
    console.log(
      '[Memory Bank]: Analyzing historical state for prediction...',
    );

    const history = await this.getSituationHistory(sessionId);

    if (!history) {
      return 'Insufficient historical data to generate resilience insights.';
    }

    try {

      const prompt = `
You are the Predictive Memory Engine for an Enterprise Crisis Fleet.

Analyze the following saved situation history and predict the next likely threat evolution within 24 hours.

Keep the output to 2 concise sentences, focusing on preparedness.

Do not present speculation as verified fact.

Situation History:
${JSON.stringify(history)}
`;

      return await generateText(prompt);
    } catch (error) {
      console.error(
        '[Memory Bank]: Prediction generation failed.',
        error,
      );

      return (
        'Prediction engine currently offline. Please rely on the latest available radar data.'
      );
    }
  }
}
