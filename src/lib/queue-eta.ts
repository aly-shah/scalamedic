/**
 * Rule-based queue ETA.
 *
 * For every WAITING appointment, estimate when the doctor will see
 * them based on:
 *   1. How long the in-progress consultation has already been running
 *      (compared to its scheduled duration)
 *   2. The scheduled durationMinutes of every WAITING / IN_PROGRESS
 *      appointment ahead of them
 *
 * This is intentionally NOT machine-learned. Once we have a few
 * thousand consultations of historical data, a per-doctor / per-
 * appointment-type model can replace the rule, but rule-based gives
 * a usefully accurate number from day one and is transparent — the
 * doctor can mentally verify "yes, two patients ahead, ~30 min"
 * matches the displayed ETA.
 *
 * Interface:
 *   - Pass in today's appointments for one doctor (or branch).
 *   - Returns Map<appointmentId, etaMinutes> for WAITING rows only.
 *
 * Sort order: appointments are processed in start-time order so an
 * "early" WAITING patient is correctly counted ahead of a "late"
 * WAITING patient even if both checked in at random times.
 */

export interface QueueAppt {
  id: string;
  startTime: string;        // "HH:MM"
  durationMinutes?: number; // schema field, range 5-480
  type?: string;
  status: string;           // SCHEDULED / CHECKED_IN / IN_PROGRESS / COMPLETED / etc.
  workflowStage?: string;
  checkInAt?: string | null;
}

/** Default consultation length when an appointment is missing
 *  durationMinutes (data drift; should be rare). */
const DEFAULT_CONSULT_MINUTES = 15;

/**
 * @param appts  Today's appointments (one doctor or one branch)
 * @param now    Current wall time. Pass for testing; defaults to Date.now().
 * @returns A map of appointmentId → minutes-until-seen for WAITING rows.
 */
export function computeQueueEta(appts: QueueAppt[], now: number = Date.now()): Map<string, number> {
  const eta = new Map<string, number>();

  // Find the in-progress visit. There's typically zero or one per
  // doctor; if multiple (data anomaly) we treat the earliest as the
  // active one.
  const inProgress = appts
    .filter((a) => a.status === "IN_PROGRESS")
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  // Estimate remaining time on the in-progress visit. If the visit
  // has been running shorter than its scheduled length, the
  // remainder is positive; if it's already over-running, treat as 0
  // (the next slot is "imminent" rather than negative).
  let cursorMinutes = 0;
  if (inProgress) {
    const planned = inProgress.durationMinutes ?? DEFAULT_CONSULT_MINUTES;
    const startedAt = inProgress.checkInAt
      ? new Date(inProgress.checkInAt).getTime()
      : null;
    if (startedAt) {
      const minutesElapsed = (now - startedAt) / 60000;
      cursorMinutes = Math.max(0, planned - minutesElapsed);
    } else {
      // Fallback: treat the in-progress visit as half-done.
      cursorMinutes = Math.max(0, planned / 2);
    }
  }

  // Process WAITING rows in clinic-time order. CHECKED_IN is the
  // canonical waiting status the rest of the app uses, but some
  // deployments also use plain WAITING — accept both.
  const waiting = appts
    .filter((a) => a.status === "CHECKED_IN" || a.status === "WAITING")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const a of waiting) {
    eta.set(a.id, Math.round(cursorMinutes));
    cursorMinutes += a.durationMinutes ?? DEFAULT_CONSULT_MINUTES;
  }

  return eta;
}

/** Format a minutes ETA for display: "now" / "5m" / "1h 10m". */
export function formatEta(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m <= 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Tone for an ETA pill. Mirrors waitColor() but for forward-looking time. */
export function etaTone(minutes: number): string {
  if (minutes <= 5) return "bg-emerald-100 text-emerald-700";
  if (minutes <= 20) return "bg-blue-100 text-blue-700";
  if (minutes <= 45) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}
