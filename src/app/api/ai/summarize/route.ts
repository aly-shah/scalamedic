/**
 * @system MediCore ERP — AI Summarization (OpenAI GPT)
 * @route POST /api/ai/summarize — Summarize clinical notes using AI
 */
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const { text, type } = body;

    if (!text) {
      return NextResponse.json({ success: false, error: "Text is required" }, { status: 400 });
    }

    // If no API key, return intelligent fallback
    if (!OPENAI_API_KEY) {
      const keyPoints = extractKeyPoints(text);
      return NextResponse.json({
        success: true,
        data: {
          id: `sum-${Date.now()}`, type: type || "general", originalLength: text.length,
          summary: keyPoints.length > 0 ? `Summary: ${keyPoints.join(". ")}.` : "AI not configured. Add OPENAI_API_KEY to enable.",
          keyPoints, aiPowered: false, createdAt: new Date().toISOString(),
        },
      });
    }

    // Real OpenAI call
    const systemPrompt = type === "consultation"
      ? "You are a medical note summarizer for a dermatology/skincare clinic. Summarize into a concise clinical summary. Output JSON: {\"summary\": \"...\", \"keyPoints\": [\"...\"]}"
      : "Summarize the following text concisely. Output JSON: {\"summary\": \"...\", \"keyPoints\": [\"...\"]}";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
        response_format: { type: "json_object" },
        max_tokens: 500, temperature: 0.3,
      }),
    });

    if (!res.ok) {
      logger.error("OpenAI API error");
      return NextResponse.json({ success: false, error: "AI service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed: { summary: string; keyPoints: string[] };
    try { parsed = JSON.parse(content); } catch { parsed = { summary: content, keyPoints: [] }; }

    return NextResponse.json({
      success: true,
      data: {
        id: `sum-${Date.now()}`, type: type || "general", originalLength: text.length,
        summary: parsed.summary, keyPoints: parsed.keyPoints || [],
        aiPowered: true, createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.api("POST", "/api/ai/summarize", error);
    return NextResponse.json({ success: false, error: "Failed to summarize" }, { status: 500 });
  }
}

function extractKeyPoints(text: string): string[] {
  const points: string[] = [];
  const patterns = [
    { regex: /chief complaint[:\s]*(.*)/i, label: "CC" },
    { regex: /diagnosis[:\s]*(.*)/i, label: "Dx" },
    { regex: /treatment[:\s]*(.*)/i, label: "Tx" },
    { regex: /plan[:\s]*(.*)/i, label: "Plan" },
    { regex: /follow.?up[:\s]*(.*)/i, label: "Follow-up" },
  ];
  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) points.push(`${p.label}: ${match[1].trim().substring(0, 100)}`);
  }
  if (points.length === 0) {
    points.push(...text.split(/[.\n]/).map((l) => l.trim()).filter((l) => l.length > 10).slice(0, 3));
  }
  return points;
}
