import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-PAYMENT",
  name: "Payments",
  purpose: "Handles payment collection against invoices. Supports cash, card, bank transfer, digital wallet, insurance, and package deductions. Processes refunds. Updates invoice status and triggers checkout flow.",
  icon: "CreditCard",
  color: "#22C55E",

  primaryRoles: [UserRole.BILLING, UserRole.ADMIN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING, UserRole.RECEPTIONIST],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
  },

  sections: [
    { id: "PAYMENT-COLLECT", label: "Collect Payment", description: "Payment collection form" },
    { id: "PAYMENT-HISTORY", label: "Payment History", description: "All payment transactions" },
    { id: "PAYMENT-REFUNDS", label: "Refunds", description: "Process and track refunds" },
    { id: "PAYMENT-CHECKOUT", label: "Checkout", description: "Final checkout after payment" },
  ],

  actions: [
    { id: "PAYMENT-COLLECT-ACTION", label: "Collect Payment", permission: "CREATE", emitsEvent: "payment.received", description: "Record payment" },
    { id: "PAYMENT-REFUND-ACTION", label: "Process Refund", permission: "EDIT", emitsEvent: "payment.refunded", description: "Process refund" },
    { id: "PAYMENT-CHECKOUT-ACTION", label: "Complete Checkout", permission: "EDIT", emitsEvent: "payment.checkout_completed", description: "Complete patient checkout" },
  ],

  ownedEntities: ["Payment", "Refund"],
  dataConnections: [
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "IN", description: "Invoice to pay against" },
    { moduleId: "MOD-PATIENT", entities: ["Patient", "Insurance"], direction: "IN", description: "Patient and insurance info" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "OUT", description: "Triggers checkout status update" },
  ],

  emittedEvents: ["payment.received", "payment.failed", "payment.refunded", "payment.checkout_completed"],
  subscribedEvents: ["billing.invoice_created", "billing.invoice_updated"],

  workflowPosition: "PAYMENT",
  dependencies: ["MOD-BILLING"],

  isPatientSubmodule: true,
  navOrder: 9,
};

export function register() { moduleRegistry.register(definition); }
