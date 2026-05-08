-- Role permission overrides — runtime grants/denials on top of the
-- static module-definition permission grid. Powers /admin/roles' new
-- click-to-toggle UI without forcing a redeploy.

CREATE TABLE "role_permission_overrides" (
  "id"        UUID PRIMARY KEY,
  "role"      "UserRole" NOT NULL,
  "moduleId"  VARCHAR(60) NOT NULL,
  "action"    VARCHAR(20) NOT NULL,
  "granted"   BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_permission_overrides_role_moduleId_action_key"
    UNIQUE ("role", "moduleId", "action")
);

CREATE INDEX "role_permission_overrides_role_idx"
  ON "role_permission_overrides"("role");
