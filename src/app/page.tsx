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

        {/* ============================================================ */}
        {/* HEADER / LOGO                                                */}
        {/* ============================================================ */}
        <div className="absolute top-2 left-2 md:top-6 md:left-6 pointer-events-auto z-50">
          <header className="flex items-center gap-2 md:gap-4">
            <div className="w-11 h-11 md:w-20 md:h-20 flex items-center justify-center overflow-hidden drop-shadow-[0_0_15px_rgba(220,38,38,0.6)] hover:scale-105 transition-transform">
              <img
                src="/logo.png"
                alt="ChayRa AI"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-2xl md:text-5xl drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] flex items-center gap-1 md:gap-2">
                <span className="text-white font-bold">
                  ChayRa
                </span>
                <span className="text-red-600 font-bold">
                  AI
                </span>
              </h1>

              <p className="text-white/90 text-[8px] md:text-[12px] tracking-[0.05em] md:tracking-[0.1em] mt-0.5 md:mt-3 drop-shadow-[0_0_5px_rgba(0,0,0,0.8)]">
                When the World Breaks, ChayRa Responds
              </p>
            </div>
          </header>
        </div>

        {/* ============================================================ */}
        {/* DESKTOP — KEEP EXISTING LAYOUT UNCHANGED                     */}
        {/* ============================================================ */}
        <div className="hidden md:block absolute top-6 right-6 bottom-20 w-[400px] overflow-y-auto scrollbar-hide pointer-events-auto z-40">
          <ActionPanel />
        </div>

        {/* ============================================================ */}
        {/* MOBILE — COMPACT FLOATING COMMAND PANEL                     */}
        {/* ============================================================ */}
        <div
          className="
            md:hidden
            absolute
            top-[76px]
            left-2
            right-2
            h-[38vh]
            max-h-[300px]
            overflow-y-auto
            overscroll-contain
            scrollbar-hide
            pointer-events-auto
            z-40
            px-1
          "
        >
          <ActionPanel />
        </div>

        {/* ============================================================ */}
        {/* HELPBAR                                                      */}
        {/* Mobile: fixed low so the map remains visible in the center. */}
        {/* Desktop: existing layout is untouched.                       */}
        {/* ============================================================ */}
        <div
          className="
            absolute
            bottom-2
            left-2
            right-2
            md:bottom-6
            md:left-6
            md:right-[440px]
            md:w-auto
            pointer-events-auto
            z-50
          "
        >
          <HelpBar />
        </div>

      </div>
    </main>
  );
}