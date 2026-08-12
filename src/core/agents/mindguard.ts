import { EnterpriseAgentRegistry } from '../adk/registry';
import { ModelArmorClient } from '@google-cloud/modelarmor';

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

const modelArmorLocation =
  process.env.MODEL_ARMOR_LOCATION ||
  'us-central1';

const templateId =
  process.env.MODEL_ARMOR_TEMPLATE_ID ||
  'default';

if (!projectId) {
  throw new Error(
    '[MindGuard] Missing GOOGLE_CLOUD_PROJECT_ID.'
  );
}

if (!templateId) {
  throw new Error(
    '[MindGuard] Missing MODEL_ARMOR_TEMPLATE_ID.'
  );
}

const modelArmorClient = new ModelArmorClient({
  projectId,
  apiEndpoint:
    `modelarmor.${modelArmorLocation}.rep.googleapis.com`,
  credentials: {
    client_email:
      process.env.GOOGLE_CLIENT_EMAIL,

    private_key:
      process.env.GOOGLE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
  },
});

const templateName =
  `projects/${projectId}/locations/${modelArmorLocation}/templates/${templateId}`;

async function runMindGuard(
  data: { input: string }
) {
  const userInput =
    typeof data.input === 'string'
      ? data.input.trim()
      : '';

  console.log(
    '[MindGuard]: Executing Google Cloud Model Armor scan...'
  );

  if (!userInput) {
    return {
      isEmergency: true,
      securityStatus: 'CLEARED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason:
        'Empty input cleared for downstream handling.',
    };
  }

  try {
    const [response] =
      await modelArmorClient.sanitizeUserPrompt({
        name: templateName,
        userPromptData: {
          text: userInput,
        },
      });

    const sanitizationResult =
      response.sanitizationResult;

    const filterMatchState =
      sanitizationResult?.filterMatchState;

    const invocationResult =
      sanitizationResult?.invocationResult;

    console.log(
      `[MindGuard]: Model Armor result → ` +
      `invocation=${invocationResult ?? 'UNKNOWN'}, ` +
      `match=${filterMatchState ?? 'UNKNOWN'}`
    );

    // ==========================================================
    // SECURITY BLOCK
    // ==========================================================

    if (
      invocationResult === 'SUCCESS' &&
      filterMatchState === 'MATCH_FOUND'
    ) {
      console.warn(
        '[MindGuard]: Model Armor BLOCKED the request.'
      );

      return {
        isEmergency: false,
        securityStatus: 'BLOCKED',
        threatLevel: 'NONE',
        emergencyVerification: 'NOT_APPLICABLE',
        reason:
          'Request blocked by Google Cloud Model Armor security policy.',
      };
    }

    // ==========================================================
    // SECURITY CLEAR
    // ==========================================================
    //
    // IMPORTANT:
    // NO_MATCH_FOUND does NOT mean:
    //
    // "This is a verified emergency."
    //
    // It only means the configured Model Armor filters did not
    // detect a policy violation.
    //
    // We therefore allow the request to continue downstream.
    // Scavenger / Radar / Verifier will determine the actual
    // emergency context and evidence later.
    //
    // isEmergency:true is retained only for compatibility with
    // the current runtime gate.

    if (
      invocationResult === 'SUCCESS' &&
      filterMatchState === 'NO_MATCH_FOUND'
    ) {
      console.log(
        '[MindGuard]: Security cleared. ' +
        'Emergency status remains unverified.'
      );

      return {
        isEmergency: true,
        securityStatus: 'CLEARED',
        threatLevel: 'PENDING',
        emergencyVerification: 'UNVERIFIED',
        reason:
          'Cleared by Google Cloud Model Armor. ' +
          'Proceeding to downstream crisis analysis.',
      };
    }

    // ==========================================================
    // UNKNOWN MODEL ARMOR RESULT
    // ==========================================================

    console.warn(
      '[MindGuard]: Model Armor returned an unexpected result.'
    );

    return {
      isEmergency: false,
      securityStatus: 'DEGRADED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason:
        'Security verification returned an unexpected result. ' +
        'Request blocked until verification is available.',
    };

  } catch (error) {
    console.error(
      '[MindGuard]: Model Armor verification failed.',
      error
    );

    // Enterprise-safe default:
    // never silently trust an unavailable security gateway.
    return {
      isEmergency: false,
      securityStatus: 'DEGRADED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason:
        'Google Cloud Model Armor is unavailable. ' +
        'Request blocked until security verification is restored.',
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'MindGuard',
    version: '3.0.0',
    role: 'Official Model Armor Security Gateway',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runMindGuard
);