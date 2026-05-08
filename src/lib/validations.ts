import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

// v52: tenant onboarding (self-serve clinic provisioning).
// Slug is the URL-safe identifier used as a fallback path/subdomain
// when a custom hostname isn't yet wired up in DNS. Hostname is
// optional — without one the tenant resolves only via slug or the
// authenticated session path.
export const tenantOnboardSchema = z.object({
  tenantName: z.string().min(2).max(150),
  // Lowercase, alphanumeric + hyphens. Must start/end with alphanum.
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Slug must be lowercase letters, numbers, hyphens (3-60 chars)"),
  hostname: z.string().max(120).optional().nullable(),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email().max(200),
  adminPassword: z.string().min(8).max(128),
  branchName: z.string().min(1).max(120).optional(),
  branchAddress: z.string().min(1).max(400).optional(),
  branchPhone: z.string().min(5).max(32).optional(),
  // Anti-abuse gate. When TENANT_ONBOARD_TOKEN env is set, the
  // request must echo it back; when unset, signup is open.
  inviteToken: z.string().max(200).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  phone: z.string().max(50).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  role: z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST", "BILLING", "CALL_CENTER", "ASSISTANT", "AESTHETICIAN", "OPERATOR"]),
  branchId: z.string().uuid(),
  speciality: z.string().max(200).optional().nullable(),
  licenseNumber: z.string().max(100).optional().nullable(),
  // Doctor's default consultation fee (PKR). Used by the check-in
  // payment-collection panel to pre-fill the first invoice line item.
  consultationFee: z.number().nonnegative().optional().nullable(),
});

export const createAppointmentSchema = z
  .object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid(),
    branchId: z.string().uuid(),
    roomId: z.string().uuid().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    type: z.enum(["CONSULTATION", "PROCEDURE", "FOLLOW_UP", "REVIEW", "EMERGENCY"]).optional(),
    // Optional treatment selected at booking — feeds the check-in invoice line
    // items so the receptionist doesn't have to retype the procedure.
    treatmentId: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).optional(),
    createdById: z.string().uuid().optional(),
  })
  // Past callers were submitting endTime equal to startTime, which produced
  // 17K appointments with a zero-length window and a misleading
  // durationMinutes. Mirror the DB CHECK so the API rejects it up front.
  .refine((d) => d.endTime > d.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().min(1).max(50),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(50).optional().nullable(),
  bloodGroup: z.string().max(10).optional().nullable(),
  allergies: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  branchId: z.string().uuid().optional(),
  assignedDoctorId: z.string().uuid().optional().nullable(),
  referralSource: z.string().max(200).optional().nullable(),
  insuranceProvider: z.string().max(200).optional().nullable(),
  insurancePolicyNumber: z.string().max(200).optional().nullable(),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "CHEQUE", "BANK_TRANSFER", "DIGITAL_WALLET", "INSURANCE", "PACKAGE_DEDUCTION"]),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  processedById: z.string().uuid().optional(),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: msg };
  }
  return { success: true, data: result.data };
}
