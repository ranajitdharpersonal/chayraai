import { EnterpriseAgentRegistry, vertexAI } from '../adk/registry';

const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function fetchNearestFacility(lat: number, lng: number, type: string) {
  let query = "";
  if (type === 'hospital') {
    query = `[out:json];(nwr["amenity"="hospital"](around:25000,${lat},${lng});nwr["amenity"="clinic"](around:25000,${lat},${lng}););out center;`;
  } else {
    query = `[out:json];(nwr["military"="bunker"](around:25000,${lat},${lng});nwr["amenity"="shelter"](around:25000,${lat},${lng}););out center;`;
  }
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    console.log(`[Navigator]: Fetching OSM Data for ${type} (Radius: 25km)...`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ChayRa-AI-Enterprise/3.0 (Hackathon)'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.elements && data.elements.length > 0) {
      const nearest = data.elements[0];
      const foundLat = nearest.lat || nearest.center?.lat;
      const foundLng = nearest.lon || nearest.center?.lon;
      if (foundLat && foundLng) return { lat: foundLat, lng: foundLng };
    }
    return null;
  } catch (e) {
    console.error("Overpass API Complete Failure:", e);
    return null;
  }
}

async function runNavigator(data: { input: string, userCoords?: { lat: number, lng: number } }) {
  console.log(`[Navigator]: Executing DUAL-SCAN for real-world safe zones...`);
  if (!data.userCoords) {
    throw new Error("User coordinates missing. Cannot calculate real-world route.");
  }
  try {
    const prompt = `
      You are the Navigator Agent in a crisis rescue system.
      We will automatically search for BOTH "hospital" and "bunker" in the background.
      You need to decide which one is the HIGHEST PRIORITY based on the emergency to draw the primary map route.
      User Emergency: "${data.input}"
      Return strictly a JSON object: {"primaryNeed": "hospital" OR "bunker", "instruction": "string"}
    `;
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates?.[0].content.parts[0].text || "{}";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const decision = JSON.parse(cleanJson) as { primaryNeed: "hospital" | "bunker", instruction: string };
    
    console.log(`[Navigator]: Parallel searching for BOTH Hospital & Bunker near [${data.userCoords.lat}, ${data.userCoords.lng}]`);
    const [hospitalCoords, bunkerCoords] = await Promise.all([
      fetchNearestFacility(data.userCoords.lat, data.userCoords.lng, 'hospital'),
      fetchNearestFacility(data.userCoords.lat, data.userCoords.lng, 'bunker')
    ]);
    
    let responseText = "";
    let finalDestCoords = null;
    
    if (hospitalCoords && bunkerCoords) {
      responseText = `Verified Hospital AND Bunker BOTH detected within 25km! ${decision.instruction}`;
      finalDestCoords = decision.primaryNeed === 'hospital' ? hospitalCoords : bunkerCoords;
    } else if (hospitalCoords && !bunkerCoords) {
      responseText = `Verified Hospital detected, but NO BUNKERS found within 25km radius. ${decision.instruction}`;
      finalDestCoords = hospitalCoords;
    } else if (!hospitalCoords && bunkerCoords) {
      responseText = `Verified Bunker detected, but NO HOSPITALS found within 25km radius. ${decision.instruction}`;
      finalDestCoords = bunkerCoords;
    } else {
      responseText = `CRITICAL ALERT: Neither Hospital nor Bunker found within a 25km radius! DO NOT move blindly. Seek immediate hard cover and stay out of sight.`;
      finalDestCoords = null;
    }
    return { text: responseText, destCoords: finalDestCoords, isRealData: !!finalDestCoords };
  } catch (error) {
    console.error(`[Navigator]: Routing failed.`, error);
    return { text: "SYSTEM WARNING: Satellite map link disrupted. Cannot verify any safe zones. Stay hidden, conserve battery, and await rescue.", destCoords: null, isRealData: false };
  }
}

EnterpriseAgentRegistry.registerAgent(
  { name: 'Navigator', version: '3.0.0', role: 'Tactical Routing', status: 'ACTIVE', clearanceLevel: 'TIER_2' },
  runNavigator
);