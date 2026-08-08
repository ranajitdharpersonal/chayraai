import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function runPublicHealth(data: { location?: string }) {
  console.log(`[Public Health]: Fetching trusted medical intelligence from UN ReliefWeb...`);
  let officialAlerts: any[] = [];
  try {
    const url = `https://api.reliefweb.int/v1/disasters?appname=chayra-ai&profile=list&preset=latest&query[value]=epidemic`;
    const response = await fetch(url);
    if (response.ok) {
      const apiData = await response.json();
      officialAlerts = apiData.data.slice(0, 5).map((item: any) => ({
        id: item.id,
        name: item.fields.name,
        url: item.href
      }));
    }
    const prompt = `
      You are the Public Health Agent. Review these official UN Epidemic alerts:
      ${JSON.stringify(officialAlerts)}
      Provide a highly professional, non-panic-inducing 2-sentence summary of the current global health risks.
      User Location Context: ${data.location || "Global"}
      Return strictly a JSON object: {"advisoryText": "string"}
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "{}";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    return {
      advisoryText: result.advisoryText || "Global health parameters normal.",
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

EnterpriseAgentRegistry.registerAgent(
  { name: 'PublicHealth', version: '3.0.0', role: 'Health Intel', status: 'ACTIVE', clearanceLevel: 'TIER_2' },
  runPublicHealth
);