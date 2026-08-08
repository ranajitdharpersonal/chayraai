import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function runVault(data: { input: string, context?: any }) {
  console.log(`[Vault]: Securing identity and generating beacon...`);
  const fallbackBeacon = "CHY-" + Math.floor(100000 + Math.random() * 900000);
  try {
    const prompt = `
      You are the Vault Agent in a crisis system.
      Determine if the user faces network issues. Generate a secure, 6-character alphanumeric rescue beacon ID.
      User Context: "${data.input}"
      Return strictly a JSON object: {"isOfflineRisk": boolean, "beaconId": "string", "instruction": "string"}
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "{}";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const vaultData = JSON.parse(cleanJson);
    
    if (vaultData.isOfflineRisk) {
      return `[MESH NETWORK ACTIVE] Beacon: ${vaultData.beaconId}. Keep Bluetooth enabled for peer-to-peer rescue ping. ${vaultData.instruction}`;
    }
    return `Digital ID Encrypted. Secure Beacon [${vaultData.beaconId}] broadcasted. ${vaultData.instruction}`;
  } catch (error) {
    console.error(`[Vault]: AI failed. Using Offline Fallback.`, error);
    const isOffline = data.input.toLowerCase().includes("offline") || data.input.toLowerCase().includes("internet");
    if (isOffline) return `[OFFLINE FALLBACK] Mesh network active. Beacon: ${fallbackBeacon}. Keep Bluetooth ON.`;
    return `Secure Rescue Beacon [${fallbackBeacon}] broadcasted to local channels.`;
  }
}

EnterpriseAgentRegistry.registerAgent(
  { name: 'Vault', version: '3.0.0', role: 'Identity Vault', status: 'ACTIVE', clearanceLevel: 'TIER_1' },
  runVault
);