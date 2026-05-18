/**
 * @system MediCore ERP — AI Patient Q&A
 * @route POST /api/ai/ask-patient
 *
 * Body: { patientId: string, question: string }
 *
 * Loads a patient context bundle (demographics, allergies, current meds,
 * last 5 consultation notes, last 5 procedures, last 3 lab tests, recent
 * vitals) and answers the doctor's free-text question against that bundle.
 *
 * If OPENAI_API_KEY is configured the answer comes from GPT-4o-mini
 * grounded on the bundle. Otherwise we return the bundle itself as a
 * structured fallback so the doctor still sees the relevant facts.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { patientId, question } = (await request.json()) as {
      patientId?: string;
      question?: string;
    };

    if (!patientId || !question?.trim()) {
      return NextResponse.json(
        { success: false, error: "patientId and question are required" },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        bloodType: true,
        skinType: true,
        allergies: { select: { allergen: true, severity: true, reaction: true } },
        medications: {
          where: { isActive: true },
          select: { name: true, dosage: true, frequency: true },
        },
        consultationNotes: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            createdAt: true,
            chiefComplaint: true,
            symptoms: true,
            examination: true,
            diagnosis: true,
            treatmentPlan: true,
            advice: true,
            doctor: { select: { name: true } },
          },
        },
        procedures: {
          orderBy: { performedAt: "desc" },
          take: 5,
          select: {
            performedAt: true,
            outcome: true,
            treatment: { select: { name: true } },
          },
        },
        labTests: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            testName: true,
            status: true,
            results: true,
            createdAt: true,
          },
        },
        vitals: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            temperature: true,
            systolicBP: true,
            diastolicBP: true,
            heartRate: true,
            weight: true,
            height: true,
            bmi: true,
          },
        },
      },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    // Build a compact, factual context the model can answer from. Same
    // shape is reused as the no-AI fallback so the doctor always sees the
    // chart even if the LLM call doesn't happen.
    const ageYears = (() => {
      // Optional from v25 — patients can be registered without DOB.
      if (!patient.dateOfBirth) return null;
      const now = new Date();
      const dob = new Date(patient.dateOfBirth);
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
      return age;
    })();

    const context = {
      header: `${patient.firstName} ${patient.lastName} (${patient.patientCode}) · ${ageYears != null ? `${ageYears}y · ` : ""}${patient.gender}${
        patient.bloodType ? ` · ${patient.bloodType}` : ""
      }${patient.skinType ? ` · skin ${patient.skinType}` : ""}`,
      allergies: patient.allergies.map(
        (a) =>
          `${a.allergen} (${a.severity})${a.reaction ? ` — ${a.reaction}` : ""}`
      ),
      medications: patient.medications.map(
        (m) =>
          `${m.name}${m.dosage ? ` ${m.dosage}` : ""}${m.frequency ? ` ${m.frequency}` : ""}`
      ),
      recentVisits: patient.consultationNotes.map((n) => ({
        date: fmtDate(n.createdAt),
        doctor: n.doctor?.name ?? "—",
        chiefComplaint: n.chiefComplaint || "",
        diagnosis: n.diagnosis || "",
        plan: n.treatmentPlan || "",
      })),
      recentProcedures: patient.procedures.map((p) => ({
        date: fmtDate(p.performedAt),
        treatment: p.treatment?.name || "—",
        outcome: p.outcome || "",
      })),
      recentLabs: patient.labTests.map((l) => ({
        date: fmtDate(l.createdAt),
        test: l.testName,
        status: l.status,
      })),
      lastVitals: patient.vitals[0]
        ? {
            date: fmtDate(patient.vitals[0].createdAt),
            tempC: patient.vitals[0].temperature,
            bp:
              patient.vitals[0].systolicBP &&
              patient.vitals[0].diastolicBP
                ? `${patient.vitals[0].systolicBP}/${patient.vitals[0].diastolicBP}`
                : null,
            hr: patient.vitals[0].heartRate,
            bmi: patient.vitals[0].bmi,
          }
        : null,
    };

    if (!OPENAI_API_KEY) {
      // Structured fallback: dump the relevant slice of the chart so the
      // doctor still gets value when the LLM isn't wired up.
      return NextResponse.json({
        success: true,
        data: {
          aiPowered: false,
          answer:
            "AI is not configured (set OPENAI_API_KEY). Showing the relevant patient context for this question:",
          context,
        },
      });
    }

    const systemPrompt = `You are a clinical assistant for a dermatology / skincare clinic.
Answer the doctor's question strictly from the provided patient chart context.
- If the chart does not contain the answer, say so clearly — do not invent facts.
- Be concise (3–6 sentences) and clinically appropriate.
- When citing a fact, mention the visit date or source (e.g. "consultation 2026-04-12").
- Do not give a definitive diagnosis or new prescription; suggest considerations only.`;

    const userPrompt = `PATIENT CONTEXT (JSON):
${JSON.stringify(context, null, 2)}

DOCTOR'S QUESTION:
${question.trim()}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      logger.error("OpenAI ask-patient error", { status: res.status });
      return NextResponse.json(
        { success: false, error: "AI service unavailable" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const answer: string =
      data?.choices?.[0]?.message?.content?.trim() ||
      "No answer returned by the model.";

    return NextResponse.json({
      success: true,
      data: { aiPowered: true, answer, context },
    });
  } catch (error) {
    logger.api("POST", "/api/ai/ask-patient", error);
    return NextResponse.json(
      { success: false, error: "Failed to answer" },
      { status: 500 }
    );
  }
}
