'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap, GeoJSON } from 'react-leaflet';
import { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createDynamicThreatIcon = (type: string) => {
  let baseColor = 'bg-red-500', ringColor = 'bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.9)]';
  if (type === 'earthquake') { baseColor = 'bg-orange-500'; ringColor = 'bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.9)]'; } 
  else if (type === 'tsunami') { baseColor = 'bg-cyan-400'; ringColor = 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.9)]'; }
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-4 w-4"><span class="animate-ping absolute inline-flex h-full w-full rounded-full ${baseColor} opacity-75"></span><span class="relative inline-flex rounded-full h-4 w-4 ${ringColor}"></span></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
};

const createVulnerableNodeIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-orange-500 border border-black shadow-[0_0_10px_rgba(249,115,22,0.9)]"></span></div>`,
    iconSize: [12, 12], iconAnchor: [6, 6],
  });
};

const createUserPinIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-5 w-5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-500 opacity-75"></span><span class="relative inline-flex rounded-full h-5 w-5 bg-purple-600 border-2 border-white shadow-[0_0_15px_rgba(168,85,247,0.9)]"></span></div>`,
    iconSize: [20, 20], iconAnchor: [10, 10],
  });
};

const createSafeZoneIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-6 w-6 items-center justify-center"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.9)]"></span></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
};

function MapController({ isPinDropMode, setIsPinDropMode, setUserPin, userPin }: any) {
  const map = useMap();
  useEffect(() => { map.getContainer().style.cursor = isPinDropMode ? 'crosshair' : 'grab'; }, [isPinDropMode, map]);
  useEffect(() => { if (userPin) map.flyTo([userPin.lat, userPin.lng], 13, { animate: true, duration: 2 }); }, [userPin, map]);
  useMapEvents({
    click(e) {
      if (!isPinDropMode) return;
      const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
      setUserPin(coords);
      setIsPinDropMode(false);
      window.dispatchEvent(new CustomEvent('PIN_DROPPED', { detail: coords }));
    }
  });
  return null;
}

