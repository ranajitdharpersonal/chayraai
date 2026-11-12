
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let documentClient: DynamoDBDocumentClient | null = null;

/**
 * Lazily initialise the DynamoDB client.
 *
 * Uses the AWS SDK default credential provider chain:
 * - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * - AWS_SESSION_TOKEN (when using temporary credentials)
 * - IAM role credentials when available
 *
 * No AWS credentials are required during `next build`.
 */
export function getDynamoDocumentClient(): DynamoDBDocumentClient {
  if (documentClient) {
    return documentClient;
  }

  const region =
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'us-east-1';

  const client = new DynamoDBClient({
    region,
    maxAttempts: 3,
  });

  documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return documentClient;
}

/**
 * Shared single-table configuration.
 *
 * The DynamoDB table must use:
 * Partition key: pk (String)
 * Sort key:      sk (String)
 */
export function getChayRaTableName(): string {
  const tableName = process.env.CHAYRA_DATA_TABLE?.trim();

  if (!tableName) {
    throw new Error(
      '[DynamoDB]: Missing CHAYRA_DATA_TABLE environment variable.',
    );
  }

  return tableName;
}
