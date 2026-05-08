/**
 * @system MediCore ERP — AI Transcription (OpenAI Whisper)
 * @route POST /api/ai/transcribe — Transcribe audio or process text into structured notes
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireFeature } from "@/lib/feature-gate";
import {
  AMBIENT_MODEL_ID,
  AMBIENT_SYSTEM_PROMPT,
  PROMPT_VERSIONS,
  recordSuggestionsBatch,
} from "@/lib/ai-suggestion";
import type { Prisma } from "@prisma/client";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface AmbientProposal {
  medicineName?: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  testName?: string;
  testCode?: string | null;
  reason?: string;
  days?: number | null;
  indication?: string | null;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    // Plan gate first — FREE tenants don't get AI transcription.
    // Returns 402 with the missing feature so the client can show
    // an upgrade prompt instead of a confusing error.
    const planGate = await requireFeature(auth.user.id, "AI_TRANSCRIPTION");
    if (planGate) return planGate;

    // Rate limit BEFORE doing any expensive work. A compromised
    // session shouldn't be able to burn through OpenAI credits.
    const rl = checkRateLimit(auth.user.id, RATE_LIMITS.AI_INFERENCE);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Too many AI requests. Try again in ${rl.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const contentType = request.headers.get("content-type") || "";

    // Handle multipart (audio file upload)
    if (contentType.includes("multipart/form-data")) {
      return handleAudioTranscription(request);
    }

    // Handle JSON (text-based or record creation)
    const body = await request.json();
    const { appointmentId, patientId, doctorId, text } = body;

    // If text provided, structure it with AI
    if (text && OPENAI_API_KEY) {
      return structureNoteWithAI(text, appointmentId, patientId, doctorId);
    }

    // Return existing transcription if available
    if (appointmentId) {
      const existing = await prisma.aITranscription.findFirst({
        where: { appointmentId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return NextResponse.json({ success: true, data: existing });
    }

    // Create placeholder record
    const transcription = await prisma.aITranscription.create({
      data: {
        appointmentId, patientId, doctorId,
        rawTranscript: text || "Awaiting transcription...",
        structuredNote: text ? extractStructure(text) : { chiefComplaint: "Pending", findings: "Pending", plan: "Pending" },
        summary: text ? text.substring(0, 200) : "Transcription pending.",
        status: text ? "COMPLETED" : "PROCESSING",
        duration: body.duration || null,
        language: body.language || "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: transcription }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/ai/transcribe", error);
    return NextResponse.json({ success: false, error: "Failed to transcribe" }, { status: 500 });
  }
}

// Handle actual audio file transcription via Whisper
async function handleAudioTranscription(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const appointmentId = formData.get("appointmentId") as string | null;
    const patientId = formData.get("patientId") as string | null;
    const doctorId = formData.get("doctorId") as string | null;

    if (!audioFile) {
      return NextResponse.json({ success: false, error: "No audio file" }, { status: 400 });
    }

    let transcript = "";

    if (OPENAI_API_KEY) {
      // Real Whisper transcription
      const whisperForm = new FormData();
      whisperForm.append("file", audioFile);
      whisperForm.append("model", "whisper-1");
      whisperForm.append("language", "en");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        transcript = (whisperData.text || "").trim();
      } else {
        const errBody = await whisperRes.text().catch(() => "");
        logger.error("Whisper API error", errBody);
        return NextResponse.json({ success: false, error: "Transcription service error" }, { status: 502 });
      }
    } else {
      // Without an API key we'd write a placeholder that violates the
      // _nonempty CHECKs in the worst case, AND silently let the
      // doctor think the recording transcribed when it didn't. Bail
      // out instead so the toast surfaces the real reason.
      return NextResponse.json(
        { success: false, error: "Transcription not configured (OPENAI_API_KEY missing)" },
        { status: 503 },
      );
    }

    // Empty/whitespace-only transcript means Whisper heard nothing —
    // silence, far-field noise, or a non-English burst. Fail loudly
    // so the doctor knows to retry, and skip the DB write entirely:
    // an empty rawTranscript would violate the _nonempty CHECK and
    // surface as a generic 500.
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "No speech detected — try again, closer to the mic" },
        { status: 422 },
      );
    }

    // Structure the transcript with the Ambient AI Scribe v1 prompt.
    // Returns SOAP fields PLUS arrays of proposed medications, labs,
    // and follow-ups that the doctor will accept/reject in the UI.
    let structuredNote: Record<string, unknown> = extractStructure(transcript);
    let summary = transcript.length > 200 ? transcript.slice(0, 200) : transcript;
    let proposedMedications: AmbientProposal[] = [];
    let proposedLabs: AmbientProposal[] = [];
    let proposedFollowUps: AmbientProposal[] = [];

    if (OPENAI_API_KEY && transcript.length > 20) {
      try {
        const structRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: AMBIENT_MODEL_ID,
            messages: [
              { role: "system", content: AMBIENT_SYSTEM_PROMPT },
              { role: "user", content: transcript },
            ],
            response_format: { type: "json_object" },
            max_tokens: 900,
            temperature: 0.2,
          }),
        });
        if (structRes.ok) {
          const structData = await structRes.json();
          const parsed = JSON.parse(structData.choices[0].message.content);
          // Keep the SOAP fields on the structuredNote object for
          // backwards compatibility with everything that already
          // reads structuredNote.chiefComplaint et al.
          structuredNote = {
            chiefComplaint: parsed.chiefComplaint ?? null,
            findings: parsed.findings ?? null,
            diagnosis: parsed.diagnosis ?? null,
            plan: parsed.plan ?? null,
            summary: parsed.summary ?? null,
          };
          summary = parsed.summary || transcript.substring(0, 200);
          proposedMedications = Array.isArray(parsed.proposedMedications) ? parsed.proposedMedications : [];
          proposedLabs = Array.isArray(parsed.proposedLabs) ? parsed.proposedLabs : [];
          proposedFollowUps = Array.isArray(parsed.proposedFollowUps) ? parsed.proposedFollowUps : [];
        }
      } catch { /* fallback to basic extraction */ }
    }

    if (!appointmentId || !patientId || !doctorId) {
      // No persistence path → no AISuggestion rows either; return the
      // proposals in the response so the doctor app can still render
      // them as ephemeral chips.
      return NextResponse.json({
        success: true,
        data: {
          rawTranscript: transcript,
          structuredNote,
          summary,
          status: "COMPLETED",
          proposedMedications,
          proposedLabs,
          proposedFollowUps,
          suggestions: [],
        },
      });
    }

    // Save to database
    const record = await prisma.aITranscription.create({
      data: {
        appointmentId,
        patientId,
        doctorId,
        rawTranscript: transcript,
        structuredNote: structuredNote as Prisma.InputJsonValue,
        summary,
        status: "COMPLETED",
        duration: Math.round(audioFile.size / 16000), // rough estimate
        language: "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    // Record one AISuggestion row per AI-proposed item BEFORE the
    // doctor sees it. Each row becomes the audit trail for the
    // accept/reject decision the doctor makes in the UI. Failure
    // here is non-fatal — the transcription succeeded and we'd
    // rather return the proposals than 500 the whole call.
    let createdSuggestions: Array<{ id: string; kind: string; payload: Prisma.JsonValue }> = [];
    try {
      const inputs = [
        ...proposedMedications.filter((m) => m.medicineName).map((m) => ({
          kind: "MEDICATION" as const,
          doctorId,
          patientId,
          appointmentId,
          transcriptionId: record.id,
          payload: m as unknown as Prisma.InputJsonValue,
          modelId: AMBIENT_MODEL_ID,
          promptVersion: PROMPT_VERSIONS.AMBIENT_SCRIBE_V1,
        })),
        ...proposedLabs.filter((l) => l.testName).map((l) => ({
          kind: "LAB" as const,
          doctorId,
          patientId,
          appointmentId,
          transcriptionId: record.id,
          payload: l as unknown as Prisma.InputJsonValue,
          modelId: AMBIENT_MODEL_ID,
          promptVersion: PROMPT_VERSIONS.AMBIENT_SCRIBE_V1,
        })),
        ...proposedFollowUps.filter((f) => f.reason).map((f) => ({
          kind: "FOLLOWUP" as const,
          doctorId,
          patientId,
          appointmentId,
          transcriptionId: record.id,
          payload: f as unknown as Prisma.InputJsonValue,
          modelId: AMBIENT_MODEL_ID,
          promptVersion: PROMPT_VERSIONS.AMBIENT_SCRIBE_V1,
        })),
      ];
      const rows = await recordSuggestionsBatch(inputs);
      createdSuggestions = rows.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload }));
    } catch (e) {
      logger.error("Failed to persist AI suggestions", e);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        proposedMedications,
        proposedLabs,
        proposedFollowUps,
        suggestions: createdSuggestions,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Audio transcription failed", error);
    return NextResponse.json({ success: false, error: "Transcription failed" }, { status: 500 });
  }
}

