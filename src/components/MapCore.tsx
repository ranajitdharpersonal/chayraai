
'use client';

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
  useMap,
  GeoJSON,
} from 'react-leaflet';

import {
  useState,
  useEffect,
  useMemo,
} from 'react';

import { RotateCcw } from 'lucide-react';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

type LatLng = [number, number];

type FacilityKind = 'hospital' | 'bunker';

type FacilityPin = {
  id: string;
  kind: FacilityKind;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  distanceKm?: number;
};

type FacilityRoute = {
  id: string;
  kind: FacilityKind;
  coordinates: LatLng[];
  distanceMeters?: number;
  durationSeconds?: number;
  routeType: string;
};

type SpreadTarget = {
  fromIso: string;
  toIso: string;
  from: LatLng | null;
  to: LatLng | null;
};

// ============================================================
// MAP ICONS
// ============================================================

const createDynamicThreatIcon = (type: string) => {
  let baseColor = 'bg-red-500';
  let ringColor =
    'bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.9)]';

  if (type === 'earthquake') {
    baseColor = 'bg-orange-500';
    ringColor =
      'bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.9)]';
  } else if (type === 'tsunami') {
    baseColor = 'bg-cyan-400';
    ringColor =
      'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.9)]';
  }

  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-4 w-4"><span class="animate-ping absolute inline-flex h-full w-full rounded-full ${baseColor} opacity-75"></span><span class="relative inline-flex rounded-full h-4 w-4 ${ringColor}"></span></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const createVulnerableNodeIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-orange-500 border border-black shadow-[0_0_10px_rgba(249,115,22,0.9)]"></span></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

const createUserPinIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-5 w-5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-500 opacity-75"></span><span class="relative inline-flex rounded-full h-5 w-5 bg-purple-600 border-2 border-white shadow-[0_0_15px_rgba(168,85,247,0.9)]"></span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const createSafeZoneIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="relative flex h-6 w-6 items-center justify-center"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.9)]"></span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const createFacilityIcon = (kind: FacilityKind) => {
  const color =
    kind === 'hospital'
      ? '#22d3ee'
      : '#c084fc';

  const glow =
    kind === 'hospital'
      ? 'rgba(34,211,238,0.85)'
      : 'rgba(192,132,252,0.85)';

  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <div style="
        width: 25px;
        height: 25px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid white;
        box-shadow: 0 0 15px ${glow};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #09090b;
        font-size: 14px;
        font-weight: 900;
      ">
        ${kind === 'hospital' ? '+' : 'S'}
      </div>
    `,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  });
};

// ============================================================
// VALIDATION AND NORMALIZATION
// ============================================================

function isValidLatLng(
  lat: unknown,
  lng: unknown,
): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function normalizeFacility(
  value: any,
  kind: FacilityKind,
): FacilityPin | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  const nestedCoordinates =
    value.coordinates ?? value.location ?? {};

  let lat =
    value.lat ??
    value.latitude ??
    nestedCoordinates.lat ??
    nestedCoordinates.latitude;

  let lng =
    value.lng ??
    value.lon ??
    value.longitude ??
    nestedCoordinates.lng ??
    nestedCoordinates.lon ??
    nestedCoordinates.longitude;

  if (
    Array.isArray(nestedCoordinates) &&
    nestedCoordinates.length >= 2
  ) {
    lat = nestedCoordinates[0];
    lng = nestedCoordinates[1];
  }

  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  const name =
    value.name ??
    value.tags?.name ??
    value.displayName ??
    (kind === 'hospital'
      ? 'Mapped hospital / clinic'
      : 'Mapped shelter / bunker');

  return {
    id: `${kind}-${String(value.id ?? `${lat}-${lng}`)}`,
    kind,
    name: String(name),
    lat,
    lng,
    address:
      typeof value.address === 'string'
        ? value.address
        : typeof value.tags?.['addr:full'] === 'string'
          ? value.tags['addr:full']
          : undefined,
    distanceKm:
      typeof value.distanceKm === 'number' &&
      Number.isFinite(value.distanceKm)
        ? value.distanceKm
        : undefined,
  };
}

function normalizeRoute(
  value: any,
  kind: FacilityKind,
): FacilityRoute | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  const hasGeoJsonGeometry =
    !Array.isArray(value.coordinates) &&
    Array.isArray(value.geometry?.coordinates);

  const rawCoordinates = hasGeoJsonGeometry
    ? value.geometry.coordinates
    : Array.isArray(value.coordinates)
      ? value.coordinates
      : [];

  const coordinates: LatLng[] = rawCoordinates
    .map((point: any): LatLng | null => {
      if (Array.isArray(point) && point.length >= 2) {
        // Navigator returns Leaflet [lat, lng] arrays.
        // GeoJSON geometry uses [lng, lat].
        const lat = hasGeoJsonGeometry
          ? point[1]
          : point[0];

        const lng = hasGeoJsonGeometry
          ? point[0]
          : point[1];

        return isValidLatLng(lat, lng)
          ? [lat, lng]
          : null;
      }

      if (point && typeof point === 'object') {
        const lat = point.lat ?? point.latitude;
        const lng =
          point.lng ??
          point.lon ??
          point.longitude;

        return isValidLatLng(lat, lng)
          ? [lat, lng]
          : null;
      }

      return null;
    })
    .filter(
      (point: LatLng | null): point is LatLng =>
        point !== null,
    );

  if (coordinates.length < 2) {
    return null;
  }

  return {
    id: `${kind}-route`,
    kind,
    coordinates,
    distanceMeters:
      typeof value.distanceMeters === 'number' &&
      Number.isFinite(value.distanceMeters)
        ? value.distanceMeters
        : undefined,
    durationSeconds:
      typeof value.durationSeconds === 'number' &&
      Number.isFinite(value.durationSeconds)
        ? value.durationSeconds
        : undefined,
    routeType:
      typeof value.routeType === 'string'
        ? value.routeType
        : hasGeoJsonGeometry
          ? 'ROAD_ROUTE'
          : 'UNKNOWN',
  };
}

// ============================================================
// PUBLIC HEALTH MAP HELPERS
// ============================================================

function normalizeIsoCode(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim().toUpperCase();
}

function getFeatureIsoCode(
  feature: any,
): string | null {
  const props = feature?.properties ?? {};

  const candidates = [
    feature?.id,
    props.ISO_A3,
    props.ISO_A3_EH,
    props.iso_a3,
    props.ISO3,
    props.ADM0_A3,
    props.SOV_A3,
    props.WB_A3,
    props['ISO-3166-1-Alpha-3'],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIsoCode(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function collectGeometryPoints(
  geometry: any,
): LatLng[] {
  if (!geometry) {
    return [];
  }

  const points: LatLng[] = [];

  const walk = (value: any): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      if (
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
      ) {
        points.push([
          value[1],
          value[0],
        ]);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
    }
  };

  walk(geometry.coordinates);

  return points;
}

function centroidFromGeometry(
  geometry: any,
): LatLng | null {
  const points = collectGeometryPoints(geometry);

  if (!points.length) {
    return null;
  }

  const totals = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point[0],
      lng: acc.lng + point[1],
    }),
    { lat: 0, lng: 0 },
  );

  return [
    totals.lat / points.length,
    totals.lng / points.length,
  ];
}

function buildCountryCentroidMap(
  geoJson: any,
): Map<string, LatLng> {
  const map = new Map<string, LatLng>();

  const features = Array.isArray(geoJson?.features)
    ? geoJson.features
    : [];

  for (const feature of features) {
    const iso = getFeatureIsoCode(feature);

    if (!iso) {
      continue;
    }

    const centroid =
      centroidFromGeometry(feature.geometry);

    if (centroid) {
      map.set(iso, centroid);
    }
  }

  return map;
}

// ============================================================
// MAP CONTROLLER
// ============================================================

function MapController({
  isPinDropMode,
  setIsPinDropMode,
  setUserPin,
  userPin,
  destPin,
  facilityPins,
}: any) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor =
      isPinDropMode
        ? 'crosshair'
        : 'grab';
  }, [isPinDropMode, map]);

  useEffect(() => {
    if (userPin) {
      map.flyTo(
        [userPin.lat, userPin.lng],
        13,
        {
          animate: true,
          duration: 2,
        },
      );
    }
  }, [userPin, map]);

  useEffect(() => {
    if (
      Array.isArray(facilityPins) &&
      facilityPins.length > 1
    ) {
      const bounds = L.latLngBounds(
        facilityPins.map((pin: FacilityPin) => [
          pin.lat,
          pin.lng,
        ]),
      );

      if (userPin) {
        bounds.extend([
          userPin.lat,
          userPin.lng,
        ]);
      }

      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 14,
        animate: true,
      });

      return;
    }

    if (
      Array.isArray(facilityPins) &&
      facilityPins.length === 1
    ) {
      map.flyTo(
        [
          facilityPins[0].lat,
          facilityPins[0].lng,
        ],
        14,
        {
          animate: true,
          duration: 1.5,
        },
      );

      return;
    }

    if (destPin) {
      map.flyTo(
        [destPin.lat, destPin.lng],
        14,
        {
          animate: true,
          duration: 1.5,
        },
      );
    }
  }, [facilityPins, destPin, userPin, map]);

  useMapEvents({
    click(e) {
      if (!isPinDropMode) {
        return;
      }

      const coords = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };

      setUserPin(coords);
      setIsPinDropMode(false);

      window.dispatchEvent(
        new CustomEvent('PIN_DROPPED', {
          detail: coords,
        }),
      );
    },
  });

  return null;
}

// ============================================================
// MAIN MAP COMPONENT
// ============================================================

export default function MapCore() {
  const [crisisZones, setCrisisZones] =
    useState<any[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState<
      'emergency' | 'health' | 'resilience'
    >('emergency');

  const [worldGeoJson, setWorldGeoJson] =
    useState<any>(null);

  const [activeIsoCodes, setActiveIsoCodes] =
    useState<string[]>([]);

  const [vulnerableIsoCodes, setVulnerableIsoCodes] =
    useState<string[]>([]);

  const [spreadTargets, setSpreadTargets] =
    useState<SpreadTarget[]>([]);

  const [isPinDropMode, setIsPinDropMode] =
    useState(false);

  const [userPin, setUserPin] =
    useState<{
      lat: number;
      lng: number;
    } | null>(null);

  const [destPin, setDestPin] =
    useState<{
      lat: number;
      lng: number;
    } | null>(null);

  const [evacuationRoute, setEvacuationRoute] =
    useState<LatLng[] | null>(null);

  const [facilityPins, setFacilityPins] =
    useState<FacilityPin[]>([]);

  const [facilityRoutes, setFacilityRoutes] =
    useState<FacilityRoute[]>([]);

  const countryCentroids = useMemo(
    () => buildCountryCentroidMap(worldGeoJson),
    [worldGeoJson],
  );

  const resolvedSpreadLines = useMemo(() => {
    return spreadTargets
      .map((target) => {
        const from =
          target.from ??
          countryCentroids.get(target.fromIso) ??
          null;

        const to =
          target.to ??
          countryCentroids.get(target.toIso) ??
          null;

        if (!from || !to) {
          return null;
        }

        return { from, to };
      })
      .filter(
        (
          value,
        ): value is {
          from: LatLng;
          to: LatLng;
        } => value !== null,
      );
  }, [spreadTargets, countryCentroids]);

  // Load map data and saved radar snapshot.
  useEffect(() => {
    let cancelled = false;
    let lastRadarFetchAt = 0;

    fetch(
      'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(`GeoJSON HTTP ${res.status}`);
        }

        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setWorldGeoJson(data);
        }
      })
      .catch((error) => {
        console.error(
          '[Map]: GeoJSON load failed:',
          error,
        );
      });

    const fetchRadarData = async () => {
      lastRadarFetchAt = Date.now();

      try {
        const response = await fetch(
          '/api/background-radar',
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          throw new Error(
            `Radar API HTTP ${response.status}`,
          );
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (
          data.success &&
          Array.isArray(data.threats)
        ) {
          setCrisisZones(data.threats);
        }
      } catch (error) {
        console.error(
          '[Map]: Radar snapshot retrieval failed:',
          error,
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchRadarData();

    const handleVisibilityChange = () => {
      const oneHour = 60 * 60 * 1000;

      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastRadarFetchAt >= oneHour
      ) {
        void fetchRadarData();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      cancelled = true;

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, []);

  // Handle app events.
  useEffect(() => {
    const handleEnablePinDrop = () => {
      setIsPinDropMode(true);
    };

    const handleTabChange = (event: any) => {
      setActiveTab(event.detail);
    };

    const handleUpdateUserPin = (event: any) => {
      if (
        event.detail &&
        isValidLatLng(
          event.detail.lat,
          event.detail.lng,
        )
      ) {
        setUserPin(event.detail);
      }
    };

    const handleIntelUpdate = (event: any) => {
      const data = event.detail ?? {};

      // ----------------------------------------------------
      // PUBLIC HEALTH MAP DATA
      // ----------------------------------------------------

      const reports = Array.isArray(data.outbreakReports)
        ? data.outbreakReports
        : [];

      const nextActiveIsoCodes = new Set<string>();
      const nextVulnerableIsoCodes = new Set<string>();
      const nextSpreadTargets: SpreadTarget[] = [];

      reports.forEach((report: any) => {
        const activeZone = report?.activeZone;

        const activeIso =
          normalizeIsoCode(activeZone?.isoCode);

        if (!activeIso) {
          return;
        }

        nextActiveIsoCodes.add(activeIso);

        const vulnerableZones =
          Array.isArray(report?.vulnerableZones)
            ? report.vulnerableZones
            : [];

        vulnerableZones.forEach((zone: any) => {
          const vulnerableIso =
            normalizeIsoCode(zone?.isoCode);

          if (!vulnerableIso) {
            return;
          }

          nextVulnerableIsoCodes.add(vulnerableIso);

          const fromCoords =
            isValidLatLng(
              activeZone?.lat,
              activeZone?.lng,
            )
              ? [
                  activeZone.lat,
                  activeZone.lng,
                ] as LatLng
              : null;

          const toCoords =
            isValidLatLng(
              zone?.lat,
              zone?.lng,
            )
              ? [
                  zone.lat,
                  zone.lng,
                ] as LatLng
              : null;

          nextSpreadTargets.push({
            fromIso: activeIso,
            toIso: vulnerableIso,
            from: fromCoords,
            to: toCoords,
          });
        });
      });

      setActiveIsoCodes(
        Array.from(nextActiveIsoCodes),
      );

      setVulnerableIsoCodes(
        Array.from(nextVulnerableIsoCodes),
      );

      setSpreadTargets(nextSpreadTargets);

      // ----------------------------------------------------
      // MULTI-FACILITY NAVIGATION
      // ----------------------------------------------------

      const rawFacilities =
        data.facilities ??
        data.navigation?.facilities ??
        {};

      const facilityData =
        rawFacilities && typeof rawFacilities === 'object'
          ? rawFacilities
          : {};

      const nextFacilityPins = [
        normalizeFacility(
          facilityData.hospital ??
          data.hospital ??
          data.navigation?.hospital,
          'hospital',
        ),
        normalizeFacility(
          facilityData.bunker ??
          data.bunker ??
          data.navigation?.bunker,
          'bunker',
        ),
      ].filter(
        (pin): pin is FacilityPin =>
          pin !== null,
      );

      setFacilityPins(nextFacilityPins);

      // ----------------------------------------------------
      // ROAD ROUTES
      // ----------------------------------------------------

      const rawRoutes =
        data.routes ??
        data.navigation?.routes ??
        {};

      const routeData =
        rawRoutes && typeof rawRoutes === 'object'
          ? rawRoutes
          : {};

      const nextFacilityRoutes = [
        normalizeRoute(
          routeData.hospital,
          'hospital',
        ),
        normalizeRoute(
          routeData.bunker,
          'bunker',
        ),
      ].filter(
        (route): route is FacilityRoute =>
          route !== null,
      );

      setFacilityRoutes(nextFacilityRoutes);

      // ----------------------------------------------------
      // PRIMARY DESTINATION / LEGACY COMPATIBILITY
      // ----------------------------------------------------

      const rawDestination =
        data.destCoords ??
        data.navigation?.destCoords ??
        null;

      const validPrimaryDestination =
        rawDestination &&
        isValidLatLng(
          rawDestination.lat,
          rawDestination.lng,
        )
          ? {
              lat: rawDestination.lat,
              lng: rawDestination.lng,
            }
          : null;

      const firstFacility = nextFacilityPins[0] ?? null;

      const nextDestination =
        validPrimaryDestination ??
        (firstFacility
          ? {
              lat: firstFacility.lat,
              lng: firstFacility.lng,
            }
          : null);

      setDestPin(nextDestination);

      // If the route service did not return a route,
      // retain a clearly marked straight-line fallback.
      if (
        nextFacilityRoutes.length === 0 &&
        userPin &&
        nextDestination
      ) {
        setEvacuationRoute([
          [userPin.lat, userPin.lng],
          [
            nextDestination.lat,
            nextDestination.lng,
          ],
        ]);
      } else {
        setEvacuationRoute(null);
      }
    };

    window.addEventListener(
      'ENABLE_PIN_DROP',
      handleEnablePinDrop,
    );

    window.addEventListener(
      'SWARM_INTEL_UPDATE',
      handleIntelUpdate,
    );

    window.addEventListener(
      'UPDATE_USER_PIN',
      handleUpdateUserPin,
    );

    window.addEventListener(
      'TAB_CHANGED',
      handleTabChange,
    );

    return () => {
      window.removeEventListener(
        'ENABLE_PIN_DROP',
        handleEnablePinDrop,
      );

      window.removeEventListener(
        'SWARM_INTEL_UPDATE',
        handleIntelUpdate,
      );

      window.removeEventListener(
        'UPDATE_USER_PIN',
        handleUpdateUserPin,
      );

      window.removeEventListener(
        'TAB_CHANGED',
        handleTabChange,
      );
    };
  }, [userPin]);

  // System reset.
  const resetMap = () => {
    setUserPin(null);
    setDestPin(null);
    setEvacuationRoute(null);
    setFacilityPins([]);
    setFacilityRoutes([]);
    setIsPinDropMode(false);

    setActiveIsoCodes([]);
    setVulnerableIsoCodes([]);
    setSpreadTargets([]);
  };

  useEffect(() => {
    window.addEventListener(
      'SYSTEM_RESET',
      resetMap,
    );

    return () => {
      window.removeEventListener(
        'SYSTEM_RESET',
        resetMap,
      );
    };
  }, []);

  const triggerResetFromMap = () => {
    window.dispatchEvent(
      new CustomEvent('SYSTEM_RESET'),
    );
  };

  return (
    <div className="h-full w-full relative">
      {isLoading && (
        <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-md flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>

            <p className="text-red-500 font-mono text-xs tracking-widest animate-pulse">
              RADAR SCANNING LIVE THREATS...
            </p>
          </div>
        </div>
      )}

      {(
        userPin ||
        isPinDropMode ||
        destPin ||
        facilityPins.length > 0
      ) && (
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
        maxBounds={L.latLngBounds(
          L.latLng(-90, -100000),
          L.latLng(90, 100000),
        )}
        maxBoundsViscosity={1.0}
        worldCopyJump={true}
        style={{
          height: '100%',
          width: '100%',
          background: '#000',
        }}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(process.env.NEXT_PUBLIC_CARTO_API_KEY ?? '')}`}
          noWrap={false}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
        />

        <MapController
          isPinDropMode={isPinDropMode}
          setIsPinDropMode={setIsPinDropMode}
          setUserPin={setUserPin}
          userPin={userPin}
          destPin={destPin}
          facilityPins={facilityPins}
        />

        {/* PUBLIC HEALTH COUNTRY OVERLAY */}
        {activeTab === 'health' && worldGeoJson && (
          <GeoJSON
            data={worldGeoJson}
            style={(feature: any) => {
              const iso = getFeatureIsoCode(feature);

              const isActive = Boolean(
                iso && activeIsoCodes.includes(iso),
              );

              const isVulnerable = Boolean(
                iso && vulnerableIsoCodes.includes(iso),
              );

              if (isActive) {
                return {
                  fillColor: '#ef4444',
                  weight: 2,
                  color: '#b91c1c',
                  fillOpacity: 0.5,
                  className: 'animate-pulse',
                };
              }

              if (isVulnerable) {
                return {
                  fillColor: '#f59e0b',
                  weight: 2,
                  color: '#d97706',
                  fillOpacity: 0.4,
                };
              }

              return {
                fillColor: 'transparent',
                weight: 0,
                color: 'transparent',
                fillOpacity: 0,
              };
            }}
          />
        )}

        {/* PUBLIC HEALTH SPREAD PATHS */}
        {activeTab === 'health' &&
          resolvedSpreadLines.map((line, idx) => (
            <div key={`spread-${idx}`}>
              <Polyline
                positions={[line.from, line.to]}
                color="#f97316"
                weight={2}
                dashArray="5, 8"
              />

              <Marker
                position={line.to}
                icon={createVulnerableNodeIcon()}
              >
                <Popup className="bg-black/80 font-mono text-xs text-white border border-orange-500/50">
                  <b className="text-orange-500 uppercase tracking-wider">
                    Predicted Spread Zone
                  </b>
                </Popup>
              </Marker>
            </div>
          ))}

        {/* EMERGENCY / RESILIENCE RADAR */}
        {(activeTab === 'emergency' ||
          activeTab === 'resilience') &&
          crisisZones.map((zone) => (
            <Marker
              key={zone.id}
              position={[zone.lat, zone.lng]}
              icon={createDynamicThreatIcon(zone.type)}
            >
              <Popup className="bg-black/80 font-mono text-xs backdrop-blur-md text-white border border-red-500/50">
                <div className="p-1">
                  <b className="text-red-500 uppercase tracking-wider">
                    {zone.name}
                  </b>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* USER LOCATION */}
        {userPin && (
          <Marker
            position={[
              userPin.lat,
              userPin.lng,
            ]}
            icon={createUserPinIcon()}
          >
            <Popup>
              <b>Your selected location</b>
            </Popup>
          </Marker>
        )}

        {/* HOSPITAL / CLINIC AND SHELTER / BUNKER PINS */}
        {facilityPins.map((facility) => {
          const matchingRoute =
            facilityRoutes.find(
              (route) => route.kind === facility.kind,
            );

          return (
            <Marker
              key={facility.id}
              position={[
                facility.lat,
                facility.lng,
              ]}
              icon={createFacilityIcon(facility.kind)}
            >
              <Popup className="bg-black/90 font-mono text-xs text-white">
                <div className="min-w-[180px] p-1">
                  <b
                    className={
                      facility.kind === 'hospital'
                        ? 'text-cyan-400 uppercase tracking-wider'
                        : 'text-purple-400 uppercase tracking-wider'
                    }
                  >
                    {facility.kind === 'hospital'
                      ? 'OSM-MAPPED HOSPITAL / CLINIC'
                      : 'OSM-MAPPED SHELTER / BUNKER'}
                  </b>

                  <p className="mt-2 text-white font-bold">
                    {facility.name}
                  </p>

                  {facility.address && (
                    <p className="mt-1 text-gray-300">
                      {facility.address}
                    </p>
                  )}

                  {facility.distanceKm !== undefined && (
                    <p className="mt-1 text-gray-300">
                      Approx. {facility.distanceKm.toFixed(1)} km from your location
                    </p>
                  )}

                  {matchingRoute?.distanceMeters !== undefined && (
                    <p className="mt-1 text-gray-300">
                      Route distance: {(matchingRoute.distanceMeters / 1000).toFixed(1)} km
                    </p>
                  )}

                  {matchingRoute?.durationSeconds !== undefined && (
                    <p className="mt-1 text-gray-300">
                      Estimated travel time: {Math.max(
                        1,
                        Math.round(matchingRoute.durationSeconds / 60),
                      )} min
                    </p>
                  )}

                  <p className="mt-2 text-amber-400 text-[10px] leading-relaxed">
                    Map listing only. Operational status, opening hours and safety are not independently verified.
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ROAD ROUTES OR STRAIGHT-LINE ESTIMATES */}
        {facilityRoutes.map((route) => {
          const isEstimate =
            route.routeType === 'STRAIGHT_LINE_ESTIMATE' ||
            route.routeType.toUpperCase().includes('ESTIMATE');

          const routeColor =
            route.kind === 'hospital'
              ? '#22d3ee'
              : '#c084fc';

          return (
            <Polyline
              key={route.id}
              positions={route.coordinates}
              color={routeColor}
              weight={4}
              opacity={0.9}
              dashArray={
                isEstimate
                  ? '8, 8'
                  : undefined
              }
            />
          );
        })}

        {/* LEGACY DESTINATION FALLBACK */}
        {destPin && facilityPins.length === 0 && (
          <Marker
            position={[
              destPin.lat,
              destPin.lng,
            ]}
            icon={createSafeZoneIcon()}
          >
            <Popup className="bg-black/90 font-mono text-xs text-white border border-blue-500/50">
              <b className="text-blue-400">
                NAVIGATOR-SELECTED DESTINATION
              </b>

              <p className="mt-2 text-amber-400">
                Not independently verified as safe or operational.
              </p>
            </Popup>
          </Marker>
        )}

        {/* LEGACY VISUAL FALLBACK */}
        {evacuationRoute &&
          facilityRoutes.length === 0 && (
            <Polyline
              positions={evacuationRoute}
              color="#facc15"
              weight={3}
              dashArray="8, 8"
            />
          )}
      </MapContainer>
    </div>
  );
}
