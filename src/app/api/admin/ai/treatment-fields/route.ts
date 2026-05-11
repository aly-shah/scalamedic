/**
 * @system MediCore ERP — AI fill for treatment catalog form
 * @route POST /api/admin/ai/treatment-fields
 *
 * Given a treatment name + category (and optionally tax category),
 * asks OpenAI to draft the four free-text fields a treatment row
 * needs: description, pre-care, post-care, contraindications. The
 * admin reviews and edits before saving; this just gives them a
 * starting point so they don't write the same boilerplate every
 * time.
 *
 * Auth: ADMIN+. Returns drafts marked aiPowered:true on success;
 * falls back to empty strings when OPENAI_API_KEY isn't configured.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are a copywriter for a dermatology / aesthetic clinic. Given a treatment's name and clinical category, draft four short fields the receptionist will show to patients:

- description: 1-2 sentences, plain language, what the treatment does and what it targets. No marketing fluff. No medical claims about cure.
- preInstructions: bullet-style pre-treatment instructions (one per line, no bullet markers) typical for that treatment. e.g. avoid retinoids 5 days prior, no waxing 24h before, etc. Keep to 3-5 lines max.
- postInstructions: bullet-style post-treatment care (one per line, no bullet markers). e.g. SPF 50 daily for 2 weeks, no hot showers 24h, gentle cleanser only. 3-5 lines.
- contraindications: who should NOT have this treatment, comma-separated. e.g. pregnancy, active acne, isotretinoin within 6 months. 1 line.

Output strict JSON: {"description":"...","preInstructions":"...","postInstructions":"...","contraindications":"..."}. Empty string for fields you can't responsibly fill. Never invent dosages or specific drug names you're not sure about. Do not include the treatment name in any field. Use clinic-appropriate British/Pakistani spelling.`;

interface DraftFields {
  description: string;
  preInstructions: string;
  postInstructions: string;
  contraindications: string;
}

const EMPTY: DraftFields = {
  description: "", preInstructions: "", postInstructions: "", contraindications: "",
};

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const taxCategory = typeof body.taxCategory === "string" ? body.taxCategory.trim() : "";

    if (!name || !category) {
      return NextResponse.json(
        { success: false, error: "name and category are required" },
        { status: 400 },
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({
        success: true,
        data: { ...EMPTY, aiPowered: false, error: "AI not configured" },
      });
    }

    const userPrompt = `Treatment name: ${name}
Category: ${category}${taxCategory ? `\nTax bracket: ${taxCategory}` : ""}

Draft the four fields.`;

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
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      logger.error("OpenAI API error in treatment-fields");
      return NextResponse.json(
        { success: false, error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: DraftFields;
    try {
      const raw = JSON.parse(content) as Partial<DraftFields>;
      parsed = {
        description: typeof raw.description === "string" ? raw.description.trim() : "",
        preInstructions: typeof raw.preInstructions === "string" ? raw.preInstructions.trim() : "",
        postInstructions: typeof raw.postInstructions === "string" ? raw.postInstructions.trim() : "",
        contraindications: typeof raw.contraindications === "string" ? raw.contraindications.trim() : "",
      };
    } catch {
      parsed = EMPTY;
    }

    return NextResponse.json({
      success: true,
      data: { ...parsed, aiPowered: true },
    });
  } catch (error) {
    logger.api("POST", "/api/admin/ai/treatment-fields", error);
    return NextResponse.json(
      { success: false, error: "Failed to draft treatment fields" },
      { status: 500 },
    );
  }
}
