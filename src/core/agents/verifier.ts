import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

// 1. Define the exact "Real Evidence Panel" Schema
const EvidenceSchema = z.object({
  source: z.string(),
  sourceTime: z.string(),
  confidenceReason: z.string(),
  hasConflictingInfo: z.boolean(),
  lastCheckedTimestamp: z.string(),
  isVerified: z.boolean() // ONLY true if actual source exists
});

type EvidenceOutput = z.infer<typeof EvidenceSchema>;

export const verifierFlow = ai.defineFlow(
  {
    name: 'Verifier_FactCheck',
    inputSchema: z.object({ input: z.string(), radarIntel: z.string().optional() }),
    outputSchema: EvidenceSchema,
  },
  async (payload): Promise<EvidenceOutput> => {
    console.log(`[Verifier]: Generating Real Evidence Panel...`);
    const radarData = payload.radarIntel || "No active radar intel.";
    const currentTimestamp = new Date().toISOString();

    try {
      const { output } = await ai.generate({
        prompt: `
          You are the Verifier Agent in an Enterprise Fleet. 
          Cross-check the user's claim against the real-time Radar Intelligence.
          
          User Claim: "${payload.input}"
          Radar Intel: "${radarData}"
          
          Rules for output:
          - "isVerified" must ONLY be true if the radar intel directly supports the claim.
          - "source" should be the name of the agency (e.g., USGS, NASA, ReliefWeb, User Report).
          - Identify any conflicting information.
        `,
        output: { schema: EvidenceSchema }
      });

      // Inject the current timestamp as the last checked time
      const result = output as EvidenceOutput;
      result.lastCheckedTimestamp = currentTimestamp;
      
      return result;
    } catch (error) {
      console.error(`[Verifier]: Fact-Check failed. Defaulting to Trust-User protocol.`, error);
      return { 
        source: "System Offline - User Report", 
        sourceTime: currentTimestamp, 
        confidenceReason: "System offline. Defaulting to user trust protocol.", 
        hasConflictingInfo: false, 
        lastCheckedTimestamp: currentTimestamp, 
        isVerified: false 
      } as EvidenceOutput;
    }
  }
);

AgentRegistry.registerAgent('Verifier', verifierFlow);