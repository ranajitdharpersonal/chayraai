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

const createDynamicThreatIcon = (
  type: string,
) => {
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

type LatLng = [number, number];

type SpreadTarget = {
  fromIso: string;
  toIso: string;
  from: LatLng | null;
  to: LatLng | null;
};

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
  const props =
    feature?.properties ?? {};

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
    const normalized =
      normalizeIsoCode(candidate);

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

  const walk = (
    value: any,
  ): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      // GeoJSON coordinates are [lng, lat].
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
  const points =
    collectGeometryPoints(
      geometry,
    );

  if (!points.length) {
    return null;
  }

  const totals =
    points.reduce(
      (acc, point) => ({
        lat:
          acc.lat + point[0],
        lng:
          acc.lng + point[1],
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
  const map =
    new Map<string, LatLng>();

  const features =
    Array.isArray(
      geoJson?.features,
    )
      ? geoJson.features
      : [];

  for (const feature of features) {
    const iso =
      getFeatureIsoCode(
        feature,
      );

    if (!iso) {
      continue;
    }

    const centroid =
      centroidFromGeometry(
        feature.geometry,
      );

    if (centroid) {
      map.set(
        iso,
        centroid,
      );
    }
  }

  return map;
}

function MapController({
  isPinDropMode,
  setIsPinDropMode,
  setUserPin,
  userPin,
  destPin,
}: any) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor =
      isPinDropMode
        ? 'crosshair'
        : 'grab';
  }, [
    isPinDropMode,
    map,
  ]);

  useEffect(() => {
    if (userPin) {
      map.flyTo(
        [
          userPin.lat,
          userPin.lng,
        ],
        13,
        {
          animate: true,
          duration: 2,
        },
      );
    }
  }, [
    userPin,
    map,
  ]);

  useEffect(() => {
    if (destPin) {
      map.flyTo(
        [
          destPin.lat,
          destPin.lng,
        ],
        14,
        {
          animate: true,
          duration: 1.5,
        },
      );
    }
  }, [
    destPin,
    map,
  ]);

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
        new CustomEvent(
          'PIN_DROPPED',
          {
            detail: coords,
          },
        ),
      );
    },
  });

  return null;
}

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
    useState<
      [number, number][] | null
    >(null);

  const countryCentroids =
    useMemo(
      () =>
        buildCountryCentroidMap(
          worldGeoJson,
        ),
      [worldGeoJson],
    );

  const resolvedSpreadLines =
    useMemo(() => {
      return spreadTargets
        .map((target) => {
          const from =
            target.from ??
            countryCentroids.get(
              target.fromIso,
            ) ??
            null;

          const to =
            target.to ??
            countryCentroids.get(
              target.toIso,
            ) ??
            null;

          if (
            !from ||
            !to
          ) {
            return null;
          }

          return {
            from,
            to,
          };
        })
        .filter(
          (
            value,
          ): value is {
            from: LatLng;
            to: LatLng;
          } => value !== null,
        );
    }, [
      spreadTargets,
      countryCentroids,
    ]);

  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
    )
      .then((res) =>
        res.json(),
      )
      .then((data) =>
        setWorldGeoJson(data),
      )
      .catch((err) =>
        console.error(
          'GeoJSON load failed:',
          err,
        ),
      );

    const fetchRadarData =
      async () => {
        try {
          setCrisisZones(
            (prev) => {
              if (
                prev.length === 0
              ) {
                setIsLoading(
                  true,
                );
              }

              return prev;
            },
          );

          const response =
            await fetch(
              '/api/background-radar',
            );

          if (
            response.ok
          ) {
            const data =
              await response.json();

            if (
              data.success &&
              data.threats
            ) {
              setCrisisZones(
                data.threats,
              );
            }
          }
        } catch (error) {
          console.error(
            'Radar Sync Failed:',
            error,
          );
        } finally {
          setIsLoading(
            false,
          );
        }
      };

    fetchRadarData();

    const radarInterval =
      setInterval(
        fetchRadarData,
        15000,
      );

    return () =>
      clearInterval(
        radarInterval,
      );
  }, []);

  useEffect(() => {
    const handleEnablePinDrop =
      () => {
        setIsPinDropMode(
          true,
        );
      };

    const handleTabChange =
      (event: any) => {
        setActiveTab(
          event.detail,
        );
      };

    const handleUpdateUserPin =
      (event: any) => {
        if (
          event.detail
        ) {
          setUserPin(
            event.detail,
          );
        }
      };

    const handleIntelUpdate =
      (event: any) => {
        const data =
          event.detail ?? {};

        // ====================================================
        // PUBLIC HEALTH MAP DATA
        // ====================================================

        const reports =
          Array.isArray(
            data.outbreakReports,
          )
            ? data.outbreakReports
            : [];

        const nextActiveIsoCodes =
          new Set<string>();

        const nextVulnerableIsoCodes =
          new Set<string>();

        const nextSpreadTargets:
          SpreadTarget[] = [];

        reports.forEach(
          (report: any) => {
            const activeZone =
              report?.activeZone;

            const activeIso =
              normalizeIsoCode(
                activeZone?.isoCode,
              );

            if (!activeIso) {
              return;
            }

            nextActiveIsoCodes.add(
              activeIso,
            );

            const vulnerableZones =
              Array.isArray(
                report?.vulnerableZones,
              )
                ? report.vulnerableZones
                : [];

            vulnerableZones.forEach(
              (zone: any) => {
                const vulnerableIso =
                  normalizeIsoCode(
                    zone?.isoCode,
                  );

                if (
                  !vulnerableIso
                ) {
                  return;
                }

                nextVulnerableIsoCodes.add(
                  vulnerableIso,
                );

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

                nextSpreadTargets.push(
                  {
                    fromIso:
                      activeIso,
                    toIso:
                      vulnerableIso,
                    from:
                      fromCoords,
                    to:
                      toCoords,
                  },
                );
              },
            );
          },
        );

        setActiveIsoCodes(
          Array.from(
            nextActiveIsoCodes,
          ),
        );

        setVulnerableIsoCodes(
          Array.from(
            nextVulnerableIsoCodes,
          ),
        );

        setSpreadTargets(
          nextSpreadTargets,
        );

        // ====================================================
        // VERIFIED SAFE DESTINATION
        // ====================================================

        if (
          data.destCoords &&
          typeof data.destCoords.lat ===
          'number' &&
          typeof data.destCoords.lng ===
          'number'
        ) {
          const destination = {
            lat:
              data.destCoords.lat,
            lng:
              data.destCoords.lng,
          };

          setDestPin(
            destination,
          );

          if (userPin) {
            setEvacuationRoute([
              [
                userPin.lat,
                userPin.lng,
              ],
              [
                destination.lat,
                destination.lng,
              ],
            ]);
          }
        } else {
          setDestPin(
            null,
          );

          setEvacuationRoute(
            null,
          );
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

  const resetMap =
    () => {
      setUserPin(null);
      setDestPin(null);
      setEvacuationRoute(null);
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

    return () =>
      window.removeEventListener(
        'SYSTEM_RESET',
        resetMap,
      );
  }, []);

  const triggerResetFromMap =
    () =>
      window.dispatchEvent(
        new CustomEvent(
          'SYSTEM_RESET',
        ),
      );

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
        destPin
      ) && (
          <button
            onClick={
              triggerResetFromMap
            }
            className="absolute top-20 left-3 md:top-32 md:left-6 z-[1000] bg-black/80 backdrop-blur-md border border-gray-600 p-2 md:p-3 rounded-full text-white hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition-all shadow-lg group"
          >
            <RotateCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
          </button>
        )}

      <MapContainer
        center={[
          25.0,
          10.0,
        ]}
        zoom={3}
        minZoom={3}
        maxBounds={L.latLngBounds(
          L.latLng(
            -90,
            -100000,
          ),
          L.latLng(
            90,
            100000,
          ),
        )}
        maxBoundsViscosity={1.0}
        worldCopyJump={true}
        style={{
          height: '100%',
          width: '100%',
          background: '#000',
        }}
        zoomControl={false}
        attributionControl={
          true
        }
      >
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(process.env.NEXT_PUBLIC_CARTO_API_KEY ?? '')}`}
          noWrap={false}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
        />

        <MapController
          isPinDropMode={
            isPinDropMode
          }
          setIsPinDropMode={
            setIsPinDropMode
          }
          setUserPin={
            setUserPin
          }
          userPin={
            userPin
          }
          destPin={
            destPin
          }
        />

        {/* PUBLIC HEALTH COUNTRY OVERLAY */}
        {activeTab ===
          'health' &&
          worldGeoJson && (
            <GeoJSON
              data={
                worldGeoJson
              }
              style={(
                feature: any,
              ) => {
                const iso =
                  getFeatureIsoCode(
                    feature,
                  );

                const isActive =
                  Boolean(
                    iso &&
                    activeIsoCodes.includes(
                      iso,
                    ),
                  );

                const isVulnerable =
                  Boolean(
                    iso &&
                    vulnerableIsoCodes.includes(
                      iso,
                    ),
                  );

                if (
                  isActive
                ) {
                  return {
                    fillColor:
                      '#ef4444',
                    weight: 2,
                    color:
                      '#b91c1c',
                    fillOpacity:
                      0.5,
                    className:
                      'animate-pulse',
                  };
                }

                if (
                  isVulnerable
                ) {
                  return {
                    fillColor:
                      '#f59e0b',
                    weight: 2,
                    color:
                      '#d97706',
                    fillOpacity:
                      0.4,
                  };
                }

                return {
                  fillColor:
                    'transparent',
                  weight: 0,
                  color:
                    'transparent',
                  fillOpacity:
                    0,
                };
              }}
            />
          )}

        {/* PUBLIC HEALTH SPREAD PATHS */}
        {activeTab ===
          'health' &&
          resolvedSpreadLines.map(
            (
              line,
              idx,
            ) => (
              <div
                key={`spread-${idx}`}
              >
                <Polyline
                  positions={[
                    line.from,
                    line.to,
                  ]}
                  color="#f97316"
                  weight={2}
                  dashArray="5, 8"
                />

                <Marker
                  position={
                    line.to
                  }
                  icon={
                    createVulnerableNodeIcon()
                  }
                >
                  <Popup className="bg-black/80 font-mono text-xs text-white border border-orange-500/50">
                    <b className="text-orange-500 uppercase tracking-wider">
                      Predicted Spread Zone
                    </b>
                  </Popup>
                </Marker>
              </div>
            ),
          )}

        {/* EMERGENCY / RESILIENCE RADAR */}
        {(
          activeTab ===
          'emergency' ||
          activeTab ===
          'resilience'
        ) &&
          crisisZones.map(
            (zone) => (
              <Marker
                key={
                  zone.id
                }
                position={[
                  zone.lat,
                  zone.lng,
                ]}
                icon={createDynamicThreatIcon(
                  zone.type,
                )}
              >
                <Popup className="bg-black/80 font-mono text-xs backdrop-blur-md text-white border border-red-500/50">
                  <div className="p-1">
                    <b className="text-red-500 uppercase tracking-wider">
                      {zone.name}
                    </b>
                  </div>
                </Popup>
              </Marker>
            ),
          )}

        {/* USER LOCATION */}
        {userPin && (
          <Marker
            position={[
              userPin.lat,
              userPin.lng,
            ]}
            icon={
              createUserPinIcon()
            }
          />
        )}

        {/* VERIFIED SAFE DESTINATION */}
        {destPin && (
          <Marker
            position={[
              destPin.lat,
              destPin.lng,
            ]}
            icon={
              createSafeZoneIcon()
            }
          >
            <Popup className="bg-black/90 font-mono text-xs text-white border border-blue-500/50">
              <b className="text-blue-400">
                VERIFIED SAFE DESTINATION
              </b>
            </Popup>
          </Marker>
        )}

        {/* EVACUATION VISUAL FALLBACK */}
        {evacuationRoute && (
          <Polyline
            positions={
              evacuationRoute
            }
            color="#22c55e"
            weight={3}
            dashArray="10, 10"
          />
        )}
      </MapContainer>
    </div>
  );
}

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