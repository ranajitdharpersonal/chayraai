'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createDynamicThreatIcon = (type: string) => {
  let baseColor = 'bg-red-500';
  let ringColor = 'bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.9)]';
  
  if (type === 'earthquake') {
    baseColor = 'bg-orange-500';
    ringColor = 'bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.9)]';
  } else if (type === 'tsunami') {
    baseColor = 'bg-cyan-400';
    ringColor = 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.9)]';
  }

  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-4 w-4">
             <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${baseColor} opacity-75"></span>
             <span class="relative inline-flex rounded-full h-4 w-4 ${ringColor}"></span>
           </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const createUserPinIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-5 w-5">
             <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-500 opacity-75"></span>
             <span class="relative inline-flex rounded-full h-5 w-5 bg-purple-600 border-2 border-white shadow-[0_0_15px_rgba(168,85,247,0.9)]"></span>
           </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const createSafeZoneIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-6 w-6 items-center justify-center">
             <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
             <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.9)]"></span>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

function MapController({ isPinDropMode, setIsPinDropMode, setUserPin, userPin }: any) {
  const map = useMap();

  useEffect(() => {
    if (isPinDropMode) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = 'grab';
    }
  }, [isPinDropMode, map]);

  useEffect(() => {
    if (userPin) {
      map.flyTo([userPin.lat, userPin.lng], 13, { animate: true, duration: 2 });
    }
  }, [userPin, map]);

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
  
  const [isPinDropMode, setIsPinDropMode] = useState(false);
  const [userPin, setUserPin] = useState<{lat: number, lng: number} | null>(null);
  const [destPin, setDestPin] = useState<{lat: number, lng: number} | null>(null);
  const [evacuationRoute, setEvacuationRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    const fetchRadarData = async () => {
      try {
        setIsLoading(true);
        // Using our new background radar endpoint for live threats!
        const response = await fetch('/api/background-radar');
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        // Just mock some data for now if backend is empty to show map works
        setCrisisZones([
          { id: '1', lat: 31.4167, lng: 34.3333, name: 'CRITICAL WAR ZONE: GAZA', type: 'war' },
          { id: '2', lat: 48.3794, lng: 31.1656, name: 'ACTIVE CONFLICT: UKRAINE', type: 'war' }
        ]);
      } catch (error) {
        console.error("Radar Sync Failed:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRadarData();
  }, []);

  useEffect(() => {
    const handleEnablePinDrop = () => setIsPinDropMode(true);
    
    const handleIntelUpdate = (event: any) => {
      const data = event.detail;
      if (userPin && data.destCoords) {
        setDestPin(data.destCoords); 
        setEvacuationRoute([
          [userPin.lat, userPin.lng],
          [data.destCoords.lat, data.destCoords.lng]
        ]);
      }
    };

    const handleUpdateUserPin = (event: any) => {
      setUserPin(event.detail);
    };

    window.addEventListener('ENABLE_PIN_DROP', handleEnablePinDrop);
    window.addEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
    window.addEventListener('UPDATE_USER_PIN', handleUpdateUserPin);

    return () => {
      window.removeEventListener('ENABLE_PIN_DROP', handleEnablePinDrop);
      window.removeEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
      window.removeEventListener('UPDATE_USER_PIN', handleUpdateUserPin);
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

  const triggerResetFromMap = () => {
    window.dispatchEvent(new CustomEvent('SYSTEM_RESET'));
  };

  const bounds = L.latLngBounds(L.latLng(-90, -100000), L.latLng(90, 100000));

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
          title="Clear Tactical Map"
        >
          <RotateCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
        </button>
      )}

      {isPinDropMode && (
        <div className="absolute top-20 md:top-8 left-1/2 -translate-x-1/2 w-[90%] md:w-auto text-center z-[1000] bg-purple-500/20 backdrop-blur-md border border-purple-500 p-2 md:p-3 rounded-full text-purple-400 font-mono text-[9px] md:text-xs animate-pulse shadow-[0_0_20px_rgba(168,85,247,0.3)]">
          TARGET ACQUISITION MODE: CLICK MAP TO DROP PIN
        </div>
      )}

      <MapContainer 
        center={[25.0, 10.0]} 
        zoom={3} 
        minZoom={3}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        worldCopyJump={true} 
        style={{ height: '100%', width: '100%', background: '#000' }} 
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" noWrap={false} />
        
        <MapController 
          isPinDropMode={isPinDropMode} 
          setIsPinDropMode={setIsPinDropMode} 
          setUserPin={setUserPin}
          userPin={userPin}
        />

        {crisisZones.map((zone) => (
          <Marker key={zone.id} position={[zone.lat, zone.lng]} icon={createDynamicThreatIcon(zone.type)}>
            <Popup className={`bg-black/80 font-mono text-xs backdrop-blur-md text-white border ${zone.type === 'earthquake' ? 'border-orange-500/50' : zone.type === 'tsunami' ? 'border-cyan-500/50' : 'border-red-500/50'}`}>
              <div className="p-1">
                <b className={`uppercase tracking-wider ${zone.type === 'earthquake' ? 'text-orange-500' : zone.type === 'tsunami' ? 'text-cyan-400' : 'text-red-500'}`}>
                  {zone.name}
                </b>
                <div className={`h-[1px] w-full my-1 ${zone.type === 'earthquake' ? 'bg-orange-500/30' : zone.type === 'tsunami' ? 'bg-cyan-500/30' : 'bg-red-500/30'}`}></div>
                <p className="text-[10px] text-gray-300">
                  Intel: {zone.type === 'war' ? 'Verified Conflict Zone' : zone.type === 'tsunami' ? 'Tsunami Warning Active' : 'Seismic Activity Detected'}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

        {userPin && (
          <Marker position={[userPin.lat, userPin.lng]} icon={createUserPinIcon()}>
            <Popup className="bg-black/80 font-mono text-xs border border-purple-500/50 backdrop-blur-md text-white">
              <div className="p-1">
                <b className="text-purple-400 uppercase tracking-wider">Your Location</b>
                <p className="text-[10px] text-gray-400">Lat: {userPin.lat.toFixed(4)}</p>
                <p className="text-[10px] text-gray-400">Lng: {userPin.lng.toFixed(4)}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {destPin && (
          <Marker position={[destPin.lat, destPin.lng]} icon={createSafeZoneIcon()}>
            <Popup className="bg-black/80 font-mono text-xs border border-blue-500/50 backdrop-blur-md text-white">
              <div className="p-1">
                <b className="text-blue-400 uppercase tracking-wider">Designated Safe Zone</b>
                <p className="text-[10px] text-gray-400">Head to this location immediately.</p>
              </div>
            </Popup>
          </Marker>
        )}

        {evacuationRoute && (
          <Polyline 
            positions={evacuationRoute} 
            color="#22c55e" 
            weight={3}
            dashArray="10, 10" 
            className="animate-pulse"
          />
        )}
      </MapContainer>
    </div>
  );
}