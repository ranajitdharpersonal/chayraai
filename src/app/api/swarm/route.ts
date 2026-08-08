import { NextResponse } from 'next/server';
import { EnterpriseAgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

// Force load ALL agents into the Registry before using them
import '@/core/agents/mindguard';
import '@/core/agents/scavenger';
import '@/core/agents/radar';
import '@/core/agents/medical';
import '@/core/agents/navigator';
import '@/core/agents/vault';
import '@/core/agents/verifier';

export async function POST(req: Request) {
  try {
    const { message, coords, sessionId } = await req.json();
    console.log(`[Swarm Orchestrator]: Received crisis input -> "${message}"`);

    // 1. Model Armor (MindGuard) - Check for spam/pranks
    const mindguard = EnterpriseAgentRegistry.getAgent('MindGuard');
    if (!mindguard) throw new Error("MindGuard offline.");
    const mgResult = await mindguard({ input: message });
    
    if (!mgResult.isEmergency && !mgResult.reason.includes("Fallback")) {
      return NextResponse.json({ type: 'spam', message: mgResult.reason });
    }

    // 2. Scavenger - Extract Threat Level & Category
    const scavenger = EnterpriseAgentRegistry.getAgent('Scavenger');
    if (!scavenger) throw new Error("Scavenger offline.");
    const scavResult = await scavenger({ input: message });

    // 3. Radar - Fetch Tactical Intel
    const radar = EnterpriseAgentRegistry.getAgent('Radar');
    if (!radar) throw new Error("Radar offline.");
    const radarIntel = await radar({ input: message });

    // 4. Parallel Agent Execution (Only call what's needed)
    let medicalData = null, navData = null, vaultData = null;
    
    const agentPromises: Promise<void>[] = [];

    if (scavResult.requiredAgents.includes("Medical")) {
       const medical = EnterpriseAgentRegistry.getAgent('Medical');
       if (medical) agentPromises.push(medical({ input: message }).then((res: any) => { medicalData = res; }));
    }
    if (scavResult.requiredAgents.includes("Navigator")) {
       const navigator = EnterpriseAgentRegistry.getAgent('Navigator');
       if (navigator) agentPromises.push(navigator({ input: message, userCoords: coords }).then((res: any) => { navData = res; }));
    }
    if (scavResult.requiredAgents.includes("Vault")) {
       const vault = EnterpriseAgentRegistry.getAgent('Vault');
       if (vault) agentPromises.push(vault({ input: message }).then((res: any) => { vaultData = res; }));
    }

    await Promise.all(agentPromises);

    // 5. Verifier - Cross-Check for the "Real Evidence Panel"
    const verifier = EnterpriseAgentRegistry.getAgent('Verifier');
    let evidencePanel = null;
    if (verifier) {
       evidencePanel = await verifier({ input: message, radarIntel: radarIntel });
    }

    // 6. Memory Bank - Commit State to Firestore
    const activeSession = sessionId || 'default-session';
    await PredictiveMemoryBank.saveSituationState(activeSession, {
      lastInput: message,
      threatLevel: scavResult.threatLevel,
      intel: radarIntel,
      timestamp: new Date().toISOString()
    });

    // 7. Deliver the Unified Payload to the Frontend
    return NextResponse.json({
      type: 'success',
      threatLevel: scavResult.threatLevel,
      radarIntel: radarIntel,
      medical: medicalData,
      navigation: navData,
      vault: vaultData,
      evidence: evidencePanel
    });

  } catch (error: any) {
    console.error("[Swarm Orchestrator]: Critical Failure", error);
    return NextResponse.json({ type: 'error', message: error.message || "Unknown Swarm Error" }, { status: 500 });
  }
}