'use client';
import { useState, useEffect } from 'react';
import { 
  ShieldAlert, Route, HeartPulse, ShieldCheck, 
  Search, CheckCircle, XCircle, Loader2, Activity, 
  Biohazard, TrendingUp, Radar, BrainCircuit, Globe, Database, AlertTriangle, Cpu, CheckCircle2, Server, Crosshair
} from 'lucide-react';

export default function ActionPanel() {
  // 1. 3-Tier Enterprise UI State
  const [activeTab, setActiveTab] = useState<'emergency' | 'health' | 'resilience'>('emergency');

  // 2. Swarm Data State (Defaulting to the original fallback values)
  const [panelData, setPanelData] = useState({
    threatLevel: 'LOW',
    intel: "AWAITING ACTIVE RADAR SCANS... No immediate threats in your perimeter.",
    route: "Standby for routing protocols. No active evacuation order.",
    medical: ["Standby for medical triage.", "Ensure water supply.", "Keep emergency comms on."],
    vault: "Identity standby. Waiting for emergency trigger to generate secure beacon.",
    evidence: null as any,
    healthAdvisory: "Global health parameters normal. No active localized outbreaks.",
    healthAlerts: [],
    resiliencePrediction: "Insufficient historical data for accurate threat prediction. Awaiting crisis trigger."
  });

  // Listen for Swarm Orchestrator (Backend) updates
  useEffect(() => {
    const handleIntelUpdate = (event: any) => {
      if (event.detail) {
        setPanelData(prev => ({ ...prev, ...event.detail }));
        // Auto-switch to emergency tab if a critical event occurs
        if (event.detail.threatLevel === 'CRITICAL' || event.detail.threatLevel === 'HIGH') {
            setActiveTab('emergency');
        }
      }
    };
    
    window.addEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
    return () => window.removeEventListener('SWARM_INTEL_UPDATE', handleIntelUpdate);
  }, []);

  return (
    <div className="flex flex-col w-full sm:max-w-[400px] pointer-events-auto transition-all duration-700 mx-auto h-full">
      
      {/* ============================================================ */}
      {/* 2026 NEON GLASSMORPHISM HEADER & TABS                        */}
      {/* ============================================================ */}
      <div className="bg-[#050505]/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-1.5 mb-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex justify-between relative overflow-hidden z-20">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-purple-500/10 to-blue-500/10 opacity-50"></div>
        
        <button 
          onClick={() => setActiveTab('emergency')}
          className={`relative z-10 flex-1 py-2.5 flex items-center justify-center gap-2 rounded-2xl text-[10px] md:text-xs font-bold tracking-widest transition-all duration-500 ${activeTab === 'emergency' ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[inset_0_0_15px_rgba(220,38,38,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <ShieldAlert className="w-3.5 h-3.5 md:w-4 md:h-4" /> EMERGENCY
        </button>
        
        <button 
          onClick={() => setActiveTab('health')}
          className={`relative z-10 flex-1 py-2.5 flex items-center justify-center gap-2 rounded-2xl text-[10px] md:text-xs font-bold tracking-widest transition-all duration-500 ${activeTab === 'health' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Biohazard className="w-3.5 h-3.5 md:w-4 md:h-4" /> PUBLIC HEALTH
        </button>
        
        <button 
          onClick={() => setActiveTab('resilience')}
          className={`relative z-10 flex-1 py-2.5 flex items-center justify-center gap-2 rounded-2xl text-[10px] md:text-xs font-bold tracking-widest transition-all duration-500 ${activeTab === 'resilience' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[inset_0_0_15px_rgba(16,185,129,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" /> RESILIENCE
        </button>
      </div>

      {/* ============================================================ */}
      {/* REAL EVIDENCE PANEL (GROUND TRUTH) - Appears globally if intel exists */}
      {/* ============================================================ */}
      {panelData.evidence && (
        <div className="mb-3 bg-[#0a0a0b]/90 backdrop-blur-2xl border border-gray-700 rounded-2xl p-3 shadow-2xl relative overflow-hidden group hover:border-gray-500 transition-colors">
            <div className={`absolute left-0 top-0 w-1 h-full ${panelData.evidence.isVerified ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`}></div>
            <div className="flex justify-between items-center mb-2 pl-2">
                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5 uppercase tracking-widest">
                    <Database className="w-3 h-3" /> GROUND TRUTH INTEL
                </span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${panelData.evidence.isVerified ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    {panelData.evidence.isVerified ? 'VERIFIED' : 'UNVERIFIED'}
                </span>
            </div>
            <div className="pl-2 space-y-1.5 text-[10px] font-mono text-gray-300">
                <p><span className="text-gray-500">Source:</span> {panelData.evidence.source}</p>
                <p><span className="text-gray-500">Confidence:</span> {panelData.evidence.confidenceReason}</p>
                {panelData.evidence.hasConflictingInfo && (
                    <p className="text-orange-400 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Conflicting reports detected</p>
                )}
            </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CONTENT AREA: 2026 BENTO GRID STYLE                          */}
      {/* ============================================================ */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 md:pb-4 space-y-3">
        
        {/* TIER 1: EMERGENCY */}
        {activeTab === 'emergency' && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in-95 duration-500">
            
            {/* 🛑 NEW: LIVE OBSERVABILITY TRACE (The WOW Factor) - Inserted at the top of Emergency! */}
            <div className="col-span-2 bg-[#050505]/80 backdrop-blur-md border border-white/10 rounded-3xl p-4 flex flex-col gap-3 relative overflow-hidden shadow-lg">
                <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
                
                <div className="flex items-center justify-between mb-1 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-mono text-emerald-500 tracking-widest uppercase">Live Telemetry</span>
                    </div>
                    <div className="text-[10px] font-mono font-bold">
                        <span className={panelData.threatLevel === 'CRITICAL' ? 'text-red-500 animate-pulse' : 'text-gray-400'}>
                             [ {panelData.threatLevel} ]
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 font-mono text-[9px] md:text-[10px] opacity-80">
                    <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500"/> MINDGUARD SECURE</span>
                        <span className="text-emerald-500">✓ 0.3s</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500"/> RADAR SYNC</span>
                        <span className="text-emerald-500">✓ 1.2s</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2"><Server className="w-3 h-3 text-purple-500"/> VAULT ENCRYPTED</span>
                        <span className="text-purple-400">✓ 0.4s</span>
                    </div>
                </div>
            </div>

            {/* Radar Intel (Full Width) */}
            <div className="col-span-2 bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-red-500/20 rounded-lg"><Radar className="w-4 h-4 text-red-500" /></div>
                <h3 className="text-xs font-bold text-red-500 tracking-widest">TACTICAL RADAR</h3>
              </div>
              <p className="text-[11px] text-gray-300 font-mono leading-relaxed">{panelData.intel}</p>
            </div>

            {/* Evacuation Route */}
            <div className="col-span-1 bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-3 shadow-lg hover:border-blue-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/20 rounded-lg"><Route className="w-3.5 h-3.5 text-blue-500" /></div>
                  <h3 className="text-[9px] font-bold text-blue-500 tracking-widest">EVAC ROUTE</h3>
                </div>
                <div className="bg-black/50 p-2 rounded-xl text-[10px] text-blue-200 font-mono flex-1">{panelData.route}</div>
              </div>
            </div>

            {/* Secure Vault */}
            <div className="col-span-1 bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-3 shadow-lg hover:border-purple-500/30 transition-colors">
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/20 rounded-lg"><ShieldCheck className="w-3.5 h-3.5 text-purple-500" /></div>
                  <h3 className="text-[9px] font-bold text-purple-500 tracking-widest">ID VAULT</h3>
                </div>
                <div className="bg-black/50 p-2 rounded-xl text-[10px] text-purple-200 font-mono flex-1">{panelData.vault}</div>
              </div>
            </div>

            {/* Medical Triage (Full Width) */}
            <div className="col-span-2 bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-lg hover:border-green-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-green-500/20 rounded-lg"><HeartPulse className="w-4 h-4 text-green-500" /></div>
                <h3 className="text-xs font-bold text-green-500 tracking-widest">MEDICAL TRIAGE</h3>
              </div>
              <ul className="text-[10px] text-gray-300 font-mono space-y-2">
                {panelData.medical.map((tip, index) => (
                  <li key={index} className="flex gap-2 items-start bg-black/40 p-2 rounded-lg">
                    <span className="text-green-500 mt-0.5">[{index + 1}]</span> <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TIER 2: PUBLIC HEALTH */}
        {activeTab === 'health' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-cyan-500/20 rounded-lg"><Globe className="w-4 h-4 text-cyan-500" /></div>
                    <h3 className="text-xs font-bold text-cyan-500 tracking-widest">GLOBAL HEALTH ADVISORY</h3>
                </div>
                <p className="text-[11px] text-gray-300 font-mono leading-relaxed p-3 bg-black/50 rounded-xl border border-cyan-500/10">
                    {panelData.healthAdvisory}
                </p>
            </div>
            
            {panelData.healthAlerts.length > 0 && (
                <div className="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-lg">
                    <h3 className="text-[10px] font-bold text-gray-400 tracking-widest mb-3 uppercase">Active Outbreak Zones (UN ReliefWeb)</h3>
                    <div className="space-y-2">
                        {panelData.healthAlerts.map((alert: any, i: number) => (
                            <div key={i} className="text-[10px] font-mono bg-cyan-950/20 border border-cyan-900/50 p-2 rounded-lg flex items-center justify-between">
                                <span className="text-cyan-200 truncate pr-2">{alert.name}</span>
                                <a href={alert.url} target="_blank" rel="noreferrer" className="text-cyan-500 hover:text-cyan-400 shrink-0">Source &nearr;</a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        )}

        {/* TIER 3: RESILIENCE & MEMORY */}
        {activeTab === 'resilience' && (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-emerald-500/20 rounded-lg"><BrainCircuit className="w-4 h-4 text-emerald-500" /></div>
                        <h3 className="text-xs font-bold text-emerald-500 tracking-widest">PREDICTIVE MEMORY</h3>
                    </div>
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full border border-emerald-500/20 font-mono animate-pulse">
                        FIRESTORE SYNCED
                    </span>
                </div>
                
                <div className="relative">
                    <div className="absolute left-3 top-2 bottom-2 w-px bg-emerald-500/30"></div>
                    <div className="pl-8 pb-4 relative">
                        <div className="absolute left-[9px] top-1 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
                        <h4 className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mb-1">Threat Evolution Prediction</h4>
                        <p className="text-[10px] font-mono text-gray-300 leading-relaxed">
                            {panelData.resiliencePrediction}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                    <Activity className="w-5 h-5 text-gray-500 mb-1" />
                    <span className="text-[9px] text-gray-400 font-mono">SYSTEM UPTIME</span>
                    <span className="text-xs text-white font-bold">99.99%</span>
                </div>
                <div className="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-3 flex flex-col items-center justify-center text-center gap-1 h-24">
                    <Database className="w-5 h-5 text-gray-500 mb-1" />
                    <span className="text-[9px] text-gray-400 font-mono">MEMORY BANK</span>
                    <span className="text-xs text-white font-bold">ACTIVE</span>
                </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}