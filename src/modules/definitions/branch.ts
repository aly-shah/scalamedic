import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-BRANCH",
  name: "Branch & Configuration",
  purpose: "Multi-branch clinic management. Configures branch locations, contact info, timezone, and system-wide settings like tax rates, invoice prefixes, and operational parameters.",
  icon: "Building2",
  color: "#78716C",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    CREATE: [UserRole.SUPER_ADMIN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN],
  },

  sections: [
    { id: "BRANCH-LIST", label: "Branches", description: "All clinic branches" },
    { id: "BRANCH-CONFIG", label: "Configuration", description: "Branch-level settings" },
    { id: "BRANCH-SETTINGS", label: "System Settings", description: "Global system configuration" },
  ],

  actions: [
    { id: "BRANCH-CREATE", label: "Add Branch", permission: "CREATE", emitsEvent: "branch.created", description: "Create new branch" },
    { id: "BRANCH-UPDATE", label: "Update Branch", permission: "EDIT", emitsEvent: "branch.updated", description: "Update branch info" },
    { id: "BRANCH-UPDATE-SETTINGS", label: "Update Settings", permission: "EDIT", emitsEvent: "branch.settings_changed", description: "Change system settings" },
  ],

  ownedEntities: ["Branch", "SystemSetting"],
  dataConnections: [
    { moduleId: "MOD-STAFF", entities: ["User"], direction: "OUT", description: "Branch assignment for staff" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "OUT", description: "Tax rates, invoice config" },
    { moduleId: "MOD-ROOMS", entities: ["Room"], direction: "OUT", description: "Branch rooms" },
  ],

  emittedEvents: ["branch.created", "branch.updated", "branch.settings_changed"],
  subscribedEvents: [],

  workflowPosition: "SYSTEM",
  dependencies: [],

  route: "/admin/branches",
  navLabel: "Branches",
  navOrder: 17,
};

export function register() { moduleRegistry.register(definition); }
