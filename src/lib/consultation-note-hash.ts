/**
 * Canonical hashing for consultation notes — used to bind an
 * e-signature to the exact content the doctor signed. If a future
 * write changes any clinical field, recomputing the hash will not
 * match `signedContentHash` and the signature is provably broken.
 *
 * The fields included here are the patient-visible / clinically-
 * meaningful ones. Metadata (id, timestamps, signer, etc.) is
 * deliberately excluded so re-saving the same content with a new
 * `updatedAt` doesn't invalidate the signature.
 *
 * Canonicalization is JSON.stringify with sorted keys so the same
 * object always produces the same byte sequence regardless of
 * insertion order.
 */
import { createHash } from "crypto";

export interface ConsultationNoteContent {
  chiefComplaint?: string | null;
  symptoms?: string | null;
  examination?: string | null;
  skinAssessment?: string | null;
  affectedAreas?: string[] | null;
  conditionSeverity?: string | null;
  diagnosis?: string | null;
  differentialDx?: string | null;
  treatmentPlan?: string | null;
  advice?: string | null;
  internalNotes?: string | null;
  followUpDate?: Date | string | null;
  followUpNotes?: string | null;
}

const CLINICAL_FIELDS: Array<keyof ConsultationNoteContent> = [
  "chiefComplaint",
  "symptoms",
  "examination",
  "skinAssessment",
  "affectedAreas",
  "conditionSeverity",
  "diagnosis",
  "differentialDx",
  "treatmentPlan",
  "advice",
  "internalNotes",
  "followUpDate",
  "followUpNotes",
];

function normalize(v: unknown): unknown {
  if (v == null) return null;
  // Normalize Date and ISO date strings to a canonical ISO form so
  // the hash doesn't drift between Prisma's Date object and the same
  // value re-read from JSON.
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  return v;
}

/** Canonical JSON of the clinical fields, sorted by key. */
export function canonicalizeNote(note: ConsultationNoteContent): string {
  const obj: Record<string, unknown> = {};
  for (const k of CLINICAL_FIELDS) {
    obj[k] = normalize(note[k] ?? null);
  }
  // Stringify with sorted keys (the array is already in canonical
  // order since CLINICAL_FIELDS is the source of truth).
  return JSON.stringify(obj);
}

/** SHA-256 of the canonicalized note content, lowercase hex. */
export function hashNote(note: ConsultationNoteContent): string {
  return createHash("sha256").update(canonicalizeNote(note)).digest("hex");
}

/**
 * Snapshot a note for the revisions table. Captures the clinical
 * fields plus enough metadata for an audit reader to reconstruct
 * "what was signed when". Excludes `id` since the snapshot lives
 * inside a revisions row that already references it.
 */
export function snapshotNote(note: ConsultationNoteContent & {
  isSigned?: boolean;
  signedAt?: Date | string | null;
  signedById?: string | null;
}): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const k of CLINICAL_FIELDS) {
    snap[k] = normalize(note[k] ?? null);
  }
  snap.isSigned = !!note.isSigned;
  snap.signedAt = note.signedAt ? normalize(note.signedAt) : null;
  snap.signedById = note.signedById ?? null;
  return snap;
}
