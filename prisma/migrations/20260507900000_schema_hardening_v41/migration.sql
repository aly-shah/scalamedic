-- v41 — Schema hardening: tenant consistency for procedures/protocols
-- ====================================================================
-- Plugs the cross-table tenant invariants introduced by v40:
--
--   1. procedure_protocols.branchId — when set, the branch must
--      belong to the same tenant as the protocol. Otherwise a
--      protocol could "belong" to tenant A but be scoped to a
--      branch from tenant B.
--
--   2. procedures.protocolId — when a procedure is linked to a
--      protocol, the protocol's tenant must match the procedure's
--      branch's tenant (procedure.branchId is on the appointment,
--      not directly on the procedure row, so we hop through
--      appointments). Without this an admin in tenant A could
--      accidentally execute a tenant B protocol on a tenant A
--      patient — leaking template content across tenants.
--
-- CHECK constraints can't span tables, so both are triggers.
-- Today the platform is single-tenant; these are belt-and-suspenders
-- for the SaaS expansion (Phase 3 multi-tenant control plane).
--
-- Pre-flight on production: 0 violators.

-- ─── procedure_protocols.tenantId == branch.tenantId ───────────
CREATE OR REPLACE FUNCTION procedure_protocols_enforce_branch_tenant() RETURNS TRIGGER AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  IF NEW."branchId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'procedure_protocols.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'procedure_protocols.tenantId (%) must match the branch''s tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER procedure_protocols_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "tenantId", "branchId" ON procedure_protocols
  FOR EACH ROW EXECUTE FUNCTION procedure_protocols_enforce_branch_tenant();

-- ─── procedures.protocolId tenant must match branch tenant ─────
-- Procedure → Appointment → Branch chain gives us the procedure's
-- branchId; protocol carries its own tenantId; both tenants must
-- agree.
CREATE OR REPLACE FUNCTION procedures_enforce_protocol_tenant() RETURNS TRIGGER AS $$
DECLARE
  protocol_tenant UUID;
  appt_branch_tenant UUID;
BEGIN
  IF NEW."protocolId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "tenantId" INTO protocol_tenant FROM procedure_protocols WHERE id = NEW."protocolId";
  IF protocol_tenant IS NULL THEN
    RAISE EXCEPTION 'procedures.protocolId % refers to a non-existent protocol', NEW."protocolId";
  END IF;
  SELECT b."tenantId" INTO appt_branch_tenant
    FROM appointments a
    JOIN branches b ON b.id = a."branchId"
   WHERE a.id = NEW."appointmentId";
  IF appt_branch_tenant IS NULL THEN
    -- Should never happen — appointmentId is NOT NULL with FK,
    -- but defensive in case of phantom data.
    RETURN NEW;
  END IF;
  IF protocol_tenant <> appt_branch_tenant THEN
    RAISE EXCEPTION 'procedures.protocolId (tenant %) does not match the appointment''s branch tenant (%)',
      protocol_tenant, appt_branch_tenant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER procedures_enforce_protocol_tenant_trg
  BEFORE INSERT OR UPDATE OF "protocolId", "appointmentId" ON procedures
  FOR EACH ROW EXECUTE FUNCTION procedures_enforce_protocol_tenant();
