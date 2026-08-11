import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

const fallbackProtocols = {
  bleeding: ["Apply firm, direct pressure to the wound with a clean cloth.", "Keep the injured area elevated above the heart if possible.", "If the bleeding doesn't stop, apply a tourniquet 2-3 inches above the wound."],
  burns: ["Cool the burn immediately with cool running water for at least 10 minutes.", "Remove constricting items (rings, belts) before swelling starts.", "Cover the burn loosely with a clean, dry dressing. Do NOT pop blisters."],
  fracture: ["Do NOT try to realign the bone.", "Immobilize the area using a splint.", "Apply an ice pack wrapped in a cloth to reduce swelling."],
  breathing: ["Ensure the airway is clear.", "If the person is unresponsive and not breathing, begin CPR immediately.", "If choking, perform abdominal thrusts."],
  default: ["Stay calm and assess the situation.", "Check for responsiveness and breathing.", "Move to a safe location if your current position is dangerous."]
};

function getOfflineProtocol(context: string): string[] {
  const lowerContext = context.toLowerCase();
  if (lowerContext.includes("blood") || lowerContext.includes("bleeding") || lowerContext.includes("cut")) return fallbackProtocols.bleeding;
  if (lowerContext.includes("burn") || lowerContext.includes("fire")) return fallbackProtocols.burns;
  if (lowerContext.includes("broken") || lowerContext.includes("bone")) return fallbackProtocols.fracture;
  if (lowerContext.includes("breath") || lowerContext.includes("choke")) return fallbackProtocols.breathing;
  return fallbackProtocols.default;
}

async function runMedical(data: { input: string, context?: any }) {
  console.log(`[Medical]: Analyzing trauma context with Enterprise Swarm...`);
  try {
    const prompt = `
      You are the Medical Agent in a crisis rescue system.
      Provide life-saving, concise first-aid steps based on the user's emergency.
      Keep it short, actionable, and under stress-friendly conditions. Maximum 3 or 4 steps.
      Emergency Context: "${data.input}"
      Return strictly a JSON array of strings: ["step 1", "step 2", "step 3"]
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    return Array.isArray(result) && result.length > 0 ? result : getOfflineProtocol(data.input);
  } catch (error) {
    console.error(`[Medical]: AI analysis failed. Activating Offline Lifeline Protocols!`, error);
    return getOfflineProtocol(data.input);
  }
}

EnterpriseAgentRegistry.registerAgent(
  { name: 'Medical', version: '3.0.0', role: 'Triage Specialist', status: 'ACTIVE', clearanceLevel: 'TIER_1' },
  runMedical
);