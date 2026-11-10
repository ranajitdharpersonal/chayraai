
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// ============================================================
// CHAYRA AI — CENTRAL MULTI-BRAIN GATEWAY
// ============================================================
// Provider priority:
// 1. Amazon Bedrock
// 2. Gemini Developer API
// 3. Groq (optional; enable explicitly to control costs)
//
// Existing agents continue using:
// vertexAI.getGenerativeModel({ model }).generateContent(prompt)
//
// The legacy response shape is preserved.
// ============================================================

type BrainProvider = "BEDROCK" | "GEMINI" | "GROQ";

type BrainResult = {
  text: string;
  provider: BrainProvider;
  model: string;
};

class BrainProviderError extends Error {
  provider: BrainProvider;
  status?: number;
  code?: string;

  constructor(
    provider: BrainProvider,
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "BrainProviderError";
    this.provider = provider;
    this.status = status;
    this.code = code;
  }
}

const CONFIG = {
  awsRegion: process.env.AWS_REGION || "ap-south-1",

  bedrockModel:
    process.env.AWS_BEDROCK_MODEL_ID ||
    "apac.amazon.nova-lite-v1:0",

  geminiModel:
    process.env.GEMINI_MODEL_ID ||
    "gemini-3.8-flash",

  groqModel:
    process.env.GROQ_MODEL_ID ||
    "openai/gpt-oss-20b",

  maxTokens: Math.min(
    4096,
    Math.max(
      128,
      Number(process.env.BRAIN_MAX_OUTPUT_TOKENS) || 1536,
    ),
  ),

  timeoutMs: 30000,

  // Groq is not assumed to be free.
  // Enable only after accepting its usage pricing.
  allowGroq:
    process.env.ALLOW_GROQ_FALLBACK === "true",
};

// ============================================================
// BEDROCK CLIENT
// ============================================================

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) return bedrockClient;

  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (Boolean(accessKey) !== Boolean(secretKey)) {
    throw new BrainProviderError(
      "BEDROCK",
      "Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.",
    );
  }

  bedrockClient = new BedrockRuntimeClient({
    region: CONFIG.awsRegion,

    ...(accessKey && secretKey
      ? {
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            ...(process.env.AWS_SESSION_TOKEN
              ? { sessionToken: process.env.AWS_SESSION_TOKEN }
              : {}),
          },
        }
      : {}),

    maxAttempts: 1,
  });

  return bedrockClient;
}

// ============================================================
// 1. AMAZON BEDROCK
// ============================================================

async function callBedrock(prompt: string): Promise<BrainResult> {
  try {
    const command = new ConverseCommand({
      modelId: CONFIG.bedrockModel,

      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],

      inferenceConfig: {
        maxTokens: CONFIG.maxTokens,
        temperature: 0.2,
      },
    });

    const response = await getBedrockClient().send(command, {
      abortSignal: AbortSignal.timeout(CONFIG.timeoutMs),
    });

    if (response.stopReason === "guardrail_intervened") {
      throw new BrainProviderError(
        "BEDROCK",
        "Bedrock guardrail blocked the request.",
      );
    }

    const content = response.output?.message?.content ?? [];

    const text = content
      .map((item) => item.text || "")
      .join("\n")
      .trim();

    if (!text) {
      throw new BrainProviderError(
        "BEDROCK",
        "Bedrock returned an empty response.",
      );
    }

    return {
      text,
      provider: "BEDROCK",
      model: CONFIG.bedrockModel,
    };
  } catch (error: any) {
    if (error instanceof BrainProviderError) throw error;

    throw new BrainProviderError(
      "BEDROCK",
      error?.message || "Bedrock inference failed.",
      error?.$metadata?.httpStatusCode,
      error?.name,
    );
  }
}

// ============================================================
// 2. GEMINI DEVELOPER API
// ============================================================

async function callGemini(prompt: string): Promise<BrainResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new BrainProviderError(
      "GEMINI",
      "GEMINI_API_KEY is not configured.",
    );
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        CONFIG.geminiModel,
      )}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        signal: AbortSignal.timeout(CONFIG.timeoutMs),

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],

          generationConfig: {
            maxOutputTokens: CONFIG.maxTokens,
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new BrainProviderError(
        "GEMINI",
        data?.error?.message || `Gemini HTTP ${response.status}`,
        response.status,
      );
    }

    if (
      data?.promptFeedback?.blockReason ||
      data?.candidates?.[0]?.finishReason === "SAFETY"
    ) {
      throw new BrainProviderError(
        "GEMINI",
        "Gemini safety policy blocked this request.",
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part.text || "")
        .join("\n")
        .trim() || "";

    if (!text) {
      throw new BrainProviderError(
        "GEMINI",
        "Gemini returned an empty response.",
      );
    }

    return {
      text,
      provider: "GEMINI",
      model: CONFIG.geminiModel,
    };
  } catch (error: any) {
    if (error instanceof BrainProviderError) throw error;

    throw new BrainProviderError(
      "GEMINI",
      error?.message || "Gemini inference failed.",
    );
  }
}

