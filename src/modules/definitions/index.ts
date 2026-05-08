// ============================================================
// MediCore ERP — Module Registration
// Import and register all module definitions
// ============================================================

import { register as registerDashboard } from "./dashboard";
import { register as registerPatient } from "./patient";
import { register as registerAppointment } from "./appointment";
import { register as registerConsultation } from "./consultation";
import { register as registerMedicalHistory } from "./medical-history";
import { register as registerSkinHistory } from "./skin-history";
import { register as registerProcedure } from "./procedure";
import { register as registerPrescription } from "./prescription";
import { register as registerBilling } from "./billing";
import { register as registerPayment } from "./payment";
import { register as registerFollowUp } from "./follow-up";
import { register as registerCommunication } from "./communication";
import { register as registerAITranscription } from "./ai-transcription";
import { register as registerDocuments } from "./documents";
import { register as registerImages } from "./images";
import { register as registerAdmin } from "./admin";
import { register as registerStaff } from "./staff";
import { register as registerBranch } from "./branch";
import { register as registerNotifications } from "./notifications";
import { register as registerRooms } from "./rooms";

let registered = false;

export function registerAllModules() {
  if (registered) return;
  registered = true;

  // Core patient journey
  registerDashboard();
  registerPatient();
  registerAppointment();
  registerConsultation();
  registerMedicalHistory();
  registerSkinHistory();
  registerProcedure();
  registerPrescription();
  registerBilling();
  registerPayment();
  registerFollowUp();

  // Supporting modules
  registerCommunication();
  registerAITranscription();
  registerDocuments();
  registerImages();
  registerRooms();

  // System modules
  registerAdmin();
  registerStaff();
  registerBranch();
  registerNotifications();
}
