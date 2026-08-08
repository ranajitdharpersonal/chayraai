import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

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

export const medicalFlow = ai.defineFlow(
  {
    name: 'Medical_Triage',
    inputSchema: z.object({ input: z.string(), context: z.any().optional() }),
    outputSchema: z.array(z.string()),
  },
  async (payload) => {
    console.log(`[Medical]: Analyzing trauma context with Enterprise Swarm...`);
    try {
      const { output } = await ai.generate({
        prompt: `
          You are the Medical Agent in a crisis rescue system.
          Provide life-saving, concise first-aid steps based on the user's emergency.
          Keep it short, actionable, and under stress-friendly conditions. Maximum 3 or 4 steps.
          Emergency Context: "${payload.input}"
        `,
        output: { schema: z.array(z.string()) }
      });
      return (output as string[]) || getOfflineProtocol(payload.input);
    } catch (error) {
      console.error(`[Medical]: AI analysis failed. Activating Offline Lifeline Protocols!`, error);
      return getOfflineProtocol(payload.input);
    }
  }
);

AgentRegistry.registerAgent('Medical', medicalFlow);