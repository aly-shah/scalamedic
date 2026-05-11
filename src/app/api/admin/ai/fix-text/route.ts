/**
 * @system MediCore ERP — AI text polish for catalog free-text fields
 * @route POST /api/admin/ai/fix-text
 *
 * Takes admin-typed copy and returns a tidied version: fix grammar,
 * spelling, and punctuation; tighten clarity; keep clinic-
 * appropriate tone. Does NOT add new claims or change meaning.
 *
 * The `field` parameter tells the AI which writing convention to
 * apply: a description is prose; pre-/post-care is bulleted lines;
 * contraindications is a comma-separated list.
 *
 * Auth: ADMIN+.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type Field = "description" | "preInstructions" | "postInstructions" | "contraindications" | "productNotes";

const FIELD_GUIDE: Record<Field, string> = {
  description:
    "Field type: treatment description shown to patients. 1-2 sentences, plain language, what it does and what it targets. No marketing fluff. No medical claims about cure.",
  preInstructions:
    "Field type: pre-treatment instructions. One instruction per line, no bullet markers, imperative tone. Keep to 3-5 lines. Each line ≤ 120 chars.",
  postInstructions:
    "Field type: post-treatment care. One instruction per line, no bullet markers, imperative tone. Keep to 3-5 lines. Each line ≤ 120 chars.",
  contraindications:
    "Field type: who must not have this treatment. Comma-separated, single line, lowercase except proper nouns. e.g. pregnancy, active acne, isotretinoin within 6 months.",
  productNotes:
    "Field type: pharmacy product notes — short usage / dosing / storage / warning hints for the dispensing receptionist. 1-3 sentences or 2-4 short bulleted lines. Plain language. Don't invent dosages or new indications; only tidy what's already there.",
};

const SYSTEM_PROMPT = `You are a copy editor for a dermatology / aesthetic clinic. The admin has written some copy and wants you to polish it. Rules:

1. Fix grammar, spelling, punctuation, capitalization.
2. Tighten clarity. Remove filler. Keep the meaning.
3. Match the convention specified for the field type.
4. Use British / Pakistani spelling where it differs from US ("colour", "centre").
5. Do NOT add new claims, dosages, or specific drug names. If the input has a typo on a drug, fix the typo only — don't speculate.
6. Do NOT mention the treatment by name unless the input already does.
7. If the input is already clean and correct, return it nearly unchanged.

Output strict JSON: {"text":"..."} — only the polished version of the input, nothing else.`;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const field = body.field as Field | undefined;
    const text = typeof body.text === "string" ? body.text : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";

    if (!field || !FIELD_GUIDE[field]) {
      return NextResponse.json(
        { success: false, error: "Invalid field" },
        { status: 400 },
      );
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json(
        { success: false, error: "Text is empty" },
        { status: 400 },
      );
    }
    if (trimmed.length > 4000) {
      return NextResponse.json(
        { success: false, error: "Text too long (max 4000 chars)" },
        { status: 400 },
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({
        success: true,
        data: { text, aiPowered: false, error: "AI not configured" },
      });
    }

    const userPrompt = `${FIELD_GUIDE[field]}
${name ? `Treatment context: ${name}${category ? ` · ${category}` : ""}` : ""}

INPUT:
${trimmed}

Polish it.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      logger.error("OpenAI API error in fix-text");
      return NextResponse.json(
        { success: false, error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let polished = "";
    try {
      const raw = JSON.parse(content) as { text?: unknown };
      if (typeof raw.text === "string") polished = raw.text.trim();
    } catch {
      polished = "";
    }
    if (!polished) {
      // Defensive: if the model didn't return clean JSON, hand back
      // the original text so the user doesn't lose what they typed.
      return NextResponse.json({
        success: true,
        data: { text, aiPowered: true, error: "AI returned empty result" },
      });
    }

    return NextResponse.json({
      success: true,
      data: { text: polished, aiPowered: true },
    });
  } catch (error) {
    logger.api("POST", "/api/admin/ai/fix-text", error);
    return NextResponse.json(
      { success: false, error: "Failed to polish text" },
      { status: 500 },
    );
  }
}
