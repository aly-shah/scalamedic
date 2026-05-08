import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-BILLING",
  name: "Billing",
  purpose: "Revenue management hub. Creates invoices from consultations, procedures, and products. Tracks line items, discounts, taxes, insurance coverage, package deductions, and overdue accounts. Source of truth for all financial records.",
  icon: "Receipt",
  color: "#F97316",

  primaryRoles: [UserRole.BILLING, UserRole.ADMIN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING],
  },

  sections: [
    { id: "BILLING-INVOICES", label: "Invoices", description: "All invoices with status and amounts" },
    { id: "BILLING-CREATE-INVOICE", label: "Create Invoice", description: "Generate invoice from visit/procedure" },
    { id: "BILLING-PACKAGES", label: "Packages", description: "Treatment package catalog and subscriptions" },
    { id: "BILLING-PRODUCTS", label: "Products", description: "Product inventory and pricing" },
    { id: "BILLING-REVENUE", label: "Revenue Overview", description: "Revenue metrics, pending, collected, overdue" },
    { id: "BILLING-INSURANCE", label: "Insurance Claims", description: "Insurance-based billing" },
  ],

  actions: [
    { id: "BILLING-CREATE-INVOICE-ACTION", label: "Create Invoice", permission: "CREATE", emitsEvent: "billing.invoice_created", description: "Generate new invoice" },
    { id: "BILLING-UPDATE-INVOICE", label: "Update Invoice", permission: "EDIT", emitsEvent: "billing.invoice_updated", description: "Modify invoice" },
    { id: "BILLING-SEND-INVOICE", label: "Send Invoice", permission: "EDIT", emitsEvent: "billing.invoice_sent", description: "Send invoice to patient" },
    { id: "BILLING-EXPORT", label: "Export", permission: "EXPORT", description: "Export billing data" },
  ],

  ownedEntities: ["Invoice", "Package", "PatientPackage", "Product"],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Visit context for invoicing" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Consultation fees" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure", "Treatment"], direction: "IN", description: "Procedure charges" },
    { moduleId: "MOD-PRESCRIPTION", entities: ["Prescription"], direction: "IN", description: "Medication charges" },
    { moduleId: "MOD-PATIENT", entities: ["Patient", "Insurance"], direction: "IN", description: "Patient info and insurance" },
    { moduleId: "MOD-PAYMENT", entities: ["Payment", "Refund"], direction: "BOTH", description: "Payment updates invoice status" },
    { moduleId: "MOD-BRANCH", entities: ["SystemSetting"], direction: "IN", description: "Tax rates, invoice prefixes" },
  ],

  emittedEvents: ["billing.invoice_created", "billing.invoice_updated", "billing.invoice_sent", "billing.invoice_overdue"],
  subscribedEvents: [
    "consultation.completed", "procedure.completed", "prescription.created",
    "payment.received", "payment.refunded",
  ],

  workflowPosition: "BILLING",
  dependencies: ["MOD-PATIENT"],

  route: "/billing",
  navLabel: "Billing",
  navOrder: 8,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
