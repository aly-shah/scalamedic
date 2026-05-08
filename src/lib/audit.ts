import { prisma } from "@/lib/prisma";

/**
 * Log an audit event. Call this in API routes after critical actions.
 * userId is optional — pass null/undefined for system jobs and webhook events
 * with no acting user (the column is nullable in v11+).
 */
export async function logAudit(params: {
  userId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : undefined,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (err) {
    // Don't let audit failures break the main request
    console.error("Audit log failed:", err);
  }
}
