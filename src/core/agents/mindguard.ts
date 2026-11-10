
import { EnterpriseAgentRegistry } from '../adk/registry';

// ============================================================
// CHAYRA AI 3.0 — LIGHTWEIGHT MINDGUARD
// Basic structural input validation only.
// This is NOT a prompt-injection or content-security filter.
// ============================================================

const MAX_INPUT_CHARS = 20_000;

// Reject unexpected control characters while allowing
// normal tabs, line breaks and carriage returns.
const INVALID_CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// ============================================================
// MINDGUARD AGENT
// ============================================================

async function runMindGuard(data: { input?: unknown }) {
  console.log(
    '[MindGuard]: Running basic input validation...',
  );

  // 1. Validate the input type.
  if (
    !data ||
    typeof data.input !== 'string'
  ) {
    return {
      isEmergency: false,
      securityStatus: 'REJECTED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason: 'Invalid input format. A text message is required.',
    };
  }

  // 2. Trim whitespace.
  const userInput = data.input.trim();

  if (!userInput) {
    return {
      isEmergency: false,
      securityStatus: 'REJECTED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason: 'Empty input rejected.',
    };
  }

  // 3. Enforce maximum input length.
  if (userInput.length > MAX_INPUT_CHARS) {
    return {
      isEmergency: false,
      securityStatus: 'REJECTED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason: `Input exceeds the maximum allowed length of ${MAX_INPUT_CHARS} characters.`,
    };
  }

  // 4. Reject unexpected control characters.
  if (INVALID_CONTROL_CHARACTERS.test(userInput)) {
    return {
      isEmergency: false,
      securityStatus: 'REJECTED',
      threatLevel: 'UNKNOWN',
      emergencyVerification: 'UNVERIFIED',
      reason: 'Input contains unsupported control characters.',
    };
  }

  // 5. Basic validation passed.
  // This does NOT mean the content is safe or verified.
  console.log(
    '[MindGuard]: Basic input validation passed.',
  );

  return {
    isEmergency: true,
    securityStatus: 'BASIC_VALIDATION_PASSED',
    threatLevel: 'PENDING',
    emergencyVerification: 'UNVERIFIED',
    reason:
      'Input passed basic structural validation. Content security and emergency verification remain pending.',
  };
}

// ============================================================
// ENTERPRISE AGENT REGISTRATION
// ============================================================

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'MindGuard',
    version: '3.0.0',
    role: 'Basic Input Validation Gateway',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runMindGuard,
);
