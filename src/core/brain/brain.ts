
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

// ============================================================
// CHAYRA AI 3.0 — CENTRAL BRAIN GATEWAY
// Active provider: Amazon Bedrock ONLY
// ============================================================

const CONFIG = {
  region:
    process.env.AWS_REGION || 'us-east-1',

  modelId:
    process.env.AWS_BEDROCK_MODEL_ID?.trim() ||
    'apac.amazon.nova-lite-v1:0',

  maxTokens: Math.min(
    4096,
    Math.max(
      128,
      Number(process.env.BRAIN_MAX_OUTPUT_TOKENS) || 1536,
    ),
  ),

  temperature: 0.2,
  timeoutMs: 30_000,
};

let bedrockClient: BedrockRuntimeClient | null = null;

// ============================================================
// BEDROCK CLIENT
// ============================================================

function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) {
    return bedrockClient;
  }

  const accessKey = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (Boolean(accessKey) !== Boolean(secretKey)) {
    throw new Error(
      '[Central Brain]: Both AWS access key and secret key must be configured together.',
    );
  }

  bedrockClient = new BedrockRuntimeClient({
    region: CONFIG.region,

    ...(accessKey && secretKey
      ? {
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            ...(process.env.AWS_SESSION_TOKEN
              ? {
                  sessionToken: process.env.AWS_SESSION_TOKEN,
                }
              : {}),
          },
        }
      : {}),

    maxAttempts: 1,
  });

  return bedrockClient;
}

// ============================================================
// SINGLE INFERENCE ENTRY POINT
// All agents must use this function.
// ============================================================

export async function generateText(
  prompt: string,
): Promise<string> {
  if (
    typeof prompt !== 'string' ||
    !prompt.trim()
  ) {
    throw new Error(
      '[Central Brain]: Prompt cannot be empty.',
    );
  }

  console.log(
    `[Central Brain]: Sending inference to Amazon Bedrock (${CONFIG.modelId})...`,
  );

  try {
    const command = new ConverseCommand({
      modelId: CONFIG.modelId,

      messages: [
        {
          role: 'user',
          content: [
            {
              text: prompt,
            },
          ],
        },
      ],

      inferenceConfig: {
        maxTokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
      },
    });

    const response = await getBedrockClient().send(
      command,
      {
        abortSignal: AbortSignal.timeout(
          CONFIG.timeoutMs,
        ),
      },
    );

    const content =
      response.output?.message?.content ?? [];

    const text = content
      .map((block) => block.text || '')
      .join('\n')
      .trim();

    if (!text) {
      throw new Error(
        `Bedrock returned no text. Stop reason: ${response.stopReason || 'UNKNOWN'}`,
      );
    }

    console.log(
      `[Central Brain]: Bedrock inference completed. Model=${CONFIG.modelId}`,
    );

    return text;
  } catch (error) {
    console.error(
      '[Central Brain]: Bedrock inference failed.',
      error,
    );

    throw new Error(
      error instanceof Error
        ? `Amazon Bedrock inference failed: ${error.message}`
        : 'Amazon Bedrock inference failed.',
    );
  }
}

// ============================================================
// CONFIGURATION SUMMARY
// ============================================================

export function getBrainConfiguration() {
  const hasExplicitCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY,
  );

  return {
    activeProvider: 'BEDROCK',
    modelId: CONFIG.modelId,
    region: CONFIG.region,

    credentialsMode: hasExplicitCredentials
      ? 'ENVIRONMENT_VARIABLES'
      : 'AWS_SDK_DEFAULT_CREDENTIAL_CHAIN',

    secondaryProvidersEnabled: false,
    tertiaryProvidersEnabled: false,
  };
}
