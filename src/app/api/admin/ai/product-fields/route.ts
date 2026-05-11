/**
 * @system MediCore ERP — AI fill for pharmacy product form
 * @route POST /api/admin/ai/product-fields
 *
 * Given a product name + brand + category, asks OpenAI to draft a
 * short Notes blurb (usage / dosing / storage / warnings) the
 * receptionist can review before saving.
 *
 * Auth: ADMIN+. Mirrors the treatment-fields sibling — same model,
 * same fallback behaviour when OPENAI_API_KEY is missing.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are a copywriter for the pharmacy counter at a dermatology / aesthetic clinic. The receptionist will see this as the on-screen note when dispensing a product. Write 1-3 short sentences OR 2-4 bulleted lines covering whatever combination is relevant: typical usage / dosing, storage, common warnings or interactions, who to refer back to the doctor.

Rules:
- Plain language. No marketing fluff. No claims about cure.
- Don't invent dosages or specific drug strengths you're not sure about. If the product class is broad (e.g. "moisturiser") give general care guidance, not made-up frequencies.
- Use British / Pakistani spelling.
- Output strict JSON: {"notes":"..."}. Empty string if you can't responsibly fill it.
- Don't include the product name in the notes.`;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";

    if (!name) {
      return NextResponse.json(
        { success: false, error: "name is required" },
        { status: 400 },
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({
        success: true,
        data: { notes: "", aiPowered: false, error: "AI not configured" },
      });
    }

    const userPrompt = `Product: ${name}${brand ? ` (${brand})` : ""}${category ? ` · Category: ${category}` : ""}

Draft the dispensing note.`;

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
        max_tokens: 350,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      logger.error("OpenAI API error in product-fields");
      return NextResponse.json(
        { success: false, error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let notes = "";
    try {
      const raw = JSON.parse(content) as { notes?: unknown };
      if (typeof raw.notes === "string") notes = raw.notes.trim();
    } catch {
      notes = "";
    }

    return NextResponse.json({
      success: true,
      data: { notes, aiPowered: true },
    });
  } catch (error) {
    logger.api("POST", "/api/admin/ai/product-fields", error);
    return NextResponse.json(
      { success: false, error: "Failed to draft product notes" },
      { status: 500 },
    );
  }
}
