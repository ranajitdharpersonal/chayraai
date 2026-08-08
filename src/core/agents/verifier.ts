import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function runVerifier(data: { input: string, radarIntel?: string }) {
  console.log(`[Verifier]: Generating Real Evidence Panel...`);
  const radarData = data.radarIntel || "No active radar intel.";
  const currentTimestamp = new Date().toISOString();
  try {
    const prompt = `
      You are the Verifier Agent in an Enterprise Fleet. 
      Cross-check the user's claim against the real-time Radar Intelligence.
      
      User Claim: "${data.input}"
      Radar Intel: "${radarData}"
      
      Rules for output:
      - "isVerified" must ONLY be true if the radar intel directly supports the claim.
      - "source" should be the name of the agency (e.g., USGS, NASA, ReliefWeb, User Report).
      - Identify any conflicting information.
      
      Return strictly a JSON object: {"source": "string", "sourceTime": "string", "confidenceReason": "string", "hasConflictingInfo": boolean, "isVerified": boolean}
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "{}";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    // Inject the current timestamp as the last checked time
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
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  { name: 'Verifier', version: '3.0.0', role: 'Fact Checker', status: 'ACTIVE', clearanceLevel: 'TIER_3' },
  runVerifier
);