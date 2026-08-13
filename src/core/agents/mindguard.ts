import { EnterpriseAgentRegistry } from '../adk/registry';
import { ModelArmorClient } from '@google-cloud/modelarmor';

// ============================================================
// CHAYRA AI 3.0 — GOOGLE CLOUD MODEL ARMOR CONFIGURATION
// ============================================================

const configuredProjectId =
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

if (!configuredProjectId) {
  throw new Error(
    '[MindGuard] Missing Google Cloud project configuration.',
  );
}

// Narrowed, immutable value used throughout the module.
// This avoids the TypeScript `string | undefined` error inside
// nested functions/closures.
const projectId: string =
  configuredProjectId;

const modelArmorLocation =
  process.env.MODEL_ARMOR_LOCATION ||
  'us-central1';

const templateId =
  process.env.MODEL_ARMOR_TEMPLATE_ID ||
  'default';

if (!templateId) {
  throw new Error(
    '[MindGuard] Missing MODEL_ARMOR_TEMPLATE_ID.',
  );
}

const clientEmail =
  process.env.GOOGLE_CLIENT_EMAIL?.trim();

const privateKey =
  process.env.GOOGLE_PRIVATE_KEY?.replace(
    /\\n/g,
    '\n',
  );

// ============================================================
// MODEL ARMOR CLIENT
// ============================================================
//
// Cloud Run:
//   Uses Application Default Credentials (ADC) from the
//   attached service account.
//
// Local/dev:
//   Uses explicit GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY
//   when both are available.
//
// IMPORTANT:
//   We never pass an empty credentials object to the SDK.
//   That would override ADC and break production auth.
// ============================================================

let modelArmorClient:
  | ModelArmorClient
  | null = null;

function getModelArmorClient():
  ModelArmorClient {
  if (modelArmorClient) {
    return modelArmorClient;
  }

  // Use a permissive local options type here because the installed
  // ModelArmor SDK may expose its constructor options differently
  // across minor package versions.
  const clientOptions: any = {
    projectId,
    apiEndpoint:
      `modelarmor.${modelArmorLocation}.rep.googleapis.com`,
  };

  if (
    clientEmail &&
    privateKey
  ) {
    clientOptions.credentials = {
      client_email:
        clientEmail,
      private_key:
        privateKey,
    };
  }

  modelArmorClient =
    new ModelArmorClient(
      clientOptions,
    );

  return modelArmorClient;
}

const templateName =
  `projects/${projectId}/locations/${modelArmorLocation}/templates/${templateId}`;

// ============================================================
// MINDGUARD AGENT
// ============================================================

async function runMindGuard(
  data: { input: string },
) {
  const userInput =
    typeof data.input ===
    'string'
      ? data.input.trim()
      : '';

  console.log(
    '[MindGuard]: Executing Google Cloud Model Armor scan...',
  );

  if (!userInput) {
    return {
      isEmergency: true,
      securityStatus: 'CLEARED',
      threatLevel: 'UNKNOWN',
      emergencyVerification:
        'UNVERIFIED',
      reason:
        'Empty input cleared for downstream handling.',
    };
  }

  try {
    const client =
      getModelArmorClient();

    const [response] =
      await client.sanitizeUserPrompt({
        name:
          templateName,

        userPromptData: {
          text:
            userInput,
        },
      });

    const sanitizationResult =
      response.sanitizationResult;

    const filterMatchState =
      sanitizationResult
        ?.filterMatchState;

    const invocationResult =
      sanitizationResult
        ?.invocationResult;

    console.log(
      `[MindGuard]: Model Armor result → ` +
        `invocation=${
          invocationResult ??
          'UNKNOWN'
        }, ` +
        `match=${
          filterMatchState ??
          'UNKNOWN'
        }`,
    );

    // ==========================================================
    // SECURITY BLOCK
    // ==========================================================

    if (
      invocationResult ===
        'SUCCESS' &&
      filterMatchState ===
        'MATCH_FOUND'
    ) {
      console.warn(
        '[MindGuard]: Model Armor BLOCKED the request.',
      );

      return {
        isEmergency: false,
        securityStatus:
          'BLOCKED',
        threatLevel:
          'NONE',
        emergencyVerification:
          'NOT_APPLICABLE',
        reason:
          'Request blocked by Google Cloud Model Armor security policy.',
      };
    }

    // ==========================================================
    // SECURITY CLEAR
    // ==========================================================

    if (
      invocationResult ===
        'SUCCESS' &&
      filterMatchState ===
        'NO_MATCH_FOUND'
    ) {
      console.log(
        '[MindGuard]: Security cleared. ' +
          'Emergency status remains unverified.',
      );

      return {
        isEmergency: true,
        securityStatus:
          'CLEARED',
        threatLevel:
          'PENDING',
        emergencyVerification:
          'UNVERIFIED',
        reason:
          'Cleared by Google Cloud Model Armor. ' +
          'Proceeding to downstream crisis analysis.',
      };
    }

    // ==========================================================
    // UNKNOWN MODEL ARMOR RESULT
    // ==========================================================

    console.warn(
      '[MindGuard]: Model Armor returned an unexpected result.',
    );

    return {
      isEmergency: false,
      securityStatus:
        'DEGRADED',
      threatLevel:
        'UNKNOWN',
      emergencyVerification:
        'UNVERIFIED',
      reason:
        'Security verification returned an unexpected result. ' +
        'Request blocked until verification is available.',
    };
  } catch (error) {
    console.error(
      '[MindGuard]: Model Armor verification failed.',
      error,
    );

    // Enterprise-safe default:
    // never silently trust an unavailable security gateway.
    return {
      isEmergency: false,
      securityStatus:
        'DEGRADED',
      threatLevel:
        'UNKNOWN',
      emergencyVerification:
        'UNVERIFIED',
      reason:
        'Google Cloud Model Armor is unavailable. ' +
        'Request blocked until security verification is restored.',
    };
  }
}

// ============================================================
// ENTERPRISE REGISTRATION
// ============================================================

EnterpriseAgentRegistry.registerAgent(
  {
    name:
      'MindGuard',

    version:
      '3.0.0',

    role:
      'Official Model Armor Security Gateway',

    status:
      'ACTIVE',

    clearanceLevel:
      'TIER_1',
  },
  runMindGuard,
);