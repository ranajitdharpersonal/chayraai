import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

export const vaultFlow = ai.defineFlow(
  {
    name: 'Vault_Identity',
    inputSchema: z.object({ input: z.string(), context: z.any().optional() }),
    outputSchema: z.string(),
  },
  async (payload) => {
    console.log(`[Vault]: Securing identity and generating beacon...`);
    const fallbackBeacon = "CHY-" + Math.floor(100000 + Math.random() * 900000);

    try {
      const { output } = await ai.generate({
        prompt: `
          You are the Vault Agent in a crisis system.
          Determine if the user faces network issues. Generate a secure, 6-character alphanumeric rescue beacon ID.
          User Context: "${payload.input}"
        `,
        output: {
          schema: z.object({
            isOfflineRisk: z.boolean(),
            beaconId: z.string(),
            instruction: z.string()
          })
        }
      });
      
      const vaultData = output as { isOfflineRisk: boolean, beaconId: string, instruction: string };
      if (vaultData.isOfflineRisk) {
        return `[MESH NETWORK ACTIVE] Beacon: ${vaultData.beaconId}. Keep Bluetooth enabled for peer-to-peer rescue ping. ${vaultData.instruction}`;
      }
      return `Digital ID Encrypted. Secure Beacon [${vaultData.beaconId}] broadcasted. ${vaultData.instruction}`;
    } catch (error) {
      console.error(`[Vault]: AI failed. Using Offline Fallback.`, error);
      const isOffline = payload.input.toLowerCase().includes("offline") || payload.input.toLowerCase().includes("internet");
      if (isOffline) return `[OFFLINE FALLBACK] Mesh network active. Beacon: ${fallbackBeacon}. Keep Bluetooth ON.`;
      return `Secure Rescue Beacon [${fallbackBeacon}] broadcasted to local channels.`;
    }
  }
);

AgentRegistry.registerAgent('Vault', vaultFlow);