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

export function startAgentRegistryHeartbeat() {
  if (heartbeatStarted) {
    return;
  }

  heartbeatStarted = true;

  const sendHeartbeats = async () => {
    await Promise.all(
      REGISTERED_AGENTS.map((agentName) =>
        AgentRegistryStore.heartbeat(agentName)
      )
    );

    console.log(
      `[Agent Registry]: Fleet heartbeat updated for ${REGISTERED_AGENTS.length} agents.`
    );
  };

  // Initial heartbeat
  void sendHeartbeats();

  // Keep the registry lifecycle state fresh.
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