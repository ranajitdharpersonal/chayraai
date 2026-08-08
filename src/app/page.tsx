import MapWidget from '@/components/MapWidget';
import HelpBar from '@/components/HelpBar';
import ActionPanel from '@/components/ActionPanel';

export default function Home() {
  return (
    <main className="relative h-screen w-screen bg-black overflow-hidden font-sans selection:bg-red-500/30">

      {/* 1. Background Map Layer — always full screen */}
      <div className="absolute inset-0 z-0">
        <MapWidget />
      </div>

      {/* 2. Floating UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">

        {/* --- TOP LEFT: Header & Logo --- */}
        <div className="absolute top-3 left-3 md:top-6 md:left-6 pointer-events-auto z-50">
          <header className="flex items-center gap-2 md:gap-4">
            <div className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center overflow-hidden drop-shadow-[0_0_15px_rgba(220,38,38,0.6)] hover:scale-105 transition-transform">
              <img src="/logo.png" alt="ChayRa AI" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] flex items-center gap-1 md:gap-2">
                <span className="text-white font-bold">ChayRa</span>
                <span className="text-red-600 font-bold">AI</span>
              </h1>
              <p className="text-white/90 text-[9px] md:text-[12px] tracking-[0.05em] md:tracking-[0.1em] mt-1 md:mt-3 drop-shadow-[0_0_5px_rgba(0,0,0,0.8)]">
                When the World Breaks, ChayRa Responds
              </p>
            </div>
          </header>
        </div>

        {/* ============================================================ */}
        {/* DESKTOP ONLY — ActionPanel right side                        */}
        {/* ============================================================ */}
        <div className="hidden md:block absolute md:top-6 md:left-auto md:right-6 md:bottom-20 md:w-[400px] overflow-y-auto scrollbar-hide pointer-events-auto z-40">
          <ActionPanel />
        </div>

        {/* ============================================================ */}
        {/* MOBILE ONLY — ActionPanel scrollable middle zone             */}
        {/* ============================================================ */}
        <div className="md:hidden absolute top-[15%] left-2 right-2 bottom-[155px] overflow-y-auto scrollbar-hide pointer-events-auto z-40 px-2">
          <ActionPanel />
        </div>

        {/* HelpBar — Centered Command Module for 3.0 */}
        <div className="absolute bottom-[20px] left-2 right-2 md:bottom-12 md:left-1/2 md:-translate-x-1/2 md:w-[600px] lg:w-[800px] pointer-events-auto z-50">
          <HelpBar />
        </div>

      </div>
    </main>
  );
}