// Structure raw text into clinical note with AI
async function structureNoteWithAI(text: string, appointmentId?: string, patientId?: string, doctorId?: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Structure this doctor's note into clinical format. Output JSON: {\"chiefComplaint\": \"\", \"findings\": \"\", \"diagnosis\": \"\", \"plan\": \"\", \"summary\": \"\"}" },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500, temperature: 0.3,
      }),
    });

    let structured = extractStructure(text);
    let summary = text.substring(0, 200);

    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      structured = parsed;
      summary = parsed.summary || summary;
    }

    if (!appointmentId || !patientId || !doctorId) {
      return NextResponse.json({ success: true, data: { rawTranscript: text, structuredNote: structured, summary, status: "COMPLETED" } }, { status: 201 });
    }

    const record = await prisma.aITranscription.create({
      data: {
        appointmentId,
        patientId,
        doctorId,
        rawTranscript: text,
        structuredNote: structured,
        summary,
        status: "COMPLETED",
        language: "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    logger.error("Structure note failed", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

// Basic text extraction without AI
function extractStructure(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns: [RegExp, string][] = [
    [/chief complaint[:\s]*(.*?)(?:\n|$)/i, "chiefComplaint"],
    [/complaint[:\s]*(.*?)(?:\n|$)/i, "chiefComplaint"],
    [/finding[s]?[:\s]*(.*?)(?:\n|$)/i, "findings"],
    [/diagnosis[:\s]*(.*?)(?:\n|$)/i, "diagnosis"],
    [/plan[:\s]*(.*?)(?:\n|$)/i, "plan"],
    [/treatment[:\s]*(.*?)(?:\n|$)/i, "plan"],
  ];
  for (const [regex, key] of patterns) {
    if (!result[key]) {
      const match = text.match(regex);
      if (match) result[key] = match[1].trim();
    }
  }
  return result;
}
