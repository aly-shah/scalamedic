import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const start = Date.now();
  let dbOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // DB unreachable
  }

  const ms = Date.now() - start;

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    {
      status: dbOk ? "healthy" : "degraded",
      db: dbOk ? "connected" : "unreachable",
      uptime: process.uptime(),
      responseMs: ms,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
