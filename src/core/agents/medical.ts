
import { EnterpriseAgentRegistry } from '../adk/registry';
import { generateText } from '../brain/brain';

const fallbackProtocols = {
  bleeding: [
    'Apply firm, direct pressure to the wound with a clean cloth.',
    'Keep the injured area elevated above the heart if possible.',
    'If bleeding does not stop, seek emergency medical help immediately.',
  ],
  burns: [
    'Cool the burn with cool running water for at least 20 minutes.',
    'Remove constricting items before swelling starts.',
    'Cover loosely with a clean, non-fluffy dressing. Do not pop blisters.',
  ],
  fracture: [
    'Do not try to realign the bone.',
    'Keep the injured area still and supported.',
    'Seek urgent medical assessment.',
  ],
  breathing: [
    'Call local emergency services immediately.',
    'Help the person into a position that makes breathing easier.',
    'If unresponsive and not breathing normally, begin CPR if trained.',
  ],
  default: [
    'Stay calm and assess the situation.',
    'Check responsiveness and breathing.',
    'Move to a safer location if the current position is dangerous.',
  ],
};

function getOfflineProtocol(context: string): string[] {
  const lowerContext = context.toLowerCase();

  if (
    lowerContext.includes('blood') ||
    lowerContext.includes('bleeding') ||
    lowerContext.includes('cut')
  ) return fallbackProtocols.bleeding;

  if (
    lowerContext.includes('burn') ||
    lowerContext.includes('fire')
  ) return fallbackProtocols.burns;

  if (
    lowerContext.includes('broken') ||
    lowerContext.includes('bone') ||
    lowerContext.includes('fracture')
  ) return fallbackProtocols.fracture;

  if (
    lowerContext.includes('breath') ||
    lowerContext.includes('choke')
  ) return fallbackProtocols.breathing;

  return fallbackProtocols.default;
}

async function runMedical(data: {
  input: string;
  context?: any;
}) {
  console.log(
    '[Medical]: Analyzing trauma context through Central Brain...',
  );

  try {
    const prompt = `
You are the Medical Agent in a crisis rescue system.

Provide concise, actionable first-aid steps based on the emergency.

Maximum 3 or 4 steps.
Do not invent medical facts.
Encourage emergency medical services for serious or life-threatening conditions.

Emergency Context:
${data.input}

Return strictly a JSON array of strings:
["step 1", "step 2", "step 3"]
`;

    const text = await generateText(prompt);

    const cleanJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const result = JSON.parse(cleanJson);

    return Array.isArray(result) && result.length > 0
      ? result
      : getOfflineProtocol(data.input);
  } catch (error) {
    console.error(
      '[Medical]: Central Brain unavailable. Activating offline protocols.',
      error,
    );

    return getOfflineProtocol(data.input);
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Medical',
    version: '3.0.0',
    role: 'Triage Specialist',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runMedical,
);
