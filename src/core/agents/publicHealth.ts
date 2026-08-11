import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function runPublicHealth(data: { location?: string }) {
  console.log(`[Public Health]: Fetching trusted 15-day medical intel & mapping spread...`);
  let officialAlerts: any[] = [];
  
  try {
    // 🛑 REAL DATA FETCH: Pulling the latest real-world epidemic alerts
    const url = `https://api.reliefweb.int/v1/disasters?appname=chayra-ai&profile=list&preset=latest&query[value]=epidemic&limit=15`;
    const response = await fetch(url);
    if (response.ok) {
      const apiData = await response.json();
      officialAlerts = apiData.data.map((item: any) => ({
        id: item.id,
        name: item.fields.name,
        url: item.href,
        date: item.fields.date?.created || new Date().toISOString()
      }));
    }
    
    // 🛑 THE MASTER PROMPT: 15-Day Trends + Predicting Spread & Lat/Lng!
    const prompt = `
      You are the Public Health Intelligence Agent for an Enterprise Crisis Swarm.
      Today's date is August 9, 2026.
      Review these real UN ReliefWeb epidemic alerts (which aggregate WHO, CDC, ECDC, PAHO data):
      ${JSON.stringify(officialAlerts)}
      
      Task 1: Analyze the trends from the last 15 days based ONLY on the provided data.
      Task 2: Predict the most vulnerable zones (neighboring countries) for the upcoming 15 days.
      Task 3: For map plotting, provide the ISO 3166-1 alpha-3 code AND the approximate central Latitude/Longitude for both the active country and the vulnerable countries.
      
      Return strictly a JSON object with this exact structure:
      {
        "advisoryText": "2-3 sentences summarizing the past 15-day trend and upcoming prediction.",
        "outbreakReports": [
          { 
            "title": "string (e.g., CHOLERA OUTBREAK - SUDAN)", 
            "description": "string (tactical summary of the real data)",
            "spreadForecast": "string (Explain why it might spread to specific neighboring regions)",
            "source": "string (e.g., UN ReliefWeb / WHO / CDC)", 
            "date": "string (Exact real date of the report)",
            "activeZone": { "isoCode": "SDN", "lat": 15.0, "lng": 30.0 },
            "vulnerableZones": [
              { "isoCode": "TCD", "lat": 15.0, "lng": 19.0 }
            ]
          }
        ]
      }
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "{}";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    return {
      healthAdvisory: result.advisoryText || "Global health parameters normal.",
      outbreakReports: result.outbreakReports || [],
      officialAlerts: officialAlerts
    };
  } catch (error) {
    console.error(`[Public Health]: API Fetch failed.`, error);
    return {
      healthAdvisory: "System unable to connect to trusted medical servers. Maintain standard hygiene protocols.",
      outbreakReports: [],
      officialAlerts: []
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  { name: 'PublicHealth', version: '3.0.0', role: 'Health Intel', status: 'ACTIVE', clearanceLevel: 'TIER_2' },
  runPublicHealth
);