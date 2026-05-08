/**
 * AI Suggestion audit helpers.
 *
 * Phase 1's Ambient AI Scribe v2 will produce structured
 * suggestions (proposed medications, lab orders, follow-ups, etc.)
 * that the doctor sees as clickable affordances. Every suggestion
 * is recorded BEFORE the doctor sees it via `recordSuggestion()`,
 * and resolved AFTER the doctor decides via `resolveSuggestion()`.
 *
 * The schema persists the model id + prompt version with each row,
 * so future audits can answer "what did the AI propose six months
 * ago when it was on a different model?" without ambiguity.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, AISuggestionKind, AISuggestionStatus } from "@prisma/client";

export interface RecordSuggestionInput {
  kind: AISuggestionKind;
  doctorId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  transcriptionId?: string | null;
  payload: Prisma.InputJsonValue;
  modelId: string;
  promptVersion: string;
}

/**
 * Record a fresh AI suggestion. Always status=PENDING; the doctor's
 * decision is captured later via resolveSuggestion().
 */
export async function recordSuggestion(input: RecordSuggestionInput) {
  return prisma.aISuggestion.create({
    data: {
      kind: input.kind,
      doctorId: input.doctorId,
      patientId: input.patientId ?? null,
      appointmentId: input.appointmentId ?? null,
      transcriptionId: input.transcriptionId ?? null,
      payload: input.payload,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
    },
  });
}

/**
 * Bulk-record suggestions (one transcription typically yields a
 * few proposals; fewer round-trips). Returns the created rows.
 */
export async function recordSuggestionsBatch(inputs: RecordSuggestionInput[]) {
  if (inputs.length === 0) return [];
  // createMany doesn't return rows, and we want the ids back so the
  // client can reference them when accepting. Use an interactive
  // transaction with parallel creates.
  return prisma.$transaction(inputs.map((i) => prisma.aISuggestion.create({
    data: {
      kind: i.kind,
      doctorId: i.doctorId,
      patientId: i.patientId ?? null,
      appointmentId: i.appointmentId ?? null,
      transcriptionId: i.transcriptionId ?? null,
      payload: i.payload,
      modelId: i.modelId,
      promptVersion: i.promptVersion,
    },
  })));
}

export interface ResolveSuggestionInput {
  id: string;
  decidedById: string;
  status: Extract<AISuggestionStatus, "ACCEPTED" | "REJECTED" | "EXPIRED">;
  acceptedEntityType?: string;
  acceptedEntityId?: string;
  rejectionReason?: string | null;
}

/**
 * Mark a suggestion as ACCEPTED / REJECTED / EXPIRED. When
 * accepting, pass `acceptedEntityType` + `acceptedEntityId` so the
 * audit trail can link suggestion → real clinical record.
 */
export async function resolveSuggestion(input: ResolveSuggestionInput) {
  return prisma.aISuggestion.update({
    where: { id: input.id },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decidedById: input.decidedById,
      acceptedEntityType: input.acceptedEntityType ?? null,
      acceptedEntityId: input.acceptedEntityId ?? null,
      rejectionReason: input.rejectionReason ?? null,
    },
  });
}

/** Stable identifier for the structurer prompt. Bump on any change. */
export const PROMPT_VERSIONS = {
  TRANSCRIBE_STRUCTURER_V1: "transcribe-structurer-v1",
  // Ambient AI Scribe — extends the v1 structurer to also extract
  // proposed medications / labs / follow-ups so the doctor sees
  // tappable proposals instead of having to retype.
  AMBIENT_SCRIBE_V1: "ambient-scribe-v1",
  // Continuity Briefing — a 1-2 sentence summary of the patient's
  // recent clinical activity, rendered at the top of the patient
  // profile when the doctor opens it. Extractive, never inferential.
  CONTINUITY_BRIEFING_V1: "continuity-briefing-v1",
} as const;

/** Default model for Ambient AI extractions. Centralized so a model
 *  bump is a single-line change and the audit row records it. */
export const AMBIENT_MODEL_ID = "gpt-4o-mini";

/**
 * Prompt body for Ambient AI Scribe v1. Returned by getter so the
 * route + the audit log can both reference the same canonical
 * string. If you change the prompt, bump AMBIENT_SCRIBE_V1 in the
 * version map first — the audit tail must always reflect what the
 * model actually saw.
 */
export const AMBIENT_SYSTEM_PROMPT = `You are an ambient clinical scribe for a dermatology clinic.
The doctor is dictating during a patient consultation. Convert the raw transcript into a structured clinical note PLUS a list of tappable proposals the doctor will accept or reject.

Output JSON with this exact shape:
{
  "chiefComplaint": "string or null",
  "findings": "string or null",
  "diagnosis": "string or null",
  "plan": "string or null",
  "summary": "string or null",
  "proposedMedications": [
    { "medicineName": "string", "dosage": "string or null", "frequency": "string or null", "duration": "string or null", "route": "string or null", "indication": "string or null" }
  ],
  "proposedLabs": [
    { "testName": "string", "testCode": "string or null", "indication": "string or null" }
  ],
  "proposedFollowUps": [
    { "reason": "string", "days": "integer or null" }
  ]
}

Rules:
- Only extract proposals the doctor explicitly mentioned. Do NOT invent, suggest alternatives, or use clinical judgment beyond what was said.
- If the doctor said "let's start tretinoin 0.025 percent at night" — proposedMedications gets one row.
- If the doctor said "we should check her LFT" — proposedLabs gets one row.
- If the doctor said "see her in two weeks" — proposedFollowUps gets one row with days=14.
- If nothing was proposed in a category, return an empty array (not null).
- Doses, frequencies, durations should be normalized: "BD" not "twice daily", "10 days" not "ten days", "Topical" not "on the skin".
- Use null for any field not mentioned. Do not infer.`;
