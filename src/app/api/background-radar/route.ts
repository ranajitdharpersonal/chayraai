import { NextResponse } from 'next/server';
import { scanGlobalThreats } from '@/core/agents/radar';
import { AgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

// 🛑 NEW: Force load MindGuard into the Registry
import '@/core/agents/mindguard';

// ==========================================
// PHASE 4: THE 24/7 AUTONOMOUS AGENT RUNTIME
// ==========================================
// This endpoint is designed to be triggered asynchronously by a background scheduler
export async function GET(request: Request) {
  console.log("[Autonomous Engine]: Initiating background perimeter scan...");

  try {
    // 1. Fetch live global threats (NASA, USGS, War Zones)
    const threats = await scanGlobalThreats();

    // 2. Process the top threat autonomously without any human interaction
    if (threats && threats.length > 0) {
       const topThreat = threats[0]; // Picking the most immediate threat for the demo
       
       // Dynamically load MindGuard from the Enterprise Registry
       const mindguardFlow = AgentRegistry.getAgent('MindGuard');
       
       // Run the threat through our Model Armor
       const securityCheck = await mindguardFlow({ 
         input: topThreat.name 
       });

       if (securityCheck.isEmergency) {
         // 3. Save to Persistent Predictive Memory autonomously
         await PredictiveMemoryBank.saveSituationState('global_background_watch', {
           lastThreat: topThreat.name,
           location: { lat: topThreat.lat, lng: topThreat.lng },
           type: topThreat.type,
           status: 'Autonomously logged by Agent Runtime'
         });
         
         console.log(`[Autonomous Engine]: Critical threat automatically logged -> ${topThreat.name}`);
       }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Autonomous background scan complete", 
      activeThreats: threats.length 
    });

  } catch (error) {
    console.error("[Autonomous Engine]: Background cycle failed.", error);
    return NextResponse.json({ success: false, error: "Autonomous execution failed" }, { status: 500 });
  }
}