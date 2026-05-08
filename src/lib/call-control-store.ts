/**
 * Per-agent FIFO queue of pending phone-control commands.
 *
 * The dashboard's live-call card exposes Answer / Hang up / Click-to-dial
 * buttons. Each click POSTs a command to /api/calls/control/[agentId];
 * the agent's Android phone short-polls /api/calls/control/poll every
 * few seconds, drains its queue, and executes via TelecomManager.
 *
 * In-memory by design: same single-pm2-process model as the rest of the
 * call-center state. Commands have a ~10s shelf life — anything older
 * is discarded so a phone that re-connects after a long outage doesn't
 * fire a stale "Answer" against a different call.
 */

export type ControlAction = "answer" | "hangup" | "dial";

export interface ControlCommand {
  id: string;
  action: ControlAction;
  number?: string; // only used for "dial"
  ts: number;
}

const MAX_QUEUE = 5;
const COMMAND_TTL_MS = 10_000;

const queues: Map<string, ControlCommand[]> = new Map();

export function pushControl(agentId: string, cmd: Omit<ControlCommand, "id" | "ts">): ControlCommand {
  const full: ControlCommand = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    action: cmd.action,
    number: cmd.number,
  };
  const cur = queues.get(agentId) ?? [];
  cur.push(full);
  if (cur.length > MAX_QUEUE) cur.splice(0, cur.length - MAX_QUEUE);
  queues.set(agentId, cur);
  return full;
}

/** Pop everything currently queued for this agent. Stale (TTL'd) commands
 *  are filtered out so a phone that's been offline doesn't execute
 *  buttons clicked minutes ago. */
export function drainControl(agentId: string): ControlCommand[] {
  const cur = queues.get(agentId);
  if (!cur || cur.length === 0) return [];
  queues.delete(agentId);
  const cutoff = Date.now() - COMMAND_TTL_MS;
  return cur.filter((c) => c.ts >= cutoff);
}
