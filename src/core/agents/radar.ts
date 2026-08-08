import { ai, AgentRegistry } from '../adk/registry';
import { z } from 'genkit';

// ... (keep the radarFlow EXACTLY the same as before) ...
export const radarFlow = ai.defineFlow(
  {
    name: 'Radar_ThreatIntel',
    inputSchema: z.object({ input: z.string(), context: z.any().optional() }),
    outputSchema: z.string(),
  },
  async (payload) => {
    /* ... same logic ... */
    return "Tactical threat intel active.";
  }
);

// 🚀 THE REAL TRUST ENGINE (NASA + USGS + Conflict Zones)
export async function scanGlobalThreats(): Promise<any[]> {
  console.log(`[Radar]: Fetching Hybrid Global Intel (NASA EONET + USGS + War Zones)...`);
  
  let allThreats: any[] = [
    { id: 'war-ukraine', lat: 48.3794, lng: 31.1656, name: 'ACTIVE CONFLICT: UKRAINE', type: 'war' },
    { id: 'war-gaza', lat: 31.4167, lng: 34.3333, name: 'CRITICAL WAR ZONE: GAZA STRIP', type: 'war' },
    { id: 'war-sudan', lat: 12.8628, lng: 30.2176, name: 'ACTIVE CIVIL WAR: SUDAN', type: 'war' }
    // ... add your other persistent conflict zones here
  ];

  try {
    // 1. USGS EARTHQUAKE API
    const usgsResponse = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
    if (usgsResponse.ok) {
      const usgsData = await usgsResponse.json();
      const quakes = usgsData.features.slice(0, 5).map((quake: any, i: number) => ({
        id: quake.id || `seismic-${i}`,
        lat: quake.geometry.coordinates[1],
        lng: quake.geometry.coordinates[0],
        name: `SEISMIC ALERT: ${quake.properties.place}`,
        type: 'earthquake'
      }));
      allThreats = [...allThreats, ...quakes];
    }

    // 2. NASA EONET API (Wildfires, Storms, Volcanoes)
    const nasaResponse = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10');
    if (nasaResponse.ok) {
      const nasaData = await nasaResponse.json();
      const nasaEvents = nasaData.events.map((event: any, i: number) => {
        // Extracting geometry safely
        const geom = event.geometry[0];
        let lat = 0, lng = 0;
        if (geom.type === "Point") {
            lng = geom.coordinates[0];
            lat = geom.coordinates[1];
        }
        return {
          id: `nasa-${event.id}`,
          lat: lat,
          lng: lng,
          name: `NASA ALERT: ${event.title}`,
          type: event.categories[0]?.title.toLowerCase().includes('fire') ? 'fire' : 'storm'
        };
      });
      // Filter out empty coordinates
      allThreats = [...allThreats, ...nasaEvents.filter((e: any) => e.lat !== 0)];
    }

    return allThreats;
  } catch (error) {
    console.error("[Radar]: Live API Fetch Error:", error);
    return allThreats; // Return at least the persistent war zones
  }
}

AgentRegistry.registerAgent('Radar', radarFlow);