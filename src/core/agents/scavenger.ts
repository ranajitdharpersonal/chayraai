import { EnterpriseAgentRegistry } from '../adk/registry';
import { vertexAI } from '../adk/registry';

// Initialize the native model
const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function runScavenger(data: { input: string }) {
  console.log(`[Scavenger]: Extracting tactical context using Native Vertex AI...`);
  
  try {
    const prompt = `
      You are the Scavenger agent for an emergency response system.
      Analyze the following crisis input: "${data.input}"
      Extract the threat level (HIGH, LOW, CRITICAL) and determine which of these agents are required: Medical, Navigator, Vault.
      Return strictly a JSON object with keys: "threatLevel" (string) and "requiredAgents" (array of strings).
    `;
    
    const resp = await generativeModel.generateContent(prompt);
    const responseText = resp.response.candidates?.[0].content.parts[0].text || "{}";
    
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("[Scavenger]: Parsing failed, falling back to default protocols.", error);
    // Fail-safe returns all agents just in case
    return { threatLevel: "UNKNOWN", requiredAgents: ["Medical", "Navigator", "Vault"] };
  }
}

// Zero-Trust Registration
EnterpriseAgentRegistry.registerAgent(
  {
    name: 'Scavenger',
    version: '3.0.0',
    role: 'Context & Intent Extractor',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1'
  },
  runScavenger
);