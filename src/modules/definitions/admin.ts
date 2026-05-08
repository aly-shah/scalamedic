import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-ADMIN",
  name: "Administration",
  purpose: "System administration and access control. Manages user permissions at the module and action level. Maintains full audit trail of system actions for compliance. Controls what every role can access across the entire ERP.",
  icon: "Shield",
  color: "#DC2626",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "ADMIN-PERMISSIONS", label: "Permissions", description: "Module-level permission management" },
    { id: "ADMIN-AUDIT", label: "Audit Log", description: "System activity audit trail" },
    { id: "ADMIN-SETTINGS", label: "System Settings", description: "Global configuration" },
  ],

  actions: [
    { id: "ADMIN-CHANGE-PERMISSION", label: "Change Permission", permission: "EDIT", emitsEvent: "admin.permission_changed", description: "Modify user permissions" },
    { id: "ADMIN-EXPORT-AUDIT", label: "Export Audit Log", permission: "EXPORT", description: "Export audit trail" },
  ],

  ownedEntities: ["Permission", "AuditLog"],
  dataConnections: [
    { moduleId: "MOD-STAFF", entities: ["User"], direction: "IN", description: "User accounts to manage" },
    { moduleId: "MOD-BRANCH", entities: ["Branch", "SystemSetting"], direction: "IN", description: "Branch and config context" },
  ],

  emittedEvents: ["admin.permission_changed"],
  subscribedEvents: [],

  workflowPosition: "SYSTEM",
  dependencies: [],

  route: "/admin",
  navLabel: "Administration",
  navOrder: 18,
};

export function register() { moduleRegistry.register(definition); }
