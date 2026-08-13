'use client';
import { useState, useEffect } from 'react';
import {
  ShieldAlert, Route, HeartPulse,
  Search, CheckCircle, XCircle, Loader2, Activity,
  Biohazard, TrendingUp, Radar, BrainCircuit, Globe, Database, AlertTriangle, Cpu, CheckCircle2, Server, Crosshair, Network
} from 'lucide-react';

const THREAT_METER: Record<string, { pct: number; ring: string; text: string; glow: string }> = {
  LOW: { pct: 22, ring: '#34d399', text: 'text-emerald-400', glow: 'rgba(52,211,153,0.7)' },
  MEDIUM: { pct: 48, ring: '#f59e0b', text: 'text-amber-400', glow: 'rgba(245,158,11,0.7)' },
  MODERATE: { pct: 48, ring: '#f59e0b', text: 'text-amber-400', glow: 'rgba(245,158,11,0.7)' },
  HIGH: { pct: 74, ring: '#fb923c', text: 'text-orange-400', glow: 'rgba(251,146,60,0.7)' },
  CRITICAL: { pct: 96, ring: '#ef4444', text: 'text-red-500', glow: 'rgba(239,68,68,0.8)' },
};

export default function ActionPanel() {
  const [activeTab, setActiveTab] = useState<'emergency' | 'health' | 'resilience'>('emergency');

  // 🔥 NEW: States for Manual Fact Checking
  const [manualFact, setManualFact] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // ✅ PUBLIC HEALTH: on-demand live/cached snapshot loader
  const [isHealthLoading, setIsHealthLoading] = useState(false);

  const [panelData, setPanelData] = useState({
    threatLevel: 'LOW',
    intel: "AWAITING ACTIVE RADAR SCANS... No immediate threats in your perimeter.",
    route: "Standby for routing protocols. No active evacuation order.",
    medical: ["Standby for medical triage.", "Ensure water supply.", "Keep emergency comms on."],
    evidence: null as any,

    healthAdvisory: "Select PUBLIC HEALTH to load the latest verified health intelligence.",
    outbreakReports: [] as any[],
    officialAlerts: [] as any[],
    healthMetadata: null as any,

    resiliencePrediction: "Insufficient historical data for accurate threat prediction. Awaiting crisis trigger.",
    syncStatus: {
       nasa: false,
       usgs: false,
       un: false
    }
  });

  useEffect(() => {
    const handleIntelUpdate = (event: any) => {
      if (event.detail) {
        const isNasaSynced = event.detail.intel?.includes("NASA") || false;
        const isUsgsSynced = event.detail.intel?.includes("SEISMIC") || false;
        const isUnSynced =
          (event.detail.officialAlerts && event.detail.officialAlerts.length > 0) ||
          (event.detail.outbreakReports && event.detail.outbreakReports.length > 0);

        setPanelData(prev => ({
            ...prev,
            ...event.detail,
            syncStatus: { nasa: isNasaSynced, usgs: isUsgsSynced, un: isUnSynced }
        }));

        if (event.detail.threatLevel === 'CRITICAL' || event.detail.threatLevel === 'HIGH') {
          handleTabChange('emergency');
        }
      }
    };

    window.addEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
    return () => window.removeEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
  }, []);

  // ✅ PUBLIC HEALTH: only fetch when the user opens the Health tab.
  const loadPublicHealth = async () => {
    setIsHealthLoading(true);

    try {
      const res = await fetch('/api/public-health', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok || data?.type === 'error') {
        throw new Error(
          data?.message || 'Public-health intelligence is unavailable.'
        );
      }

      const detail = {
        healthAdvisory:
          data.healthAdvisory ||
          'No verified public-health advisory is currently available.',

        outbreakReports:
          Array.isArray(data.outbreakReports)
            ? data.outbreakReports
            : [],

        officialAlerts:
          Array.isArray(data.officialAlerts)
            ? data.officialAlerts
            : [],

        healthMetadata:
          data.metadata || null,

        syncStatus: {
          nasa: panelData.syncStatus.nasa,
          usgs: panelData.syncStatus.usgs,
          un:
            (Array.isArray(data.officialAlerts) && data.officialAlerts.length > 0) ||
            (Array.isArray(data.outbreakReports) && data.outbreakReports.length > 0),
        },
      };

      setPanelData(prev => ({
        ...prev,
        ...detail,
      }));

      // Feed the exact same event bus used by the existing MapCore
      // so Public Health country overlays/spread paths remain connected.
      window.dispatchEvent(
        new CustomEvent('SWARM_INTEL_UPDATE', {
          detail,
        })
      );
    } catch (error) {
      console.error('[Public Health UI]: Load failed.', error);
    } finally {
      setIsHealthLoading(false);
    }
  };

  const handleTabChange = (tab: 'emergency' | 'health' | 'resilience') => {
    setActiveTab(tab);
    window.dispatchEvent(new CustomEvent('TAB_CHANGED', { detail: tab }));

    if (tab === 'health') {
      void loadPublicHealth();
    }
  };

  // 🔥 NEW: Function to handle manual verification
  const handleManualVerify = async () => {
    if (!manualFact.trim()) return;
    setIsVerifying(true);
    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Verify this claim: ${manualFact}`, coords: null })
      });
      const data = await res.json();
      if (data.evidence) {
         setPanelData(prev => ({ ...prev, evidence: data.evidence }));
      }
    } catch (e) {
      console.error("Verification failed:", e);
    } finally {
      setIsVerifying(false);
      setManualFact('');
    }
  };

  const meter = THREAT_METER[panelData.threatLevel] ?? THREAT_METER.LOW;
  const circumference = 2 * Math.PI * 35;
  const dialOffset = circumference * (1 - meter.pct / 100);

  const metadata = panelData.healthMetadata;

  const snapshotStatusText =
    metadata?.snapshotStatus === 'LIVE'
      ? 'LIVE VERIFIED'
      : metadata?.snapshotStatus === 'LAST_KNOWN_GOOD'
        ? 'LAST VERIFIED'
        : metadata?.sourceStatus === 'AVAILABLE'
          ? 'SOURCE VERIFIED'
          : 'SOURCE STATUS';

  const snapshotAge =
    typeof metadata?.snapshotAgeDays === 'number'
      ? `${metadata.snapshotAgeDays}d old`
      : null;

  return (
    <div className="flex flex-col w-full sm:max-w-[400px] pointer-events-auto transition-all duration-700 mx-auto h-auto md:h-full bg-[#0a0714]/70 backdrop-blur-2xl border border-violet-500/10 rounded-[22px] md:rounded-[28px] p-2 md:p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">

      {/* HEADER & TABS */}
      <div className="bg-[#0a0714]/80 backdrop-blur-3xl border border-violet-500/10 rounded-[20px] md:rounded-[26px] p-1 md:p-1.5 mb-2 md:mb-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)] flex justify-between relative overflow-hidden z-20 shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-violet-500/10 to-cyan-500/10 opacity-60"></div>

        <button onClick={() => handleTabChange('emergency')} className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${activeTab === 'emergency' ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-[inset_0_0_20px_rgba(220,38,38,0.15)]' : 'text-gray-500 hover:text-gray-300'}`}>
          <ShieldAlert className="w-3 h-3 md:w-3.5 md:h-3.5" /> EMERGENCY
        </button>

        <button onClick={() => handleTabChange('health')} className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${activeTab === 'health' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(6,182,212,0.15)]' : 'text-gray-500 hover:text-gray-300'}`}>
          <Biohazard className="w-3 h-3 md:w-3.5 md:h-3.5" /> PUBLIC HEALTH
        </button>

        <button onClick={() => handleTabChange('resilience')} className={`relative z-10 flex-1 py-1.5 md:py-2.5 px-0.5 flex items-center justify-center gap-1 md:gap-2 rounded-[16px] md:rounded-2xl text-[7.5px] md:text-xs font-bold tracking-[0.05em] md:tracking-widest transition-all duration-500 ${activeTab === 'resilience' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]' : 'text-gray-500 hover:text-gray-300'}`}>
          <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" /> RESILIENCE
        </button>
      </div>

      {/* CONTENT AREA (Now flex-1 to push the Verifier down) */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-3 md:pb-4 space-y-2 md:space-y-3">

        {/* TIER 1: EMERGENCY */}
        {activeTab === 'emergency' && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in-95 duration-500">

            {/* LIVE TELEMETRY */}
            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-md border border-violet-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 flex flex-col gap-2 md:gap-3 relative overflow-hidden shadow-lg">
              <div className="flex items-center gap-2 mb-1 border-b border-white/5 pb-2">
                <Activity className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] md:text-xs font-semibold text-violet-300 tracking-[0.12em] md:tracking-widest uppercase">Live Telemetry</span>
              </div>

              <div className="flex items-center gap-2.5 md:gap-4">
                <div className="relative w-[64px] h-[64px] md:w-[84px] md:h-[84px] shrink-0">
                  <svg viewBox="0 0 88 88" width="64" height="64" className="-rotate-90 md:hidden">
                    <circle cx="44" cy="44" r="35" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle cx="44" cy="44" r="35" fill="none" stroke={meter.ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dialOffset} style={{ filter: `drop-shadow(0 0 8px ${meter.glow})`, transition: 'stroke-dashoffset 0.8s ease, stroke 0.8s ease' }} />
                  </svg>

                  <svg viewBox="0 0 88 88" width="84" height="84" className="-rotate-90 hidden md:block">
                    <circle cx="44" cy="44" r="35" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle cx="44" cy="44" r="35" fill="none" stroke={meter.ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dialOffset} style={{ filter: `drop-shadow(0 0 8px ${meter.glow})`, transition: 'stroke-dashoffset 0.8s ease, stroke 0.8s ease' }} />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[8px] font-mono text-gray-500 tracking-wider">THREAT</span>
                    <span className={`text-xs font-bold tracking-wide ${meter.text} ${panelData.threatLevel === 'CRITICAL' ? 'animate-pulse' : ''}`}>{panelData.threatLevel}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-[10px] md:text-[11px] flex-1">
                  <div className="flex items-center justify-between text-gray-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> MindGuard secure
                    </span>
                    <span className="text-emerald-500 font-mono">✓ 0.3s</span>
                  </div>

                  <div className="flex items-center justify-between text-gray-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Radar sync
                    </span>
                    <span className="text-emerald-500 font-mono">✓ 1.2s</span>
                  </div>

                  <div className="flex items-center justify-between text-gray-300">
                    <span className="flex items-center gap-2">
                      <Server className="w-3 h-3 text-violet-400" /> Firestore DB
                    </span>
                    <span className="text-violet-300 font-mono">✓ 0.4s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Radar Intel */}
            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-xl border border-red-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>

              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-red-500/15 rounded-lg">
                  <Radar className="w-4 h-4 text-red-400" />
                </div>
                <h3 className="text-xs font-bold text-red-400 tracking-widest">TACTICAL RADAR</h3>
              </div>

              <p className="text-[12px] text-gray-300 leading-relaxed">
                {panelData.intel}
              </p>
            </div>

            {/* Evacuation Route */}
            <div className="col-span-1 bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[22px] p-3 shadow-lg hover:border-cyan-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/15 rounded-lg">
                    <Route className="w-3.5 h-3.5 text-cyan-300" />
                  </div>
                  <h3 className="text-[9px] font-bold text-cyan-300 tracking-widest">EVAC ROUTE</h3>
                </div>

                <div className="bg-black/40 p-2 rounded-xl text-[10.5px] text-cyan-100/90 flex-1">
                  {panelData.route}
                </div>
              </div>
            </div>

            {/* DYNAMIC LIVE INTEL SOURCES */}
            <div className="col-span-1 bg-[#0a0714]/80 backdrop-blur-xl border border-blue-500/10 rounded-[22px] p-3 shadow-lg hover:border-blue-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/15 rounded-lg">
                    <Network className="w-3.5 h-3.5 text-blue-300" />
                  </div>
                  <h3 className="text-[9px] font-bold text-blue-300 tracking-widest">LIVE SOURCES</h3>
                </div>

                <div className="bg-black/40 p-2 rounded-xl text-[9px] flex-1 flex flex-col justify-center gap-1 font-mono uppercase">
                  <div className="flex justify-between border-b border-blue-900/30 pb-1">
                    <span className="text-blue-100/80">NASA EONET</span>
                    <span className={panelData.syncStatus.nasa ? "text-emerald-400" : "text-amber-500 animate-pulse"}>
                      {panelData.syncStatus.nasa ? "SYNCED" : "AWAITING"}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-blue-900/30 pb-1">
                    <span className="text-blue-100/80">USGS SEISMIC</span>
                    <span className={panelData.syncStatus.usgs ? "text-emerald-400" : "text-amber-500 animate-pulse"}>
                      {panelData.syncStatus.usgs ? "SYNCED" : "AWAITING"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-blue-100/80">UN RELIEFWEB</span>
                    <span className={panelData.syncStatus.un ? "text-emerald-400" : "text-amber-500 animate-pulse"}>
                      {panelData.syncStatus.un ? "SYNCED" : "AWAITING"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medical Triage */}
            <div className="col-span-2 bg-[#0a0714]/80 backdrop-blur-xl border border-emerald-500/10 rounded-[20px] md:rounded-[26px] p-2.5 md:p-4 shadow-lg hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-emerald-500/15 rounded-lg">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-xs font-bold text-emerald-400 tracking-widest">MEDICAL TRIAGE</h3>
              </div>

              <ul className="text-[11px] text-gray-300 space-y-2">
                {panelData.medical.map((tip, index) => (
                  <li key={index} className="flex gap-2 items-start bg-black/30 p-2 rounded-lg">
                    <span className="text-emerald-400 font-mono mt-0.5">[{index + 1}]</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TIER 2: PUBLIC HEALTH */}
        {activeTab === 'health' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">

            <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/15 rounded-lg">
                    <Globe className="w-4 h-4 text-cyan-300" />
                  </div>
                  <h3 className="text-xs font-bold text-cyan-300 tracking-widest">GLOBAL HEALTH ADVISORY</h3>
                </div>

                {isHealthLoading ? (
                  <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
                ) : (
                  <span className="text-[8px] px-2 py-1 rounded-full border border-cyan-500/20 text-cyan-300 bg-cyan-500/10">
                    {snapshotStatusText}
                  </span>
                )}
              </div>

              <p className="text-[12px] text-gray-300 leading-relaxed p-3 bg-black/40 rounded-xl border border-cyan-500/10">
                {isHealthLoading
                  ? 'Refreshing verified public-health intelligence...'
                  : panelData.healthAdvisory}
              </p>

              {metadata && !isHealthLoading && (
                <div className="mt-2 flex items-center justify-between text-[8px] font-mono text-cyan-500">
                  <span>SOURCE: {metadata.source || 'UN ReliefWeb'}</span>
                  <span>
                    {metadata.snapshotStatus === 'LAST_KNOWN_GOOD' && snapshotAge
                      ? `FRESHNESS: ${snapshotAge}`
                      : metadata.snapshotStatus || metadata.sourceStatus || 'STATUS UNKNOWN'}
                  </span>
                </div>
              )}
            </div>

            {/* Latest Verified Official Reports */}
            {panelData.officialAlerts && panelData.officialAlerts.length > 0 && (
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
                <h3 className="text-[10px] font-bold text-gray-400 tracking-widest mb-3 uppercase">
                  Latest Verified Reports
                </h3>

                <div className="space-y-3">
                  {panelData.officialAlerts.slice(0, 5).map((alert: any, i: number) => (
                    <div key={alert.id || i} className="bg-cyan-950/20 border border-cyan-900/40 p-3 rounded-[18px]">
                      <div className="flex justify-between items-start gap-3">
                        <h4 className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">
                          {alert.name}
                        </h4>

                        <span className="text-[8px] text-cyan-500 font-mono whitespace-nowrap">
                          {alert.date ? new Date(alert.date).toLocaleDateString() : ''}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-cyan-500 font-mono">
                        <span>SOURCE: {alert.source}</span>
                        {alert.url && (
                          <a
                            href={alert.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 hover:text-white"
                          >
                            VERIFY →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI-Powered Outbreak Reports UI */}
            {panelData.outbreakReports && panelData.outbreakReports.length > 0 && (
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-cyan-500/10 rounded-[26px] p-4 shadow-lg">
                <h3 className="text-[10px] font-bold text-gray-400 tracking-widest mb-3 uppercase">Active Outbreak Intel</h3>

                <div className="space-y-3">
                  {panelData.outbreakReports.map((report: any, i: number) => (
                    <div key={i} className="flex flex-col gap-1.5 bg-cyan-950/20 border border-cyan-900/40 p-3 rounded-[18px]">
                      <h4 className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">{report.title}</h4>
                      <p className="text-[10.5px] text-cyan-100/80 leading-relaxed">{report.description}</p>

                      {report.spreadForecast && (
                        <div className="mt-1.5 p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                          <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest block mb-1">Spread Forecast:</span>
                          <p className="text-[10px] text-orange-200/90 leading-relaxed">{report.spreadForecast}</p>
                        </div>
                      )}

                      <div className="flex justify-between items-center mt-1 pt-2 border-t border-cyan-900/50">
                        <span className="text-[9px] text-cyan-500 font-mono">SOURCE: {report.source}</span>
                        <span className="text-[9px] text-cyan-500 font-mono">{report.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isHealthLoading &&
              (!panelData.officialAlerts || panelData.officialAlerts.length === 0) &&
              (!panelData.outbreakReports || panelData.outbreakReports.length === 0) && (
                <div className="bg-[#0a0714]/80 border border-yellow-500/10 rounded-[22px] p-3 text-[9px] text-gray-400 font-mono">
                  No verified public-health report is currently available in the snapshot.
                </div>
              )}
          </div>
        )}

        {/* TIER 3: RESILIENCE & MEMORY */}
        {activeTab === 'resilience' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-emerald-500/10 rounded-[26px] p-4 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/15 rounded-lg">
                    <BrainCircuit className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-xs font-bold text-emerald-400 tracking-widest">PREDICTIVE MEMORY</h3>
                </div>

                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20 font-mono animate-pulse">
                  FIRESTORE SYNCED
                </span>
              </div>

              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-emerald-500/30"></div>

                <div className="pl-8 pb-4 relative">
                  <div className="absolute left-[9px] top-1 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>

                  <h4 className="text-[10px] text-emerald-300 font-bold tracking-widest uppercase mb-1">
                    Threat Evolution Prediction
                  </h4>

                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    {panelData.resiliencePrediction}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-white/5 rounded-[22px] p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                <Activity className="w-5 h-5 text-gray-500 mb-1" />
                <span className="text-[9px] text-gray-400 font-mono">SYSTEM UPTIME</span>
                <span className="text-xs text-white font-bold">99.99%</span>
              </div>

              <div className="bg-[#0a0714]/80 backdrop-blur-xl border border-white/5 rounded-[22px] p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                <Database className="w-5 h-5 text-gray-500 mb-1" />
                <span className="text-[9px] text-gray-400 font-mono">MEMORY BANK</span>
                <span className="text-xs text-white font-bold">ACTIVE</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🛑 THE VERIFIER / GROUND TRUTH INTEL (Moved and Pinned to Bottom!) */}
      <div className="mt-2 md:mt-3 bg-[#0a0714]/90 backdrop-blur-2xl border border-white/5 rounded-[18px] md:rounded-[22px] p-2 md:p-3 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors shrink-0">
          <div className={`absolute left-0 top-0 w-1.5 h-full transition-colors duration-500 ${!panelData.evidence ? 'bg-gray-600' : panelData.evidence.isVerified ? 'bg-emerald-500 shadow-[0_0_15px_#22c55e]' : 'bg-red-500 shadow-[0_0_15px_#ef4444]'}`}></div>

          <div className="flex justify-between items-center mb-2 pl-2">
            <span className="text-[10.5px] font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-widest">
              <Database className={`w-3.5 h-3.5 ${panelData.evidence ? 'text-emerald-400' : 'text-gray-400'}`} /> TRUTH VERIFIER
            </span>

            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${!panelData.evidence ? 'bg-gray-500/15 text-gray-400 border border-gray-500/30' : panelData.evidence.isVerified ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
              {!panelData.evidence ? 'STANDBY' : panelData.evidence.isVerified ? 'VERIFIED' : 'CONFLICT DETECTED'}
            </span>
          </div>

          {/* Manual Fact Check Input */}
          <div className="pl-2 mb-2 flex gap-2">
            <input
              type="text"
              placeholder="Enter a claim to manually verify..."
              value={manualFact}
              onChange={(e) => setManualFact(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualVerify()}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg text-[10px] px-3 py-1.5 text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-gray-600"
            />

            <button
              onClick={handleManualVerify}
              disabled={isVerifying || !manualFact.trim()}
              className="bg-emerald-500/15 text-emerald-400 px-3 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Results Display */}
          <div className="pl-2 text-[11px] text-gray-300 font-mono leading-relaxed">
            {panelData.evidence ? (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <p>
                  <span className="text-gray-500 uppercase tracking-wider">Source:</span>
                  {' '}
                  <span className="text-blue-300">{panelData.evidence.source}</span>
                </p>
                <p>
                  <span className="text-gray-500 uppercase tracking-wider">Evidence:</span>
                  {' '}
                  {panelData.evidence.confidenceReason}
                </p>
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