// ============================================================
// 3. GROQ
// ============================================================

async function callGroq(prompt: string): Promise<BrainResult> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new BrainProviderError(
      "GROQ",
      "GROQ_API_KEY is not configured.",
    );
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },

        signal: AbortSignal.timeout(CONFIG.timeoutMs),

        body: JSON.stringify({
          model: CONFIG.groqModel,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          max_completion_tokens: CONFIG.maxTokens,
          reasoning_effort: "low",
          stream: false,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new BrainProviderError(
        "GROQ",
        data?.error?.message || `Groq HTTP ${response.status}`,
        response.status,
      );
    }

    const text =
      data?.choices?.[0]?.message?.content?.trim() || "";

    if (!text) {
      throw new BrainProviderError(
        "GROQ",
        "Groq returned an empty response.",
      );
    }

    return {
      text,
      provider: "GROQ",
      model: CONFIG.groqModel,
    };
  } catch (error: any) {
    if (error instanceof BrainProviderError) throw error;

    throw new BrainProviderError(
      "GROQ",
      error?.message || "Groq inference failed.",
    );
  }
}

// ============================================================
// SAFETY POLICY
// ============================================================

// Never bypass a safety refusal by asking another model.
// Provider availability errors can use failover.

function isSafetyFailure(error: BrainProviderError): boolean {
  return /safety|guardrail|blocked by policy|content policy/i.test(
    error.message,
  );
}

// ============================================================
// CENTRAL FAILOVER ENGINE
// ============================================================

async function generateWithFailover(
  prompt: string,
): Promise<BrainResult> {
  if (!prompt || !prompt.trim()) {
    throw new Error("Brain Gateway received an empty prompt.");
  }

  const providers: Array<{
    name: BrainProvider;
    enabled: boolean;
    run: (prompt: string) => Promise<BrainResult>;
  }> = [
    {
      name: "BEDROCK",
      enabled: Boolean(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY,
      ),
      run: callBedrock,
    },

    {
      name: "GEMINI",
      enabled: Boolean(process.env.GEMINI_API_KEY),
      run: callGemini,
    },

    {
      name: "GROQ",
      enabled:
        CONFIG.allowGroq &&
        Boolean(process.env.GROQ_API_KEY),
      run: callGroq,
    },
  ];

  const activeProviders = providers.filter(
    (provider) => provider.enabled,
  );

  if (activeProviders.length === 0) {
    throw new Error(
      "No AI provider is configured. Check server environment variables.",
    );
  }

  const failures: string[] = [];

  for (const provider of activeProviders) {
    try {
      console.log(
        `[Brain Gateway] Attempting ${provider.name}...`,
      );

      const result = await provider.run(prompt);

      console.log(
        `[Brain Gateway] Success → ${result.provider} (${result.model})`,
      );

      return result;
    } catch (error: any) {
      const failure =
        error instanceof BrainProviderError
          ? error
          : new BrainProviderError(
              provider.name,
              error?.message || "Unknown provider failure.",
            );

      console.error(
        `[Brain Gateway] ${provider.name} failed:`,
        failure.message,
      );

      failures.push(
        `${provider.name}: ${failure.message}`,
      );

      if (isSafetyFailure(failure)) {
        throw new Error(
          `Brain Gateway stopped because a provider safety policy intervened: ${failure.provider}`,
        );
      }

      console.warn(
        `[Brain Gateway] Switching to the next configured provider...`,
      );
    }
  }

  throw new Error(
    `All configured AI providers failed.\n${failures.join("\n")}`,
  );
}

// ============================================================
// LEGACY-COMPATIBLE INTERFACE
// ============================================================

// Existing agent files can retain their current imports.
// Their requested legacy model name is intentionally overridden
// by the central provider configuration.

export const vertexAI = {
  getGenerativeModel({
    model,
  }: {
    model: string;
  }) {
    return {
      async generateContent(prompt: string) {
        console.log(
          `[Brain Gateway] Legacy model request: ${model}`,
        );

        const result = await generateWithFailover(prompt);

        return {
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: result.text,
                    },
                  ],
                },
              },
            ],
          },

          provider: result.provider,
          actualModel: result.model,
        };
      },
    };
  },
};

// ============================================================
// HEALTH / CONFIGURATION SUMMARY
// ============================================================

export function getBrainConfiguration() {
  return {
    primary: "BEDROCK",
    secondary: "GEMINI",
    tertiary: CONFIG.allowGroq ? "GROQ" : "DISABLED",

    configured: {
      bedrock: Boolean(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY,
      ),

      gemini: Boolean(process.env.GEMINI_API_KEY),

      groq: Boolean(process.env.GROQ_API_KEY),
    },

    groqFallbackEnabled: CONFIG.allowGroq,
  };
}
