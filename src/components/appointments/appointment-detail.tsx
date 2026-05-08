"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Phone, AlertTriangle, Clock, MapPin, Stethoscope,
  LogIn, CheckCircle, CreditCard, LogOut, Calendar, Heart,
  XCircle, FileText, Pill, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ProgressTracker } from "@/components/ui/progress-tracker";
import { useAppointment, useCheckInAppointment, useCheckoutAppointment, useUpdateAppointment } from "@/hooks/use-queries";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { AppointmentStatus, WorkflowStage } from "@/types";
import { appointmentStatusColors, appointmentTypeLabels } from "@/lib/constants";
import { formatCurrency, CLINIC_TZ } from "@/lib/utils";
import type { Appointment } from "@/types";
import { CancelAppointmentDialog } from "@/components/appointments/cancel-appointment-dialog";
import { CheckoutDialog } from "@/components/appointments/checkout-dialog";
import { CheckInPayPanel } from "@/components/appointments/check-in-pay-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface AppointmentDetailProps {
  appointment: Appointment;
  onClose: () => void;
}

const WORKFLOW_STEPS = [
  { id: "BOOKED", label: "Booked", stage: WorkflowStage.BOOKED },
  { id: "CHECKIN", label: "Check-In", stage: WorkflowStage.CHECKIN },
  { id: "WAITING", label: "Waiting", stage: WorkflowStage.WAITING },
  { id: "CONSULT", label: "Consultation", stage: WorkflowStage.CONSULT },
  { id: "TREATMENT", label: "Treatment", stage: WorkflowStage.TREATMENT },
  { id: "BILLING", label: "Billing", stage: WorkflowStage.BILLING },
  { id: "CHECKOUT", label: "Checkout", stage: WorkflowStage.CHECKOUT },
];

function getStepStatus(stepStage: WorkflowStage, currentStage: WorkflowStage): "completed" | "current" | "pending" {
  const order = WORKFLOW_STEPS.map((s) => s.stage);
  const currentIdx = order.indexOf(currentStage);
  const stepIdx = order.indexOf(stepStage);
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "pending";
}

