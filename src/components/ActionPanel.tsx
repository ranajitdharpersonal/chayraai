
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShieldAlert,
  Route,
  HeartPulse,
  Search,
  Loader2,
  Activity,
  Biohazard,
  TrendingUp,
  Radar,
  BrainCircuit,
  Globe,
  Database,
  CheckCircle2,
  Server,
  Network,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type ThreatLevel =
  | 'UNKNOWN'
  | 'LOW'
  | 'MEDIUM'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL';

type SyncStatus = {
  nasa: boolean;
  usgs: boolean;
  un: boolean;
};

type PanelData = {
  threatLevel: ThreatLevel;
  intel: string;
  route: string;
  medical: string[];
  vault: string;
  evidence: Record<string, any> | null;
  healthAdvisory: string;
  outbreakReports: Record<string, any>[];
  officialAlerts: Record<string, any>[];
  healthMetadata: Record<string, any> | null;
  resiliencePrediction: string;
  syncStatus: SyncStatus;
};

type HealthTab = 'emergency' | 'health' | 'resilience';

type JsonRecord = Record<string, any>;

// ============================================================
// CONSTANTS
// ============================================================

const THREAT_METER: Record<
  ThreatLevel,
  { pct: number; ring: string; text: string; glow: string }
> = {
  UNKNOWN: {
    pct: 5,
    ring: '#64748b',
    text: 'text-slate-400',
    glow: 'rgba(100,116,139,0.35)',
  },
  LOW: {
    pct: 22,
    ring: '#34d399',
    text: 'text-emerald-400',
    glow: 'rgba(52,211,153,0.7)',
  },
  MEDIUM: {
    pct: 48,
    ring: '#f59e0b',
    text: 'text-amber-400',
    glow: 'rgba(245,158,11,0.7)',
  },
  MODERATE: {
    pct: 48,
    ring: '#f59e0b',
    text: 'text-amber-400',
    glow: 'rgba(245,158,11,0.7)',
  },
  HIGH: {
    pct: 74,
    ring: '#fb923c',
    text: 'text-orange-400',
    glow: 'rgba(251,146,60,0.7)',
  },
  CRITICAL: {
    pct: 96,
    ring: '#ef4444',
    text: 'text-red-500',
    glow: 'rgba(239,68,68,0.8)',
  },
};

const DEFAULT_MEDICAL = [
  'Standby for medical triage.',
  'Assess immediate surroundings before moving.',
  'Seek emergency medical assistance for serious injuries.',
];

// ============================================================
// DATA NORMALIZATION HELPERS
// ============================================================

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function toDisplayText(
  value: unknown,
  fallback = 'Information unavailable.'
): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (isRecord(value)) {
    const possibleTextFields = [
      'text',
      'message',
      'summary',
      'instruction',
      'description',
      'content',
      'title',
      'name',
    ];

    for (const field of possibleTextFields) {
      if (
        typeof value[field] === 'string' &&
        value[field].trim()
      ) {
        return value[field].trim();
      }
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => toDisplayText(item, ''))
      .filter(item => item.length > 0);

    return normalized.length > 0
      ? normalized
      : DEFAULT_MEDICAL;
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return DEFAULT_MEDICAL;
}

function normalizeObjectList(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeThreatLevel(value: unknown): ThreatLevel {
  const level = String(value ?? 'UNKNOWN')
    .trim()
    .toUpperCase();

  if (
    level === 'LOW' ||
    level === 'MEDIUM' ||
    level === 'MODERATE' ||
    level === 'HIGH' ||
    level === 'CRITICAL'
  ) {
    return level;
  }

  return 'UNKNOWN';
}

function getSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'http:'
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function normalizeEvidence(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    source: toDisplayText(value.source, 'Unknown source'),
    sourceTime: toDisplayText(value.sourceTime, 'Unknown'),
    confidenceReason: toDisplayText(
      value.confidenceReason,
      'Insufficient evidence for verification.'
    ),
    hasConflictingInfo: value.hasConflictingInfo === true,
    isVerified: value.isVerified === true,
    lastCheckedTimestamp:
      value.lastCheckedTimestamp ?? null,
  };
}

