
import { EnterpriseAgentRegistry } from '../adk/registry';
import { generateText } from '../brain/brain';

async function runVerifier(data: {
  input: string;
  radarIntel?: string;
}) {
  console.log(
    '[Verifier]: Generating evidence panel through Central Brain...',
  );

  const radarData =
    data.radarIntel || 'No saved radar intelligence available.';

  const currentTimestamp = new Date().toISOString();

  try {
    const prompt = `
You are the Verifier Agent in an Enterprise Crisis Fleet.

Cross-check the user's claim against the supplied radar intelligence.

User Claim:
${data.input}

Radar Intel:
${radarData}

Rules:
- isVerified may ONLY be true if radar intel directly supports the claim.
- Never invent sources, dates, or evidence.
- If there is insufficient evidence, isVerified must be false.
- Clearly identify conflicting information.

Return strictly a JSON object:
{
  "source": "string",
  "sourceTime": "string",
  "confidenceReason": "string",
  "hasConflictingInfo": false,
  "isVerified": false
}
`;

    const text = await generateText(prompt);

    const cleanJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const result = JSON.parse(cleanJson);

    return {
      source: String(result.source || 'Unknown'),
      sourceTime: String(result.sourceTime || 'Unknown'),
      confidenceReason: String(
        result.confidenceReason || 'Insufficient evidence.',
      ),
      hasConflictingInfo: Boolean(
        result.hasConflictingInfo,
      ),
      isVerified: result.isVerified === true,
      lastCheckedTimestamp: currentTimestamp,
    };
  } catch (error) {
    console.error(
      '[Verifier]: Central Brain unavailable.',
      error,
    );

    return {
      source: 'System Offline - User Report',
      sourceTime: currentTimestamp,
      confidenceReason:
        'Verification unavailable. No claim was independently verified.',
      hasConflictingInfo: false,
      lastCheckedTimestamp: currentTimestamp,
      isVerified: false,
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Verifier',
    version: '3.0.0',
    role: 'Fact Checker',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_3',
  },
  runVerifier,
);