export default function MapCore() {
  const [crisisZones, setCrisisZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'emergency' | 'health' | 'resilience'>('emergency');
  
  // 🛑 REAL-TIME AI BOUNDARIES & PREDICTIVE SPREAD PATHS
  const [worldGeoJson, setWorldGeoJson] = useState<any>(null);
  const [activeIsoCodes, setActiveIsoCodes] = useState<string[]>([]);
  const [vulnerableIsoCodes, setVulnerableIsoCodes] = useState<string[]>([]);
  const [spreadLines, setSpreadLines] = useState<{from: [number, number], to: [number, number]}[]>([]);

  const [isPinDropMode, setIsPinDropMode] = useState(false);
  const [userPin, setUserPin] = useState<{lat: number, lng: number} | null>(null);
  const [destPin, setDestPin] = useState<{lat: number, lng: number} | null>(null);
  const [evacuationRoute, setEvacuationRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    // 1. Fetching real world GeoJSON polygons
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => setWorldGeoJson(data))
      .catch(err => console.error("GeoJSON load failed:", err));

    // 🛑 THE WOW FACTOR FIX: Dynamic Autonomous Radar Polling
    const fetchRadarData = async () => {
      try {
        // Only show loading screen if it's the very first load
        setCrisisZones(prev => {
           if (prev.length === 0) setIsLoading(true);
           return prev;
        });

        const response = await fetch('/api/background-radar');
        if (response.ok) {
           const data = await response.json();
           if (data.success && data.threats) {
              // 🛑 Automatically injecting live data into the map!
              setCrisisZones(data.threats);
           }
        }
      } catch (error) {
        console.error("Radar Sync Failed:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Initial fetch
    fetchRadarData();

    // 🛑 Background Polling Loop (Every 15 Seconds)
    // Map will silently update without any user interaction!
    const radarInterval = setInterval(fetchRadarData, 15000);

    return () => clearInterval(radarInterval);
  }, []);

  useEffect(() => {
    const handleTabChange = (event: any) => setActiveTab(event.detail);

    const handleIntelUpdate = (event: any) => {
      const data = event.detail;
      
      // 🛑 REAL DATA SYNC: Extracting Active Zones, Vulnerable Zones, and Spread Paths!
      if (data.outbreakReports && data.outbreakReports.length > 0) {
          let actives: string[] = [];
          let vulnerables: string[] = [];
          let lines: any[] = [];
          
          data.outbreakReports.forEach((report: any) => {
             if (report.activeZone) {
                actives.push(report.activeZone.isoCode);
                if (report.vulnerableZones) {
                   report.vulnerableZones.forEach((vuln: any) => {
                      vulnerables.push(vuln.isoCode);
                      lines.push({ 
                        from: [report.activeZone.lat, report.activeZone.lng], 
                        to: [vuln.lat, vuln.lng] 
                      });
                   });
                }
             }
          });
          setActiveIsoCodes(actives);
          setVulnerableIsoCodes(vulnerables);
          setSpreadLines(lines);
      }

      if (userPin && data.destCoords) {
        setDestPin(data.destCoords); 
        setEvacuationRoute([[userPin.lat, userPin.lng], [data.destCoords.lat, data.destCoords.lng]]);
      }
    };

    window.addEventListener('ENABLE_PIN_DROP', () => setIsPinDropMode(true));
    window.addEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
    window.addEventListener('UPDATE_USER_PIN', (event: any) => setUserPin(event.detail));
    window.addEventListener('TAB_CHANGED', handleTabChange);

    return () => {
      window.removeEventListener('ENABLE_PIN_DROP', () => setIsPinDropMode(true));
      window.removeEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
      window.removeEventListener('UPDATE_USER_PIN', (event: any) => setUserPin(event.detail));
      window.removeEventListener('TAB_CHANGED', handleTabChange);
    };
  }, [userPin]);

  const resetMap = () => {
    setUserPin(null);
    setDestPin(null);
    setEvacuationRoute(null);
    setIsPinDropMode(false);
  };

  useEffect(() => {
    window.addEventListener('SYSTEM_RESET', resetMap);
    return () => window.removeEventListener('SYSTEM_RESET', resetMap);
  }, []);

  const triggerResetFromMap = () => window.dispatchEvent(new CustomEvent('SYSTEM_RESET'));

  return (
    <div className="h-full w-full relative">
      {isLoading && (
        <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-md flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-red-500 font-mono text-xs tracking-widest animate-pulse">RADAR SCANNING LIVE THREATS...</p>
          </div>
        </div>
      )}

      {(userPin || isPinDropMode || destPin) && (
        <button 
          onClick={triggerResetFromMap}
          className="absolute top-20 left-3 md:top-32 md:left-6 z-[1000] bg-black/80 backdrop-blur-md border border-gray-600 p-2 md:p-3 rounded-full text-white hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition-all shadow-lg group"
        >
          <RotateCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
        </button>
      )}

      <MapContainer 
        center={[25.0, 10.0]} 
        zoom={3} 
        minZoom={3}
        maxBounds={L.latLngBounds(L.latLng(-90, -100000), L.latLng(90, 100000))}
        maxBoundsViscosity={1.0}
        worldCopyJump={true} 
        style={{ height: '100%', width: '100%', background: '#000' }} 
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" noWrap={false} />
        <MapController isPinDropMode={isPinDropMode} setIsPinDropMode={setIsPinDropMode} setUserPin={setUserPin} userPin={userPin} />

        {/* 🛑 DYNAMIC GEOJSON LAYER: Highlight Outbreak Zones vs Vulnerable Zones */}
        {activeTab === 'health' && worldGeoJson && (
          <GeoJSON 
            data={worldGeoJson} 
            style={(feature: any) => {
              const isActive = activeIsoCodes.includes(feature?.id);
              const isVulnerable = vulnerableIsoCodes.includes(feature?.id);
              
              if (isActive) return { fillColor: '#ef4444', weight: 2, color: '#b91c1c', fillOpacity: 0.5, className: 'animate-pulse' }; // Red for active outbreak
              if (isVulnerable) return { fillColor: '#f59e0b', weight: 2, color: '#d97706', fillOpacity: 0.4 }; // Orange for vulnerable prediction
              return { fillColor: 'transparent', weight: 0, color: 'transparent', fillOpacity: 0 };
            }}
          />
        )}

        {/* 🛑 ARROWS / SPREAD PATHS (Animated Dashed Lines) */}
        {activeTab === 'health' && spreadLines.map((line, idx) => (
          <div key={`spread-${idx}`}>
            <Polyline positions={[line.from, line.to]} color="#f97316" weight={2} dashArray="5, 8" className="animate-pulse" />
            <Marker position={line.to} icon={createVulnerableNodeIcon()}>
              <Popup className="bg-black/80 font-mono text-xs text-white border border-orange-500/50"><b className="text-orange-500 uppercase tracking-wider">Predicted Spread Zone</b></Popup>
            </Marker>
          </div>
        ))}

        {/* DYNAMIC LAYER RENDER: Tactical Zones */}
        {(activeTab === 'emergency' || activeTab === 'resilience') && crisisZones.map((zone) => (
          <Marker key={zone.id} position={[zone.lat, zone.lng]} icon={createDynamicThreatIcon(zone.type)}>
            <Popup className="bg-black/80 font-mono text-xs backdrop-blur-md text-white border border-red-500/50">
              <div className="p-1"><b className="text-red-500 uppercase tracking-wider">{zone.name}</b></div>
            </Popup>
          </Marker>
        ))}

        {userPin && <Marker position={[userPin.lat, userPin.lng]} icon={createUserPinIcon()} />}
        {destPin && <Marker position={[destPin.lat, destPin.lng]} icon={createSafeZoneIcon()} />}
        {evacuationRoute && <Polyline positions={evacuationRoute} color="#22c55e" weight={3} dashArray="10, 10" className="animate-pulse" />}
      </MapContainer>
    </div>
  );
}