// ============================================================
// COMPONENT
// ============================================================

export default function ActionPanel() {
  const [activeTab, setActiveTab] =
    useState<HealthTab>('emergency');

  const [manualFact, setManualFact] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] =
    useState('');

  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [healthLoadError, setHealthLoadError] = useState('');

  const [panelData, setPanelData] = useState<PanelData>({
    threatLevel: 'UNKNOWN',

    intel:
      'Awaiting a validated crisis request. No live threat assessment is currently displayed.',

    route:
      'Standby for navigation instructions. Enable GPS or provide a tactical pin when needed.',

    medical: DEFAULT_MEDICAL,

    vault:
      'Rescue beacon will be generated when the crisis fleet processes a request.',

    evidence: null,

    healthAdvisory:
      'Select PUBLIC HEALTH to load the latest available health intelligence.',

    outbreakReports: [],
    officialAlerts: [],
    healthMetadata: null,

    resiliencePrediction:
      'Insufficient historical data for a threat evolution prediction.',

    syncStatus: {
      nasa: false,
      usgs: false,
      un: false,
    },
  });

  // ==========================================================
  // PUBLIC HEALTH LOADER
  // ==========================================================

  const loadPublicHealth = useCallback(async () => {
    setIsHealthLoading(true);
    setHealthLoadError('');

    try {
      const response = await fetch('/api/public-health', {
        method: 'GET',
        cache: 'no-store',
      });

      let data: JsonRecord;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          'The Public Health API returned an invalid response.'
        );
      }

      if (!response.ok || data?.type === 'error') {
        throw new Error(
          toDisplayText(
            data?.message,
            'Public-health intelligence is unavailable.'
          )
        );
      }

      const officialAlerts =
        normalizeObjectList(data.officialAlerts);

      const outbreakReports =
        normalizeObjectList(data.outbreakReports);

      const healthMetadata =
        isRecord(data.metadata)
          ? data.metadata
          : null;

      const healthAdvisory = toDisplayText(
        data.healthAdvisory,
        'No verified public-health advisory is currently available.'
      );

      const detail = {
        healthAdvisory,
        officialAlerts,
        outbreakReports,
        healthMetadata,
      };

      setPanelData(prev => ({
        ...prev,
        ...detail,
        syncStatus: {
          ...prev.syncStatus,
          un:
            officialAlerts.length > 0 ||
            outbreakReports.length > 0,
        },
      }));

      // Keep MapCore and the existing event bus in sync.
      window.dispatchEvent(
        new CustomEvent('SWARM_INTEL_UPDATE', {
          detail,
        })
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Public-health intelligence could not be loaded.';

      console.error('[Public Health UI]: Load failed.', error);
      setHealthLoadError(message);
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  // ==========================================================
  // TAB NAVIGATION
  // ==========================================================

  const handleTabChange = useCallback(
    (tab: HealthTab) => {
      setActiveTab(tab);

      window.dispatchEvent(
        new CustomEvent('TAB_CHANGED', {
          detail: tab,
        })
      );

      if (tab === 'health') {
        void loadPublicHealth();
      }
    },
    [loadPublicHealth]
  );

  // ==========================================================
  // SWARM EVENT LISTENER
  // ==========================================================

  useEffect(() => {
    const handleIntelUpdate = (event: Event) => {
      const customEvent =
        event as CustomEvent<JsonRecord>;

      const detail = customEvent.detail;

      if (!isRecord(detail)) {
        return;
      }

      setPanelData(prev => {
        const incomingIntel =
          detail.intel ??
          detail.radarIntel ??
          detail.radar_intel;

        const intelText = toDisplayText(
          incomingIntel,
          ''
        );

        const incomingSync =
          isRecord(detail.syncStatus)
            ? detail.syncStatus
            : {};

        const officialAlertsProvided =
          Array.isArray(detail.officialAlerts);

        const outbreakReportsProvided =
          Array.isArray(detail.outbreakReports);

        const officialAlerts =
          officialAlertsProvided
            ? normalizeObjectList(detail.officialAlerts)
            : prev.officialAlerts;

        const outbreakReports =
          outbreakReportsProvided
            ? normalizeObjectList(detail.outbreakReports)
            : prev.outbreakReports;

        const unStatus =
          typeof incomingSync.un === 'boolean'
            ? incomingSync.un
            : officialAlertsProvided || outbreakReportsProvided
              ? officialAlerts.length > 0 ||
                outbreakReports.length > 0
              : prev.syncStatus.un;

        const nasaStatus =
          typeof incomingSync.nasa === 'boolean'
            ? incomingSync.nasa
            : /NASA/i.test(intelText)
              ? true
              : prev.syncStatus.nasa;

        const usgsStatus =
          typeof incomingSync.usgs === 'boolean'
            ? incomingSync.usgs
            : /USGS|SEISMIC/i.test(intelText)
              ? true
              : prev.syncStatus.usgs;

        return {
          ...prev,
          ...detail,

          threatLevel:
            detail.threatLevel !== undefined
              ? normalizeThreatLevel(detail.threatLevel)
              : prev.threatLevel,

          intel:
            incomingIntel !== undefined
              ? toDisplayText(
                  incomingIntel,
                  prev.intel
                )
              : prev.intel,

          route:
            detail.route !== undefined ||
            detail.navigationText !== undefined ||
            detail.navigation !== undefined
              ? toDisplayText(
                  detail.route ??
                    detail.navigationText ??
                    detail.navigation,
                  prev.route
                )
              : prev.route,

          medical:
            detail.medical !== undefined
              ? normalizeStringList(detail.medical)
              : prev.medical,

          vault:
            detail.vault !== undefined
              ? toDisplayText(
                  detail.vault,
                  prev.vault
                )
              : prev.vault,

          evidence:
            detail.evidence !== undefined
              ? normalizeEvidence(detail.evidence)
              : prev.evidence,

          healthAdvisory:
            detail.healthAdvisory !== undefined
              ? toDisplayText(
                  detail.healthAdvisory,
                  prev.healthAdvisory
                )
              : prev.healthAdvisory,

          officialAlerts,
          outbreakReports,

          healthMetadata:
            detail.healthMetadata !== undefined
              ? isRecord(detail.healthMetadata)
                ? detail.healthMetadata
                : null
              : prev.healthMetadata,

          resiliencePrediction:
            detail.resiliencePrediction !== undefined
              ? toDisplayText(
                  detail.resiliencePrediction,
                  prev.resiliencePrediction
                )
              : prev.resiliencePrediction,

          syncStatus: {
            nasa: nasaStatus,
            usgs: usgsStatus,
            un: unStatus,
          },
        };
      });

      const incomingThreat =
        normalizeThreatLevel(detail.threatLevel);

      if (
        incomingThreat === 'CRITICAL' ||
        incomingThreat === 'HIGH'
      ) {
        setActiveTab('emergency');

        window.dispatchEvent(
          new CustomEvent('TAB_CHANGED', {
            detail: 'emergency',
          })
        );
      }
    };

    window.addEventListener(
      'SWARM_INTEL_UPDATE',
      handleIntelUpdate
    );

    return () => {
      window.removeEventListener(
        'SWARM_INTEL_UPDATE',
        handleIntelUpdate
      );
    };
  }, []);

  // ==========================================================
  // MANUAL TRUTH VERIFICATION
  // ==========================================================

  const handleManualVerify = async () => {
    const claim = manualFact.trim();

    if (!claim || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setVerificationMessage('');

    try {
      const response = await fetch('/api/swarm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          message: `Verify this claim: ${claim}`,
          coords: null,
        }),
      });

      let data: JsonRecord;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          'The verification API returned an invalid response.'
        );
      }

      if (
        !response.ok ||
        data?.type === 'error' ||
        data?.type === 'spam'
      ) {
        throw new Error(
          toDisplayText(
            data?.message,
            'The claim could not be processed.'
          )
        );
      }

      if (!isRecord(data.evidence)) {
        throw new Error(
          'The API completed without returning an evidence result.'
        );
      }

      setPanelData(prev => ({
        ...prev,
        evidence: normalizeEvidence(data.evidence),
      }));

      setVerificationMessage(
        'Verification check completed. An unverified result is inconclusive, not proof that a claim is false.'
      );

      setManualFact('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Verification failed. Please try again.';

      console.error('[Truth Verifier]: Request failed.', error);
      setVerificationMessage(message);
    } finally {
      setIsVerifying(false);
    }
  };

  // ==========================================================
  // DERIVED UI VALUES
  // ==========================================================

  const meter =
    THREAT_METER[panelData.threatLevel] ??
    THREAT_METER.UNKNOWN;

  const circumference = 2 * Math.PI * 35;

  const dialOffset =
    circumference * (1 - meter.pct / 100);

  const metadata = panelData.healthMetadata;

  const snapshotStatusText =
    metadata?.snapshotStatus === 'LIVE'
      ? 'LIVE SNAPSHOT'
      : metadata?.snapshotStatus === 'LAST_KNOWN_GOOD'
        ? 'LAST KNOWN GOOD'
        : metadata?.sourceStatus === 'AVAILABLE'
          ? 'SOURCE AVAILABLE'
          : metadata?.sourceStatus === 'UNAVAILABLE'
            ? 'SOURCE UNAVAILABLE'
            : 'STATUS UNKNOWN';

  const snapshotAge =
    typeof metadata?.snapshotAgeDays === 'number'
      ? `${metadata.snapshotAgeDays}d old`
      : null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="flex flex-col w-full sm:max-w-[400px] pointer-events-auto transition-all duration-700 mx-auto h-auto md:h-full bg-[#0a0714]/70 backdrop-blur-2xl border border-violet-500/10 rounded-[22px] md:rounded-[28px] p-2 md:p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">

      {/* ================================================== */}
      {/* HEADER & TABS */}
      {/* ================================================== */}

      <div className="bg-[#0a0714]/80 backdrop-blur-3xl border border-violet-500/10 rounded-[20px] md:rounded-[26px] p-1 md:p-1.5 mb-2 md:mb-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)] flex justify-between relative overflow-hidden z-20 shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-violet-500/10 to-cyan-500/10 opacity-60" />

        <button
          onClick={() => handleTabChange('emergency')}
          className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${
            activeTab === 'emergency'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-[inset_0_0_20px_rgba(220,38,38,0.15)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <ShieldAlert className="w-3 h-3 md:w-3.5 md:h-3.5" />
          EMERGENCY
        </button>

        <button
          onClick={() => handleTabChange('health')}
          className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${
            activeTab === 'health'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(6,182,212,0.15)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Biohazard className="w-3 h-3 md:w-3.5 md:h-3.5" />
          PUBLIC HEALTH
        </button>

        <button
          onClick={() => handleTabChange('resilience')}
          className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${
            activeTab === 'resilience'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" />
          RESILIENCE
        </button>
      </div>

      {/* ================================================== */}
      {/* CONTENT AREA */}
      {/* ================================================== */}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-3 md:pb-4 space-y-2 md:space-y-3">

        {/* ================================================= */}
        {/* TIER 1: EMERGENCY */}
        {/* ================================================= */}

        {activeTab === 'emergency' && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in-95 duration-500">

            {/* SYSTEM PIPELINE */}

            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-md border border-violet-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 flex flex-col gap-2 md:gap-3 relative overflow-hidden shadow-lg">
              <div className="flex items-center gap-2 mb-1 border-b border-white/5 pb-2">
                <Activity className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] md:text-xs font-semibold text-violet-300 tracking-[0.12em] md:tracking-widest uppercase">
                  SYSTEM PIPELINE
                </span>
              </div>

              <div className="flex items-center gap-2.5 md:gap-4">
                <div className="relative w-[64px] h-[64px] md:w-[84px] md:h-[84px] shrink-0">
                  <svg
                    viewBox="0 0 88 88"
                    width="64"
                    height="64"
                    className="-rotate-90 md:hidden"
                  >
                    <circle
                      cx="44"
                      cy="44"
                      r="35"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="8"
                    />

                    <circle
                      cx="44"
                      cy="44"
                      r="35"
                      fill="none"
                      stroke={meter.ring}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dialOffset}
                      style={{
                        filter: `drop-shadow(0 0 8px ${meter.glow})`,
                        transition:
                          'stroke-dashoffset 0.8s ease, stroke 0.8s ease',
                      }}
                    />
                  </svg>

                  <svg
                    viewBox="0 0 88 88"
                    width="84"
                    height="84"
                    className="-rotate-90 hidden md:block"
                  >
                    <circle
                      cx="44"
                      cy="44"
                      r="35"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="8"
                    />

                    <circle
                      cx="44"
                      cy="44"
                      r="35"
                      fill="none"
                      stroke={meter.ring}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dialOffset}
                      style={{
                        filter: `drop-shadow(0 0 8px ${meter.glow})`,
                        transition:
                          'stroke-dashoffset 0.8s ease, stroke 0.8s ease',
                      }}
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[8px] font-mono text-gray-500 tracking-wider">
                      THREAT
                    </span>

                    <span
                      className={`text-xs font-bold tracking-wide ${meter.text} ${
                        panelData.threatLevel === 'CRITICAL'
                          ? 'animate-pulse'
                          : ''
                      }`}
                    >
                      {panelData.threatLevel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-[10px] md:text-[11px] flex-1">

                  <div className="flex items-center justify-between gap-2 text-gray-300">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      MindGuard
                    </span>

                    <span className="text-gray-400 font-mono text-[9px]">
                      BASIC VALIDATION
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-gray-300">
                    <span className="flex items-center gap-2">
                      <BrainCircuit className="w-3 h-3 text-violet-400" />
                      Central Brain
                    </span>

                    <span className="text-violet-300 font-mono text-[9px]">
                      BEDROCK
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-gray-300">
                    <span className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-cyan-400" />
                      State Store
                    </span>

                    <span className="text-cyan-300 font-mono text-[9px]">
                      DYNAMODB
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[8px] text-gray-600 font-mono border-t border-white/5 pt-2">
                Architecture indicators · Not a live infrastructure health check
              </p>
            </div>

            {/* RADAR INTEL */}

            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-xl border border-red-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all" />

              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-red-500/15 rounded-lg">
                  <Radar className="w-4 h-4 text-red-400" />
                </div>

                <h3 className="text-xs font-bold text-red-400 tracking-widest">
                  TACTICAL RADAR
                </h3>
              </div>

              <p className="text-[12px] text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                {panelData.intel}
              </p>
            </div>

            {/* EVACUATION ROUTE */}

            <div className="col-span-1 bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[22px] p-3 shadow-lg hover:border-cyan-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/15 rounded-lg">
                    <Route className="w-3.5 h-3.5 text-cyan-300" />
                  </div>

                  <h3 className="text-[9px] font-bold text-cyan-300 tracking-widest">
                    EVAC ROUTE
                  </h3>
                </div>

                <div className="bg-black/40 p-2 rounded-xl text-[10.5px] text-cyan-100/90 flex-1 whitespace-pre-wrap break-words">
                  {panelData.route}
                </div>
              </div>
            </div>

            {/* SNAPSHOT SOURCES */}

            <div className="col-span-1 bg-[#0a0714]/80 backdrop-blur-xl border border-blue-500/10 rounded-[22px] p-3 shadow-lg hover:border-blue-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/15 rounded-lg">
                    <Network className="w-3.5 h-3.5 text-blue-300" />
                  </div>

                  <h3 className="text-[9px] font-bold text-blue-300 tracking-widest">
                    SNAPSHOT EVENTS
                  </h3>
                </div>

                <div className="bg-black/40 p-2 rounded-xl text-[9px] flex-1 flex flex-col justify-center gap-1 font-mono uppercase">

                  <div className="flex justify-between border-b border-blue-900/30 pb-1 gap-1">
                    <span className="text-blue-100/80">
                      NASA EONET
                    </span>

                    <span
                      className={
                        panelData.syncStatus.nasa
                          ? 'text-emerald-400'
                          : 'text-gray-500'
                      }
                    >
                      {panelData.syncStatus.nasa
                        ? 'DETECTED'
                        : 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-blue-900/30 pb-1 gap-1">
                    <span className="text-blue-100/80">
                      USGS SEISMIC
                    </span>

                    <span
                      className={
                        panelData.syncStatus.usgs
                          ? 'text-emerald-400'
                          : 'text-gray-500'
                      }
                    >
                      {panelData.syncStatus.usgs
                        ? 'DETECTED'
                        : 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="flex justify-between gap-1">
                    <span className="text-blue-100/80">
                      UN RELIEFWEB
                    </span>

                    <span
                      className={
                        panelData.syncStatus.un
                          ? 'text-emerald-400'
                          : 'text-gray-500'
                      }
                    >
                      {panelData.syncStatus.un
                        ? 'DATA FOUND'
                        : 'NO DATA'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* MEDICAL TRIAGE */}

            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-xl border border-emerald-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 shadow-lg hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-emerald-500/15 rounded-lg">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                </div>

                <h3 className="text-xs font-bold text-emerald-400 tracking-widest">
                  MEDICAL TRIAGE
                </h3>
              </div>

              <ul className="text-[11px] text-gray-300 space-y-2">
                {panelData.medical.map((tip, index) => (
                  <li
                    key={`${index}-${tip.slice(0, 20)}`}
                    className="flex gap-2 items-start bg-black/30 p-2 rounded-lg"
                  >
                    <span className="text-emerald-400 font-mono mt-0.5">
                      [{index + 1}]
                    </span>

                    <span className="whitespace-pre-wrap break-words">
                      {tip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* VAULT / RESCUE BEACON */}

            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-xl border border-violet-500/15 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 shadow-lg hover:border-violet-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-violet-500/15 rounded-lg">
                  <ShieldCheck className="w-4 h-4 text-violet-400" />
                </div>

                <h3 className="text-xs font-bold text-violet-300 tracking-widest">
                  VAULT · RESCUE BEACON
                </h3>
              </div>

              <div className="bg-black/40 border border-violet-500/10 rounded-xl p-3">
                <p className="text-[11px] text-violet-100/90 leading-relaxed whitespace-pre-wrap break-words">
                  {panelData.vault}
                </p>
              </div>

              <p className="text-[8px] text-gray-600 font-mono mt-2">
                Beacon information is generated by the Vault agent during swarm execution.
              </p>
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* TIER 2: PUBLIC HEALTH */}
        {/* ================================================= */}

        {activeTab === 'health' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">

            {/* GLOBAL HEALTH ADVISORY */}

            <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/15 rounded-lg">
                    <Globe className="w-4 h-4 text-cyan-300" />
                  </div>

                  <h3 className="text-xs font-bold text-cyan-300 tracking-widest">
                    GLOBAL HEALTH ADVISORY
                  </h3>
                </div>

                {isHealthLoading ? (
                  <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
                ) : (
                  <span className="text-[8px] px-2 py-1 rounded-full border border-cyan-500/20 text-cyan-300 bg-cyan-500/10">
                    {snapshotStatusText}
                  </span>
                )}
              </div>

              <p className="text-[12px] text-gray-300 leading-relaxed p-3 bg-black/40 rounded-xl border border-cyan-500/10 whitespace-pre-wrap">
                {isHealthLoading
                  ? 'Loading the available public-health snapshot...'
                  : panelData.healthAdvisory}
              </p>

              {healthLoadError && (
                <div className="mt-3 flex gap-2 items-start p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />

                  <p className="text-[10px] text-red-300 leading-relaxed">
                    {healthLoadError}
                  </p>
                </div>
              )}

              {metadata && !isHealthLoading && (
                <div className="mt-3 flex items-center justify-between gap-2 text-[8px] font-mono text-cyan-500">
                  <span>
                    SOURCE: {toDisplayText(metadata.source, 'WHO / UN')}
                  </span>

                  <span className="text-right">
                    {metadata.snapshotStatus === 'LAST_KNOWN_GOOD' &&
                    snapshotAge
                      ? `FRESHNESS: ${snapshotAge}`
                      : toDisplayText(
                          metadata.snapshotStatus ??
                            metadata.sourceStatus,
                          'STATUS UNKNOWN'
                        )}
                  </span>
                </div>
              )}
            </div>

            {/* LATEST OFFICIAL REPORTS */}

            {panelData.officialAlerts.length > 0 && (
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
                <h3 className="text-[10px] font-bold text-gray-400 tracking-widest mb-3 uppercase">
                  Latest Official Reports
                </h3>

                <div className="space-y-3">
                  {panelData.officialAlerts
                    .slice(0, 5)
                    .map((alert, index) => {
                      const title = toDisplayText(
                        alert.name ??
                          alert.title ??
                          alert.headline,
                        'Official report'
                      );

                      const url = getSafeHttpUrl(
                        alert.url ??
                          alert.link
                      );

                      return (
                        <div
                          key={alert.id ?? `${title}-${index}`}
                          className="bg-cyan-950/20 border border-cyan-900/40 p-3 rounded-[18px]"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <h4 className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide break-words">
                              {title}
                            </h4>

                            <span className="text-[8px] text-cyan-500 font-mono whitespace-nowrap">
                              {formatDate(
                                alert.date ??
                                  alert.publishedAt
                              )}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-cyan-500 font-mono">
                            <span>
                              SOURCE:{' '}
                              {toDisplayText(
                                alert.source,
                                'Official source'
                              )}
                            </span>

                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-300 hover:text-white flex items-center gap-1 shrink-0"
                              >
                                VERIFY
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* OUTBREAK REPORTS */}

            {panelData.outbreakReports.length > 0 && (
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
                <h3 className="text-[10px] font-bold text-gray-400 tracking-widest mb-3 uppercase">
                  Available Outbreak Intelligence
                </h3>

                <div className="space-y-3">
                  {panelData.outbreakReports.map(
                    (report, index) => (
                      <div
                        key={report.id ?? index}
                        className="flex flex-col gap-1.5 bg-cyan-950/20 border border-cyan-900/40 p-3 rounded-[18px]"
                      >
                        <h4 className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">
                          {toDisplayText(
                            report.title ??
                              report.name,
                            'Outbreak report'
                          )}
                        </h4>

                        <p className="text-[10.5px] text-cyan-100/80 leading-relaxed whitespace-pre-wrap">
                          {toDisplayText(
                            report.description ??
                              report.summary,
                            'No additional description supplied.'
                          )}
                        </p>

                        {report.spreadForecast && (
                          <div className="mt-1.5 p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                            <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest block mb-1">
                              Spread Forecast
                            </span>

                            <p className="text-[10px] text-orange-200/90 leading-relaxed">
                              {toDisplayText(
                                report.spreadForecast
                              )}
                            </p>
                          </div>
                        )}

                        <div className="flex justify-between items-center gap-2 mt-1 pt-2 border-t border-cyan-900/50">
                          <span className="text-[9px] text-cyan-500 font-mono">
                            SOURCE:{' '}
                            {toDisplayText(
                              report.source,
                              'Not supplied'
                            )}
                          </span>

                          <span className="text-[9px] text-cyan-500 font-mono">
                            {formatDate(report.date)}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* NO REPORTS */}

            {!isHealthLoading &&
              !healthLoadError &&
              panelData.officialAlerts.length === 0 &&
              panelData.outbreakReports.length === 0 && (
                <div className="bg-[#0a0714]/80 border border-yellow-500/10 rounded-[22px] p-3 text-[10px] text-gray-400 font-mono leading-relaxed">
                  No official reports are currently present in the returned snapshot. This does not establish that no health events exist.
                </div>
              )}
          </div>
        )}

        {/* ================================================= */}
        {/* TIER 3: RESILIENCE & MEMORY */}
        {/* ================================================= */}

        {activeTab === 'resilience' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">

            {/* PREDICTIVE MEMORY */}

            <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-emerald-500/10 rounded-[26px] p-4 shadow-lg">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/15 rounded-lg">
                    <BrainCircuit className="w-4 h-4 text-emerald-400" />
                  </div>

                  <h3 className="text-xs font-bold text-emerald-400 tracking-widest">
                    PREDICTIVE MEMORY
                  </h3>
                </div>

                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20 font-mono">
                  MEMORY ENGINE
                </span>
              </div>

              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-emerald-500/30" />

                <div className="pl-8 pb-4 relative">
                  <div className="absolute left-[9px] top-1 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />

                  <h4 className="text-[10px] text-emerald-300 font-bold tracking-widest uppercase mb-1">
                    Threat Evolution Prediction
                  </h4>

                  <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {panelData.resiliencePrediction}
                  </p>
                </div>
              </div>
            </div>

            {/* ARCHITECTURE INFORMATION */}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-white/5 rounded-[22px] p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                <Activity className="w-5 h-5 text-gray-400 mb-1" />

                <span className="text-[9px] text-gray-400 font-mono">
                  ORCHESTRATION
                </span>

                <span className="text-xs text-white font-bold">
                  GOOGLE ADK
                </span>
              </div>

              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-white/5 rounded-[22px] p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                <Database className="w-5 h-5 text-gray-400 mb-1" />

                <span className="text-[9px] text-gray-400 font-mono">
                  PERSISTENCE
                </span>

                <span className="text-xs text-white font-bold">
                  DYNAMODB
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================== */}
      {/* TRUTH VERIFIER */}
      {/* ================================================== */}

      <div className="mt-2 md:mt-3 bg-[#0a0714]/90 backdrop-blur-2xl border border-white/5 rounded-[18px] md:rounded-[22px] p-2 md:p-3 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors shrink-0">

        <div
          className={`absolute left-0 top-0 w-1.5 h-full transition-colors duration-500 ${
            !panelData.evidence
              ? 'bg-gray-600'
              : panelData.evidence.isVerified
                ? 'bg-emerald-500 shadow-[0_0_15px_#22c55e]'
                : 'bg-red-500 shadow-[0_0_15px_#ef4444]'
          }`}
        />

        <div className="flex justify-between items-center mb-2 pl-2 gap-2">
          <span className="text-[10.5px] font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-widest">
            <Database
              className={`w-3.5 h-3.5 ${
                panelData.evidence
                  ? 'text-emerald-400'
                  : 'text-gray-400'
              }`}
            />

            TRUTH VERIFIER
          </span>

          <span
            className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
              !panelData.evidence
                ? 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                : panelData.evidence.isVerified
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}
          >
            {!panelData.evidence
              ? 'STANDBY'
              : panelData.evidence.isVerified
                ? 'SUPPORTED'
                : 'NOT VERIFIED'}
          </span>
        </div>

        {/* MANUAL FACT CHECK INPUT */}

        <div className="pl-2 mb-2 flex gap-2">
          <input
            type="text"
            maxLength={5000}
            placeholder="Enter a claim to manually verify..."
            value={manualFact}
            onChange={event => setManualFact(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleManualVerify();
              }
            }}
            disabled={isVerifying}
            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-lg text-[10px] px-3 py-1.5 text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-gray-600 disabled:opacity-50"
          />

          <button
            onClick={() => void handleManualVerify()}
            disabled={isVerifying || !manualFact.trim()}
            aria-label="Verify claim"
            className="bg-emerald-500/15 text-emerald-400 px-3 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {isVerifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* VERIFICATION STATUS */}

        {verificationMessage && (
          <p className="pl-2 mb-2 text-[9px] text-amber-300/90 leading-relaxed">
            {verificationMessage}
          </p>
        )}

        {/* EVIDENCE RESULTS */}

        <div className="pl-2 text-[11px] text-gray-300 font-mono leading-relaxed">
          {panelData.evidence ? (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="break-words">
                <span className="text-gray-500 uppercase tracking-wider">
                  Source:
                </span>
                {' '}
                <span className="text-blue-300">
                  {toDisplayText(
                    panelData.evidence.source,
                    'Unknown'
                  )}
                </span>
              </p>

              <p className="break-words">
                <span className="text-gray-500 uppercase tracking-wider">
                  Evidence:
                </span>
                {' '}
                {toDisplayText(
                  panelData.evidence.confidenceReason,
                  'Insufficient evidence.'
                )}
              </p>

              {panelData.evidence.sourceTime && (
                <p>
                  <span className="text-gray-500 uppercase tracking-wider">
                    Source time:
                  </span>
                  {' '}
                  {toDisplayText(
                    panelData.evidence.sourceTime
                  )}
                </p>
              )}

              {panelData.evidence.hasConflictingInfo && (
                <p className="text-orange-300">
                  Conflicting information was reported.
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-600 text-[9px] italic mt-1">
              Awaiting swarm data or manual input for cross-checking...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
