import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

// 1. Define the Schema outside to make TypeScript happy
const ScavengerOutputSchema = z.object({
  threatLevel: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  emergencyCategory: z.string(),
  mentionedLocation: z.string().nullable(),
  requiredAgents: z.array(z.string())
});

// 2. Extract the exact TypeScript Type from the Zod Schema
type ScavengerOutput = z.infer<typeof ScavengerOutputSchema>;

export const scavengerFlow = ai.defineFlow(
  {
    name: 'Scavenger_Extraction',
    inputSchema: z.object({ input: z.string(), context: z.any().optional() }),
    outputSchema: ScavengerOutputSchema,
  },
  // 3. Explicitly tell TypeScript we are returning a Promise of ScavengerOutput
  async (payload): Promise<ScavengerOutput> => {
    console.log(`[Scavenger]: Extracting raw emergency data...`);
    try {
      const { output } = await ai.generate({
        prompt: `
          You are the Scavenger Agent in a crisis rescue system.
          Analyze the following raw emergency text from a victim and extract critical data.
          Required Agents must be chosen from: ["Medical", "Navigator", "Vault"]
          Raw Emergency Text: "${payload.input}"
        `,
        output: {
          schema: ScavengerOutputSchema
        }
      });
      
      // Directly return the cleanly generated output
      return output as ScavengerOutput;

    } catch (error) {
      console.error(`[Scavenger]: AI Extraction failed.`, error);
      
      // 4. Force type cast as ScavengerOutput so TypeScript knows it's 100% valid
      return { 
        threatLevel: "CRITICAL", 
        emergencyCategory: "Unknown", 
        mentionedLocation: null, 
        requiredAgents: ["Medical", "Navigator"] 
      } as ScavengerOutput;
    }
  }
);

AgentRegistry.registerAgent('Scavenger', scavengerFlow);