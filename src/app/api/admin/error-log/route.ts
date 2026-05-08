/**
 * @system MediCore ERP — Server error log reader
 * @route GET /api/admin/error-log?limit=200&since=ISO
 *
 * Tails pm2's stderr stream for the medicore process. The platform's
 * `logger.error()` writes JSON-per-line to console.error, which pm2
 * captures into /root/.pm2/logs/medicore-error.log. This route reads
 * the tail, parses each JSON line, returns the result.
 *
 * Why disk-tail instead of a Sentry-style ingest endpoint:
 *   - The deployment is single-VPS; pm2 already aggregates correctly.
 *   - No new infra dependency, no new secrets.
 *   - When the team eventually adds Sentry, they keep this as the
 *     local fallback — Sentry occasionally drops events; the disk
 *     log is the canonical record.
 *
 * Limitations:
 *   - Reads only the last ~2 MB of the log to keep response time
 *     bounded; older history is in pm2's rotated archives (gzipped
 *     under /root/.pm2/logs/).
 *   - Plain-text lines (Next.js startup noise) are skipped, not
 *     surfaced — admins want clinical errors, not framework banner.
 *
 * Auth: ADMIN+. Error logs can leak sensitive info (stack traces
 * with paths, sometimes user ids), so locked down.
 */
import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const LOG_PATH = process.env.PM2_ERROR_LOG_PATH || "/root/.pm2/logs/medicore-error.log";
const TAIL_BYTES = 2 * 1024 * 1024; // 2 MB

interface ParsedEntry {
  level: "info" | "warn" | "error";
  message: string;
  module?: string;
  data?: unknown;
  timestamp: string;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") || "200", 10) || 200));
    const since = searchParams.get("since"); // optional ISO timestamp filter

    let raw: string;
    let logSize = 0;
    try {
      const stats = await stat(LOG_PATH);
      logSize = stats.size;
      if (stats.size <= TAIL_BYTES) {
        raw = await readFile(LOG_PATH, "utf8");
      } else {
        // Read just the trailing slice. Drop the (likely partial)
        // first line so we don't return a parse error on the boundary.
        const fs = await import("fs/promises");
        const fh = await fs.open(LOG_PATH, "r");
        try {
          const buf = Buffer.alloc(TAIL_BYTES);
          await fh.read(buf, 0, TAIL_BYTES, stats.size - TAIL_BYTES);
          raw = buf.toString("utf8");
          const firstNewline = raw.indexOf("\n");
          if (firstNewline > 0) raw = raw.slice(firstNewline + 1);
        } finally {
          await fh.close();
        }
      }
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Log file unreadable", path: LOG_PATH, detail: e instanceof Error ? e.message : "?" },
        { status: 500 },
      );
    }

    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const entries: ParsedEntry[] = [];
    for (const line of lines) {
      // pm2 may prefix lines with timestamps if --time was used; the
      // platform's logger always outputs pure JSON, but be robust to
      // either by extracting the JSON suffix.
      const jsonStart = line.indexOf("{");
      if (jsonStart < 0) continue;
      try {
        const parsed = JSON.parse(line.slice(jsonStart));
        if (parsed && typeof parsed === "object" && parsed.level && parsed.timestamp) {
          entries.push(parsed as ParsedEntry);
        }
      } catch {
        // Not JSON (bash startup, port banner, etc.) — skip silently.
      }
    }

    // Filter by `since` if requested. Newest-first ordering.
    const cutoff = since ? new Date(since).getTime() : 0;
    const filtered = entries
      .filter((e) => !cutoff || new Date(e.timestamp).getTime() >= cutoff)
      .reverse()
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: filtered,
      summary: {
        path: LOG_PATH,
        sizeBytes: logSize,
        parsedCount: entries.length,
        returnedCount: filtered.length,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/error-log", error);
    return NextResponse.json(
      { success: false, error: "Failed to read error log" },
      { status: 500 },
    );
  }
}
