
import { EnterpriseAgentRegistry } from '../adk/registry';
import { generateText } from '../brain/brain';

async function runVault(data: {
  input: string;
  context?: any;
}) {
  console.log(
    '[Vault]: Generating rescue beacon through Central Brain...',
  );

  const fallbackBeacon =
    'CHY-' + Math.floor(100000 + Math.random() * 900000);

  try {
    const prompt = `
You are the Vault Agent in a crisis response system.

Determine whether the user faces network connectivity issues.

Generate a 6-character alphanumeric rescue beacon ID.

User Context:
${data.input}

Return strictly a JSON object:
{
  "isOfflineRisk": false,
  "beaconId": "ABC123",
  "instruction": "string"
}
`;

    const text = await generateText(prompt);

    const cleanJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const vaultData = JSON.parse(cleanJson);

    const beaconId =
      /^[A-Z0-9]{6}$/i.test(vaultData.beaconId)
        ? vaultData.beaconId
        : fallbackBeacon;

    const instruction =
      typeof vaultData.instruction === 'string'
        ? vaultData.instruction
        : 'Keep emergency communication available.';

    if (vaultData.isOfflineRisk === true) {
      return (
        `[MESH NETWORK ACTIVE] Beacon: ${beaconId}. ` +
        `Keep Bluetooth enabled for peer-to-peer rescue communication. ${instruction}`
      );
    }

    return (
      `Secure Rescue Beacon [${beaconId}] generated. ${instruction}`
    );
  } catch (error) {
    console.error(
      '[Vault]: Central Brain unavailable. Using offline fallback.',
      error,
    );

    const isOffline =
      data.input.toLowerCase().includes('offline') ||
      data.input.toLowerCase().includes('internet');

    if (isOffline) {
      return (
        `[OFFLINE FALLBACK] Mesh network active. ` +
        `Beacon: ${fallbackBeacon}. Keep Bluetooth ON.`
      );
    }

    return (
      `Rescue Beacon [${fallbackBeacon}] generated locally.`
    );
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Vault',
    version: '3.0.0',
    role: 'Identity Vault',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1',
  },
  runVault,
);
