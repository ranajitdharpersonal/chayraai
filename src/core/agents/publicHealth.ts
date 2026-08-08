import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

export const publicHealthFlow = ai.defineFlow(
  {
    name: 'PublicHealth_Intel',
    inputSchema: z.object({ location: z.string().optional() }),
    outputSchema: z.object({
      advisoryText: z.string(),
      officialAlerts: z.array(z.any())
    }),
  },
  async (payload) => {
    console.log(`[Public Health]: Fetching trusted medical intelligence from UN ReliefWeb...`);
    
    let officialAlerts: any[] = [];
    
    try {
      // TRUSTED DATA SOURCE: ReliefWeb API (Managed by UN) for Epidemics
      const url = `https://api.reliefweb.int/v1/disasters?appname=chayra-ai&profile=list&preset=latest&query[value]=epidemic`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        officialAlerts = data.data.slice(0, 5).map((item: any) => ({
          id: item.id,
          name: item.fields.name,
          url: item.href
        }));
      }

      // LLM reads the trusted data to summarize for the user
      const { output } = await ai.generate({
        prompt: `
          You are the Public Health Agent. Review these official UN Epidemic alerts:
          ${JSON.stringify(officialAlerts)}
          
          Provide a highly professional, non-panic-inducing 2-sentence summary of the current global health risks.
          User Location Context: ${payload.location || "Global"}
        `,
        output: { schema: z.object({ advisoryText: z.string() }) }
      });

      return {
        advisoryText: (output as any).advisoryText,
        officialAlerts: officialAlerts
      };

    } catch (error) {
      console.error(`[Public Health]: API Fetch failed.`, error);
      return {
        advisoryText: "System unable to connect to WHO/UN servers. Maintain standard hygiene protocols.",
        officialAlerts: []
      };
    }
  }
);

// Expanding the Enterprise Registry!
AgentRegistry.registerAgent('PublicHealth', publicHealthFlow);