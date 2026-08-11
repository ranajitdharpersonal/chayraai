import { NextResponse } from 'next/server';
import { EnterpriseAgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

import '@/core/agents/mindguard';
import '@/core/agents/scavenger';
import '@/core/agents/radar';
import '@/core/agents/medical';
import '@/core/agents/navigator';
import '@/core/agents/verifier';
import '@/core/agents/publicHealth';

export async function POST(req: Request) {
  try {
    const { message, coords, sessionId } = await req.json();

    const mindguard = EnterpriseAgentRegistry.getAgent('MindGuard');
    if (!mindguard) throw new Error("MindGuard offline.");
    const mgResult = await mindguard({ input: message });
    if (!mgResult.isEmergency && !mgResult.reason.includes("Fallback")) {
      return NextResponse.json({ type: 'spam', message: mgResult.reason });
    }

    const scavenger = EnterpriseAgentRegistry.getAgent('Scavenger');
    if (!scavenger) throw new Error("Scavenger offline.");
    const scavResult = await scavenger({ input: message });

    const radar = EnterpriseAgentRegistry.getAgent('Radar');
    if (!radar) throw new Error("Radar offline.");
    const radarIntel = await radar({ input: message });

    // Parallel Execution (Adding PublicHealth into the loop!)
    let medicalData: any = null, navData: any = null, healthData: any = null;
    const agentPromises: Promise<void>[] = [];

    if (scavResult.requiredAgents.includes("Medical")) {
       const medical = EnterpriseAgentRegistry.getAgent('Medical');
       if (medical) agentPromises.push(medical({ input: message }).then((res: any) => { medicalData = res; }));
    }
    if (scavResult.requiredAgents.includes("Navigator")) {
       const navigator = EnterpriseAgentRegistry.getAgent('Navigator');
       if (navigator) agentPromises.push(navigator({ input: message, userCoords: coords }).then((res: any) => { navData = res; }));
    }
    
    // Always trigger Public Health for the Dashboard sync
    const publicHealth = EnterpriseAgentRegistry.getAgent('PublicHealth');
    if (publicHealth) {
       agentPromises.push(publicHealth({ location: "Global" }).then((res: any) => { healthData = res; }));
    }

    await Promise.all(agentPromises);

    const verifier = EnterpriseAgentRegistry.getAgent('Verifier');
    let evidencePanel = null;
    if (verifier) {
       evidencePanel = await verifier({ input: message, radarIntel: radarIntel });
    }

    const activeSession = sessionId || 'default-session';
    await PredictiveMemoryBank.saveSituationState(activeSession, {
      lastInput: message,
      threatLevel: scavResult.threatLevel,
      intel: radarIntel,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      type: 'success',
      threatLevel: scavResult.threatLevel,
      radarIntel: radarIntel,
      medical: medicalData,
      navigation: navData,
      evidence: evidencePanel,
      // 🛑 Pushing the real health data to the UI!
      healthAdvisory: healthData?.healthAdvisory,
      outbreakReports: healthData?.outbreakReports
    });

  } catch (error: any) {
    console.error("[Swarm Orchestrator]: Critical Failure", error);
    return NextResponse.json({ type: 'error', message: error.message || "Unknown Swarm Error" }, { status: 500 });
  }
}