export function AppointmentDetail({ appointment, onClose }: AppointmentDetailProps) {
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const router = useRouter();
  const checkInMutation = useCheckInAppointment();
  const checkoutMutation = useCheckoutAppointment();
  const updateMutation = useUpdateAppointment();

  // Fetch full appointment detail with related data
  const { data: detailResponse } = useAppointment(appointment.id);
  const fullAppt = (detailResponse?.data || appointment) as Appointment & {
    patient?: Record<string, unknown>;
    consultationNotes?: Record<string, unknown>[];
    procedures?: Record<string, unknown>[];
    prescriptions?: Record<string, unknown>[];
    labTests?: Record<string, unknown>[];
    followUps?: Record<string, unknown>[];
    triageRecords?: Record<string, unknown>[];
    invoices?: Array<{ id: string; invoiceNumber?: string }>;
  };

  const patient = fullAppt.patient as Record<string, unknown> | undefined;
  const triage = (fullAppt.triageRecords || [])[0] as Record<string, unknown> | undefined;
  const notes = (fullAppt.consultationNotes || []) as Record<string, unknown>[];
  const procedures = (fullAppt.procedures || []) as Record<string, unknown>[];
  const prescriptions = (fullAppt.prescriptions || []) as Record<string, unknown>[];
  const labTests = (fullAppt.labTests || []) as Record<string, unknown>[];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const statusBadgeVariant = (status: string) =>
    (appointmentStatusColors[status] || "default") as "success" | "warning" | "danger" | "info" | "default" | "primary";

  const typeBadgeVariant = (type: string): "primary" | "success" | "warning" | "info" | "danger" | "default" => {
    switch (type) {
      case "CONSULTATION": return "primary";
      case "PROCEDURE": return "success";
      case "FOLLOW_UP": return "warning";
      case "REVIEW": return "info";
      case "EMERGENCY": return "danger";
      default: return "default";
    }
  };

  const progressSteps = WORKFLOW_STEPS.map((ws) => ({
    id: ws.id,
    label: ws.label,
    status: getStepStatus(ws.stage, fullAppt.workflowStage),
  }));

  const currentStatus = fullAppt.status;
  const showCheckIn = currentStatus === AppointmentStatus.SCHEDULED || currentStatus === AppointmentStatus.CONFIRMED;
  const showStartConsultation = currentStatus === AppointmentStatus.WAITING || currentStatus === AppointmentStatus.CHECKED_IN;
  // IN_PROGRESS shows two actions side by side: "Complete visit" (frees
  // the room and unlocks Checkout) and "Proceed to Billing" (keeps the
  // visit open and just navigates). Without Complete visit, the doctor
  // had to save consultation notes through /consultation to ever flip
  // the appointment to COMPLETED — for quick procedures or visits where
  // notes don't get filed, the room stayed OCCUPIED indefinitely.
  const showCompleteVisit = currentStatus === AppointmentStatus.IN_PROGRESS;
  const showBilling = currentStatus === AppointmentStatus.IN_PROGRESS;
  const showCheckout = currentStatus === AppointmentStatus.COMPLETED;
  const canCancel = currentStatus !== AppointmentStatus.COMPLETED && currentStatus !== AppointmentStatus.CANCELLED && currentStatus !== AppointmentStatus.NO_SHOW;

  const handleCheckIn = async () => {
    await checkInMutation.mutateAsync(appointment.id);
    emit(SystemEvents.APPOINTMENT_CHECKED_IN, {
      patientName: appointment.patientName,
      doctorName: appointment.doctorName,
    }, { patientId: appointment.patientId, appointmentId: appointment.id });
  };

  const handleStartConsultation = async () => {
    await updateMutation.mutateAsync({
      id: appointment.id,
      data: { status: "IN_PROGRESS", workflowStage: "CONSULT" },
    });
    emit(SystemEvents.CONSULTATION_STARTED, {
      patientName: appointment.patientName,
    }, { patientId: appointment.patientId, appointmentId: appointment.id });
  };

  // Checkout now opens a small panel first so reception can review the
  // bills, add a last-minute one, or print the combined receipt before
  // confirming. The actual API call is only fired by the dialog's
  // "Confirm checkout" action.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [addBillTarget, setAddBillTarget] = useState<Appointment | null>(null);
  const handleCheckoutConfirmed = async () => {
    await checkoutMutation.mutateAsync(appointment.id);
    emit(SystemEvents.CHECKOUT_COMPLETED, {
      patientName: appointment.patientName,
    }, { patientId: appointment.patientId, appointmentId: appointment.id });
    setCheckoutOpen(false);
    onClose();
  };

  const { confirm } = useConfirm();
  const handleCompleteVisit = async () => {
    const ok = await confirm({
      title: "Mark visit as complete?",
      message:
        "The room frees up and the patient moves to billing. The Checkout button appears once they've physically left. Use Cancel if the patient didn't actually receive the service.",
      confirmLabel: "Complete visit",
      variant: "default",
    });
    if (!ok) return;
    await updateMutation.mutateAsync({
      id: appointment.id,
      // workflowStage → BILLING since the visit's clinical part is done
      // and reception's next step is collecting any remaining balance.
      data: { status: "COMPLETED", workflowStage: "BILLING" },
    });
    emit(SystemEvents.CONSULTATION_COMPLETED, {
      patientName: appointment.patientName,
    }, { patientId: appointment.patientId, appointmentId: appointment.id });
  };

  const [cancelOpen, setCancelOpen] = useState(false);
  const handleCancelConfirmed = async (cancellationNote: string) => {
    await updateMutation.mutateAsync({
      id: appointment.id,
      data: { status: "CANCELLED", cancellationNote },
    });
    emit(SystemEvents.APPOINTMENT_CANCELLED, {
      patientName: appointment.patientName,
    }, { patientId: appointment.patientId, appointmentId: appointment.id });
    setCancelOpen(false);
    onClose();
  };

  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : appointment.patientName;
  const patientCode = (patient?.patientCode as string) || "";
  const patientPhone = (patient?.phone as string) || "";
  const allergies = (patient?.allergies as { allergen: string }[] || []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] lg:w-[480px] bg-stone-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 bg-white border-b border-stone-200/70">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-stone-900">Appointment Details</h2>
            <p className="text-xs text-stone-400 mt-0.5">{fullAppt.appointmentCode}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-5">
          {/* Progress Tracker */}
          <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Patient Journey</h3>
            <ProgressTracker steps={progressSteps} />
          </div>

          {/* Patient Info */}
          <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Patient</h3>
            <div className="flex items-start gap-4">
              <Avatar name={patientName} size="xl" />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-stone-900">{patientName}</p>
                {patientCode && <p className="text-xs text-stone-400 mt-0.5">{patientCode}</p>}
                {patientPhone && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm text-stone-500">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    {patientPhone}
                  </div>
                )}
                {allergies.length > 0 && (
                  <div className="flex items-start gap-2 mt-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {allergies.map((a) => (
                        <Badge key={a.allergen} variant="danger">{a.allergen}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Appointment Details */}
          <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Appointment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <DetailItem icon={<Heart className="w-4 h-4" />} label="Type" badge={<Badge variant={typeBadgeVariant(fullAppt.type)}>{appointmentTypeLabels[fullAppt.type]}</Badge>} value="" />
              <DetailItem icon={<Stethoscope className="w-4 h-4" />} label="Doctor" value={fullAppt.doctorName} />
              <DetailItem icon={<MapPin className="w-4 h-4" />} label="Room" value={fullAppt.roomName || "Not assigned"} />
              <DetailItem icon={<Clock className="w-4 h-4" />} label="Time" value={`${fullAppt.startTime} - ${fullAppt.endTime}`} />
              <DetailItem icon={<Calendar className="w-4 h-4" />} label="Date" value={new Date(fullAppt.date).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric", timeZone: CLINIC_TZ })} />
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-100">
              <Badge variant={statusBadgeVariant(currentStatus)} dot>{currentStatus.replace(/_/g, " ")}</Badge>
              {fullAppt.priority !== "NORMAL" && (
                <Badge variant={fullAppt.priority === "EMERGENCY" ? "danger" : "warning"}>{fullAppt.priority}</Badge>
              )}
            </div>
          </div>

          {/* Vitals */}
          {triage && (
            <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Vitals</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {triage.temperature != null && <VitalBox label="Temp" value={`${String(triage.temperature)} C`} />}
                {triage.systolicBP != null && triage.diastolicBP != null && <VitalBox label="BP" value={`${String(triage.systolicBP)}/${String(triage.diastolicBP)}`} />}
                {triage.heartRate != null && <VitalBox label="HR" value={`${String(triage.heartRate)} bpm`} />}
                {triage.weight != null && <VitalBox label="Weight" value={`${String(triage.weight)} kg`} />}
                {triage.oxygenSaturation != null && <VitalBox label="SpO2" value={`${String(triage.oxygenSaturation)}%`} />}
                {triage.bmi != null && <VitalBox label="BMI" value={String(triage.bmi)} />}
              </div>
              {triage.skinObservations != null && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl p-3 border border-amber-100">{String(triage.skinObservations)}</p>
              )}
            </div>
          )}

          {/* Consultation Notes */}
          {notes.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Consultation Notes ({notes.length})
              </h3>
              {notes.map((note) => (
                <div key={String(note.id)} className="bg-stone-50 rounded-xl p-3 border border-stone-100 mb-2 last:mb-0">
                  {note.diagnosis != null && <p className="text-sm font-medium text-stone-900">Dx: {String(note.diagnosis)}</p>}
                  {note.chiefComplaint != null && <p className="text-xs text-stone-500 mt-1">CC: {String(note.chiefComplaint)}</p>}
                  {note.treatmentPlan != null && <p className="text-xs text-teal-600 mt-1">Plan: {String(note.treatmentPlan)}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Prescriptions */}
          {prescriptions.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Pill className="w-3.5 h-3.5" /> Prescriptions ({prescriptions.length})
              </h3>
              {prescriptions.map((rx) => {
                const items = (rx.items as Record<string, unknown>[]) || [];
                return (
                  <div key={rx.id as string} className="bg-stone-50 rounded-xl p-3 border border-stone-100 mb-2 last:mb-0">
                    {items.map((item, i) => (
                      <p key={i} className="text-sm text-stone-700">
                        {String(item.medicineName)} — {String(item.dosage || "")} {String(item.frequency || "")}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Lab Tests */}
          {labTests.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5" /> Lab Tests ({labTests.length})
              </h3>
              {labTests.map((test) => (
                <div key={test.id as string} className="flex items-center justify-between bg-stone-50 rounded-xl p-3 border border-stone-100 mb-2 last:mb-0">
                  <p className="text-sm text-stone-700">{String(test.testName)}</p>
                  <Badge variant={test.status === "COMPLETED" ? "success" : test.status === "PROCESSING" ? "info" : "warning"}>
                    {String(test.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {fullAppt.notes && (
            <div className="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Notes</h3>
              <p className="text-sm text-stone-700 leading-relaxed bg-stone-50 rounded-xl p-4 border border-stone-100">{fullAppt.notes}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 bg-white border-t border-stone-200/70 flex items-center gap-3 flex-wrap">
          {showCheckIn && (
            <Button variant="primary" className="flex-1 rounded-2xl py-3" size="lg" iconLeft={<LogIn className="w-5 h-5" />}
              onClick={handleCheckIn} disabled={checkInMutation.isPending}>
              {checkInMutation.isPending ? "Checking in..." : "Check In"}
            </Button>
          )}
          {showStartConsultation && (
            <Button variant="primary" className="flex-1 rounded-2xl py-3" size="lg" iconLeft={<Stethoscope className="w-5 h-5" />}
              onClick={handleStartConsultation} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Starting..." : "Start Consultation"}
            </Button>
          )}
          {showCompleteVisit && (
            <Button
              variant="primary"
              className="flex-1 rounded-2xl py-3"
              size="lg"
              iconLeft={<CheckCircle className="w-5 h-5" />}
              onClick={handleCompleteVisit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Completing..." : "Complete Visit"}
            </Button>
          )}
          {showBilling && (
            <Button variant="soft" className="flex-1 rounded-2xl py-3" size="lg" iconLeft={<CreditCard className="w-5 h-5" />}
              onClick={() => {
                // 1. Mark the appointment as in billing stage (silent).
                // 2. Navigate to the most recent invoice for this
                //    appointment if one exists, else /billing so the
                //    receptionist can create one.
                // 3. Close the detail panel either way — the user has
                //    moved on to the billing surface.
                updateMutation.mutate({ id: appointment.id, data: { workflowStage: "BILLING" } });
                const latestInvoiceId = fullAppt.invoices?.[0]?.id;
                if (latestInvoiceId) {
                  router.push(`/billing/invoices/${latestInvoiceId}`);
                } else {
                  router.push("/billing");
                }
                onClose();
              }}>
              Proceed to Billing
            </Button>
          )}
          {showCheckout && (
            <Button variant="soft" className="flex-1 rounded-2xl py-3" size="lg" iconLeft={<LogOut className="w-5 h-5" />}
              onClick={() => setCheckoutOpen(true)} disabled={checkoutMutation.isPending}>
              {checkoutMutation.isPending ? "Checking out..." : "Checkout"}
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" className="rounded-2xl py-3 text-red-500 hover:text-red-600 hover:bg-red-50" size="lg"
              iconLeft={<XCircle className="w-5 h-5" />} onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          )}
          <Button variant="secondary" className="rounded-2xl py-3" size="lg" onClick={onClose}>Close</Button>
        </div>
      </div>

      <CancelAppointmentDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelConfirmed}
        patientName={patientName}
        appointmentCode={fullAppt.appointmentCode}
        appointmentTime={`${fullAppt.startTime} - ${fullAppt.endTime}`}
        doctorName={fullAppt.doctorName}
      />

      <CheckoutDialog
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onConfirmCheckout={handleCheckoutConfirmed}
        onAddBill={() => {
          // Hand off to the existing CheckInPayPanel — same component
          // the dashboard uses for "Add bill". Closing the checkout
          // dialog while the bill is being recorded keeps the modal
          // stack shallow; reception comes back to checkout via the
          // detail panel after the bill saves.
          setCheckoutOpen(false);
          setAddBillTarget(fullAppt as unknown as Appointment);
        }}
        appointmentId={fullAppt.id}
        patientName={patientName}
        invoices={(fullAppt.invoices || []) as Array<{ id: string; invoiceNumber?: string; status?: string; total?: number | string; amountPaid?: number | string; balanceDue?: number | string }>}
        submitting={checkoutMutation.isPending}
      />

      {addBillTarget && (
        <CheckInPayPanel
          appointment={addBillTarget as Parameters<typeof CheckInPayPanel>[0]["appointment"]}
          onClose={() => setAddBillTarget(null)}
          onCompleted={() => {
            setAddBillTarget(null);
            // Re-open checkout so reception can review the new bill +
            // print combined receipt without an extra navigation.
            setCheckoutOpen(true);
          }}
        />
      )}
    </>
  );
}

function DetailItem({ icon, label, value, badge }: { icon: React.ReactNode; label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-stone-400 uppercase font-medium">{label}</p>
        {badge ? <div className="mt-1">{badge}</div> : <p className="text-sm font-medium text-stone-900 mt-0.5">{value}</p>}
      </div>
    </div>
  );
}

function VitalBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-stone-50 rounded-2xl p-3 text-center border border-stone-100">
      <p className="text-[10px] text-stone-400 uppercase font-medium">{label}</p>
      <p className="text-sm font-bold text-stone-900 mt-0.5">{value}</p>
    </div>
  );
}
