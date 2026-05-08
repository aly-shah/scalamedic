/**
 * AI photo scoring (Tier 4.3 / v56).
 *
 * Reads a clinical photo from disk, encodes it as a base64 data URL,
 * and asks GPT-4o for a structured dermatology assessment. The
 * result is informational — every score row in `photo_scores` carries
 * the model id + prompt version so an audit can reconstruct exactly
 * what the model saw and what it returned.
 *
 * Why server-side encoding (not URL): photos live under
 * /var/www/medicore/public/uploads — accessible behind nginx but the
 * forwarded host header is unreliable for building absolute URLs
 * (per the existing nginx + request.url note). Reading the file
 * locally and base64-encoding it sidesteps the proxy entirely and
 * also keeps photos out of CDN caches.
 *
 * Prompt design philosophy: the model is told repeatedly that this
 * is a clinical aid, not a diagnostic tool. Every field is
 * schema-bound so we can store and render it; no free-form essays.
 */
import { readFile } from "fs/promises";
import { join } from "path";

export const PHOTO_SCORE_PROMPT_V1 = "photo-score-v1";
export const PHOTO_SCORE_MODEL_ID = "gpt-4o";

/** Schema-bound model output. The route validates and stores these
 *  exact fields; anything else the model returns is ignored. */
export interface PhotoScoreResult {
  condition: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE" | "UNCERTAIN" | null;
  lesionCount: number | null;
  bodyArea: string | null;
  findings: string | null;
  recommendations: string | null;
  confidence: number | null;
}

const SYSTEM_PROMPT = `You are a clinical dermatology assistant analyzing a single patient photograph.

Return JSON with exactly this shape:
{
  "condition": "string or null — most likely dermatological condition (e.g. 'Acne vulgaris', 'Melasma', 'Psoriasis vulgaris', 'Rosacea', 'Vitiligo', 'Telogen effluvium', 'Atopic dermatitis')",
  "severity": "one of MILD | MODERATE | SEVERE | UNCERTAIN",
  "lesionCount": "integer or null — approximate count if countable; null otherwise",
  "bodyArea": "string or null — anatomical region visible (e.g. 'Face — cheeks and forehead', 'Scalp', 'Extensor arms')",
  "findings": "string or null — 2-3 sentence narrative of what you see (lesion type, distribution, surface features)",
  "recommendations": "string or null — concise next-step suggestions for the doctor (1-3 short sentences)",
  "confidence": "integer 0-100 or null — your self-rated confidence in the assessment"
}

Rules:
- This is a clinical aid for a qualified dermatologist who is reviewing the same photo. You are not making a diagnosis — you are giving the doctor a structured second look.
- If the image is not a clinical skin photo (e.g. document, blurry, artifact), return condition=null, severity=UNCERTAIN, confidence below 30, and explain in findings.
- Use UNCERTAIN severity when you genuinely cannot grade.
- Be specific in findings: comedones vs papules vs pustules; sharply demarcated vs ill-defined; symmetric vs unilateral; etc.
- Do not invent counts you can't actually see. Prefer null lesionCount over a guess.
- Return ONLY the JSON object. No markdown fence, no commentary.`;

/**
 * Resolve a fileUrl like "/uploads/abc.jpg" to a base64 data URL.
 * Throws if the file is missing or has an extension we don't support.
 */
async function fileUrlToDataUrl(fileUrl: string, mimeType: string | null): Promise<string> {
  // Reject anything that looks like an external URL — we only know
  // how to read files served from /uploads on this box.
  if (!fileUrl.startsWith("/uploads/")) {
    throw new Error(`Photo URL ${fileUrl} is not in /uploads/ — cannot read locally`);
  }
  const filename = fileUrl.replace(/^\/uploads\//, "");
  // Defense against path-traversal: the filename should be a
  // single segment, no slashes or "..".
  if (filename.includes("/") || filename.includes("..")) {
    throw new Error("Invalid filename");
  }
  const path = join(process.cwd(), "public", "uploads", filename);
  const bytes = await readFile(path);
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType || ({
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp", gif: "image/gif",
  } as Record<string, string>)[ext] || "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export interface ScorePhotoInput {
  fileUrl: string;
  mimeType: string | null;
}

/**
 * Run the AI scoring against a single photo. Returns a
 * PhotoScoreResult or throws on irrecoverable error (missing API key,
 * file not found, model returning unparseable JSON).
 */
export async function scorePhoto(input: ScorePhotoInput): Promise<PhotoScoreResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on this deployment");
  }

  const dataUrl = await fileUrlToDataUrl(input.fileUrl, input.mimeType);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PHOTO_SCORE_MODEL_ID,
      response_format: { type: "json_object" },
      // Lean toward determinism — we want the same photo to score
      // similarly run-to-run.
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this clinical photograph." },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response missing message content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned non-JSON content");
  }

  return normalizeResult(parsed);
}

function normalizeResult(raw: Record<string, unknown>): PhotoScoreResult {
  const str = (v: unknown, max = 200): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length === 0 ? null : t.slice(0, max);
  };
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const sev = ((): PhotoScoreResult["severity"] => {
    const s = typeof raw.severity === "string" ? raw.severity.toUpperCase() : null;
    if (s === "MILD" || s === "MODERATE" || s === "SEVERE" || s === "UNCERTAIN") return s;
    return null;
  })();
  const conf = num(raw.confidence);
  return {
    condition: str(raw.condition, 120),
    severity: sev,
    lesionCount: (() => { const n = num(raw.lesionCount); return n != null && n >= 0 ? n : null; })(),
    bodyArea: str(raw.bodyArea, 120),
    findings: str(raw.findings, 2000),
    recommendations: str(raw.recommendations, 2000),
    confidence: conf != null ? Math.max(0, Math.min(100, conf)) : null,
  };
}
