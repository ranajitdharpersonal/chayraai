import { AgentRegistryStore } from './registry-store';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

const REGISTERED_AGENTS = [
  'MindGuard',
  'Scavenger',
  'Radar',
  'Medical',
  'Navigator',
  'PublicHealth',
  'Verifier',
] as const;

let heartbeatStarted = false;

function isRuntimeEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    return false;
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  // Cloud Run / Node runtime only.
  return (
    process.env.NEXT_RUNTIME === 'nodejs' ||
    !!process.env.K_SERVICE
  );
}

export function startAgentRegistryHeartbeat(): void {
  if (heartbeatStarted) {
    return;
  }

  if (!isRuntimeEnvironment()) {
    return;
  }

  heartbeatStarted = true;

  const sendHeartbeats = async (): Promise<void> => {
    try {
      await Promise.all(
        REGISTERED_AGENTS.map(
          (agentName) =>
            AgentRegistryStore.heartbeat(
              agentName
            )
        )
      );

      console.log(
        `[Agent Registry]: Fleet heartbeat updated for ${REGISTERED_AGENTS.length} agents.`
      );
    } catch (error) {
      console.error(
        '[Agent Registry]: Fleet heartbeat cycle failed.',
        error
      );
    }
  };

  void sendHeartbeats();

  setInterval(
    () => {
      void sendHeartbeats();
    },
    HEARTBEAT_INTERVAL_MS
  );

  console.log(
    '[Agent Registry]: Autonomous fleet heartbeat started.'
  );
}