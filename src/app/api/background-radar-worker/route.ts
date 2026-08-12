import { NextResponse } from 'next/server';
import { scanGlobalThreats } from '@/core/agents/radar';
import { EnterpriseAgentRegistry } from '@/core/adk/registry';
import { PredictiveMemoryBank } from '@/core/adk/memory';

import '@/core/agents/mindguard';

export async function GET() {
  console.log(
    '[Autonomous Runtime]: Starting scheduled perimeter scan...'
  );

  try {
    const threats = await scanGlobalThreats();

    if (!threats || threats.length === 0) {
      console.log(
        '[Autonomous Runtime]: No active threats detected.'
      );

      return NextResponse.json({
        success: true,
        activeThreats: 0,
        message: 'Background scan completed with no active threats.',
      });
    }

    const topThreat = threats[0];

    const mindguard =
      EnterpriseAgentRegistry.getAgent('MindGuard');

    if (!mindguard) {
      throw new Error(
        '[Autonomous Runtime] MindGuard unavailable.'
      );
    }

    const securityCheck =
      await mindguard({
        input: topThreat.name,
      });

    if (
      securityCheck.securityStatus === 'BLOCKED'
    ) {
      console.warn(
        '[Autonomous Runtime]: Threat input blocked by Model Armor.'
      );

      return NextResponse.json({
        success: true,
        activeThreats: threats.length,
        securityStatus: 'BLOCKED',
        threats,
      });
    }

    if (
      securityCheck.securityStatus !== 'CLEARED'
    ) {
      console.warn(
        '[Autonomous Runtime]: Security gateway degraded.'
      );

      return NextResponse.json({
        success: true,
        activeThreats: threats.length,
        securityStatus: 'DEGRADED',
        threats,
      });
    }

    await PredictiveMemoryBank.saveSituationState(
      'global_background_watch',
      {
        lastThreat: topThreat.name,
        location: {
          lat: topThreat.lat,
          lng: topThreat.lng,
        },
        type: topThreat.type,
        status: 'Autonomously logged by Agent Runtime',
        timestamp: new Date().toISOString(),
      }
    );

    console.log(
      `[Autonomous Runtime]: Threat logged → ${topThreat.name}`
    );

    return NextResponse.json({
      success: true,
      activeThreats: threats.length,
      securityStatus: 'CLEARED',
      threats,
    });

  } catch (error) {
    console.error(
      '[Autonomous Runtime]: Scheduled scan failed.',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Autonomous execution failed.',
      },
      { status: 500 }
    );
  }
}