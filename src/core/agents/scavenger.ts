
import { EnterpriseAgentRegistry } from '../adk/registry';
import { generateText } from '../brain/brain';

async function runScavenger(data: { input: string }) {
  console.log(
    '[Scavenger]: Extracting tactical context through Central Brain...',
  );

  try {
    const prompt = `
You are the Scavenger agent for an emergency response system.

Analyze the crisis input:
${data.input}

Extract:
- threatLevel: HIGH, LOW, MEDIUM, or CRITICAL
- requiredAgents: choose from Medical, Navigator, Vault

Return strictly a JSON object:
{
  "threatLevel": "string",
  "requiredAgents": ["Medical", "Navigator"]
}
`;

    const responseText = await generateText(prompt);

    const cleanJson = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const result = JSON.parse(cleanJson);

    const validLevels = [
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
    ];

    const validAgents = [
      'Medical',
      'Navigator',
      'Vault',
    ];

    return {
      threatLevel: validLevels.includes(
        String(result?.threatLevel).toUpperCase(),
      )
        ? String(result.threatLevel).toUpperCase()
        : 'UNKNOWN',

      requiredAgents: Array.isArray(result?.requiredAgents)
        ? result.requiredAgents.filter(
            (agent: string) => validAgents.includes(agent),
          )
        : ['Medical', 'Navigator'],
    };
  } catch (error) {
    console.error(
      '[Scavenger]: Central Brain unavailable. Using safe defaults.',
      error,
    );

    return {
      threatLevel: 'UNKNOWN',
      requiredAgents: ['Medical', 'Navigator', 'Vault'],
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Scavenger',
    version: '3.0.0',
    role: 'Context & Intent Extractor',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runScavenger,
);
