import { EnterpriseAgentRegistry } from '../adk/registry';

// 1. The Real Trust Engine (NASA + USGS + War Zones)
export async function scanGlobalThreats(): Promise<any[]> {
  console.log(`[Radar]: Fetching Hybrid Global Intel (NASA EONET + USGS + War Zones)...`);
  let allThreats: any[] = [
    { id: 'war-ukraine', lat: 48.3794, lng: 31.1656, name: 'ACTIVE CONFLICT: UKRAINE', type: 'war' },
    { id: 'war-gaza', lat: 31.4167, lng: 34.3333, name: 'CRITICAL WAR ZONE: GAZA STRIP', type: 'war' },
    { id: 'war-sudan', lat: 12.8628, lng: 30.2176, name: 'ACTIVE CIVIL WAR: SUDAN', type: 'war' }
  ];
  
  try {
    const usgsResponse = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
    if (usgsResponse.ok) {
      const usgsData = await usgsResponse.json();
      const quakes = usgsData.features.slice(0, 3).map((quake: any, i: number) => ({
        id: quake.id || `seismic-${i}`,
        lat: quake.geometry.coordinates[1],
        lng: quake.geometry.coordinates[0],
        name: `SEISMIC ALERT: ${quake.properties.place}`,
        type: 'earthquake'
      }));
      allThreats = [...allThreats, ...quakes];
    }
    
    const nasaResponse = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5');
    if (nasaResponse.ok) {
      const nasaData = await nasaResponse.json();
      const nasaEvents = nasaData.events.map((event: any) => {
        const geom = event.geometry[0];
        return {
          id: `nasa-${event.id}`,
          lat: geom.type === "Point" ? geom.coordinates[1] : 0,
          lng: geom.type === "Point" ? geom.coordinates[0] : 0,
          name: `NASA ALERT: ${event.title}`,
          type: event.categories[0]?.title.toLowerCase().includes('fire') ? 'fire' : 'storm'
        };
      });
      allThreats = [...allThreats, ...nasaEvents.filter((e: any) => e.lat !== 0)];
    }
    return allThreats;
  } catch (error) {
    console.error("[Radar]: Live API Fetch Error:", error);
    return allThreats; 
  }
}

// 2. Foreground Swarm Integration (FIXED!)
async function runRadar(data: { input: string }) {
  console.log(`[Radar]: Executing foreground Swarm scan...`);
  const threats = await scanGlobalThreats();
  
  if (threats.length === 0) return "No immediate global threats detected in the perimeter.";
  
  // Format the real intel for the UI
  const topThreats = threats.slice(0, 3).map(t => t.name).join(' | ');
  return `ACTIVE INTEL DETECTED: ${topThreats}. Monitoring ${threats.length} total anomalies.`;
}

// 3. Register Agent
EnterpriseAgentRegistry.registerAgent(
  { name: 'Radar', version: '3.0.0', role: 'Threat Intelligence', status: 'ACTIVE', clearanceLevel: 'TIER_1' },
  runRadar
);