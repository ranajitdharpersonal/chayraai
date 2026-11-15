
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

// ============================================================
// CHAYRA AI 3.0 — CENTRAL BRAIN GATEWAY
// Active provider: Amazon Bedrock ONLY
// ============================================================

const CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',

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
  maxSystemChars: 16_000,
};

let bedrockClient: BedrockRuntimeClient | null = null;

// ============================================================
// BEDROCK CLIENT
// ============================================================

function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) return bedrockClient;

  const accessKey = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (Boolean(accessKey) !== Boolean(secretKey)) {
    throw new Error(
      'Bedrock credentials configuration is incomplete.',
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
//
// New usage:
// generateText(untrustedUserContent, trustedSystemInstruction)
//
// Legacy usage remains supported:
// generateText(existingPrompt)
// ============================================================

export async function generateText(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Inference input cannot be empty.');
  }

  if (
    systemInstruction !== undefined &&
    (
      typeof systemInstruction !== 'string' ||
      !systemInstruction.trim() ||
      systemInstruction.length > CONFIG.maxSystemChars
    )
  ) {
    throw new Error('Invalid system instruction.');
  }

  try {
    const command = new ConverseCommand({
      modelId: CONFIG.modelId,

      ...(systemInstruction
        ? {
            system: [
              {
                text: systemInstruction,
              },
            ],
          }
        : {}),

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
        abortSignal: AbortSignal.timeout(CONFIG.timeoutMs),
      },
    );

    const content = response.output?.message?.content ?? [];

    const text = content
      .map((block) => block.text || '')
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Bedrock returned an empty response.');
    }

    return text;
  } catch (error) {
    // Do not expose provider error messages or request details.
    console.error('[Central Brain]: Bedrock inference failed.', {
      errorType:
        error instanceof Error ? error.name : 'UnknownError',
    });

    throw new Error('Amazon Bedrock inference failed.');
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
