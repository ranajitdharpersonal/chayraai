
import {
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import {
  getChayRaTableName,
  getDynamoDocumentClient,
} from './dynamo';

// ============================================================
// CHAYRA AI 3.0 — RADAR SNAPSHOT STORAGE
// ============================================================

const RADAR_PARTITION_KEY = 'RADAR';
const RADAR_SORT_KEY = 'GLOBAL_THREATS';

export interface RadarThreat {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: string;
}

export interface RadarSnapshot {
  threats: RadarThreat[];
  scannedAt: string;
  systemVersion: string;
}

// ============================================================
// SAVE DAILY RADAR SNAPSHOT
// ============================================================

export async function saveRadarSnapshot(
  threats: RadarThreat[],
): Promise<void> {
  if (!Array.isArray(threats)) {
    throw new Error(
      '[Radar Snapshot]: Invalid threat collection.',
    );
  }

  const client = getDynamoDocumentClient();

  const snapshot: RadarSnapshot = {
    threats,
    scannedAt: new Date().toISOString(),
    systemVersion: '3.0.0',
  };

  await client.send(
    new PutCommand({
      TableName: getChayRaTableName(),

      Item: {
        pk: RADAR_PARTITION_KEY,
        sk: RADAR_SORT_KEY,
        ...snapshot,
      },
    }),
  );

  console.log(
    `[Radar Snapshot]: Saved ${threats.length} threats to DynamoDB.`,
  );
}

// ============================================================
// READ LATEST RADAR SNAPSHOT
// ============================================================

export async function getRadarSnapshot(): Promise<RadarSnapshot | null> {
  const client = getDynamoDocumentClient();

  const result = await client.send(
    new GetCommand({
      TableName: getChayRaTableName(),

      Key: {
        pk: RADAR_PARTITION_KEY,
        sk: RADAR_SORT_KEY,
      },
    }),
  );

  if (!result.Item) {
    console.warn(
      '[Radar Snapshot]: No snapshot available yet.',
    );

    return null;
  }

  const item = result.Item;

  if (
    !Array.isArray(item.threats) ||
    typeof item.scannedAt !== 'string'
  ) {
    console.error(
      '[Radar Snapshot]: Stored snapshot has an invalid structure.',
    );

    return null;
  }

  return {
    threats: item.threats as RadarThreat[],
    scannedAt: item.scannedAt,
    systemVersion: item.systemVersion || '3.0.0',
  };
}
