# MediCore ERP — Complete System Architecture Blueprint

**Version:** 1.0  
**Date:** 2026-04-07  
**Market:** Pakistan (PKR currency)  
**Domain:** Skincare / Dermatology Clinic Management  

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [File Structure](#3-file-structure)
4. [Database Schema — All Entities & Relationships](#4-database-schema)
5. [All Enums & Status Flows](#5-enums-and-status-flows)
6. [Module Architecture — All 20 Modules](#6-module-architecture)
7. [Inter-Module Connection Map](#7-inter-module-connection-map)
8. [Event Bus — All System Events](#8-event-bus)
9. [Event Handler Wiring — Real State Mutations](#9-event-handler-wiring)
10. [Cross-Module Reactive State Store](#10-reactive-state-store)
11. [Source-of-Truth Data Ownership](#11-data-ownership)
12. [Role-Based Access Matrix](#12-role-based-access-matrix)
13. [Patient Journey Workflow](#13-patient-journey-workflow)
14. [API Endpoints — All Routes](#14-api-endpoints)
15. [Authentication & Security](#15-authentication)
16. [All Pages & Screens](#16-pages-and-screens)
17. [All UI Components](#17-ui-components)
18. [Navigation Structure](#18-navigation-structure)
19. [Design System](#19-design-system)
20. [Current Gaps & Improvement Opportunities](#20-gaps-and-improvements)
21. [Recommended Implementation Order](#21-implementation-order)
22. [Future Scalability Notes](#22-future-scalability)

---

## 1. SYSTEM OVERVIEW

MediCore is a modular, patient-centered Medical ERP designed for skincare and dermatology clinics in Pakistan. It transforms traditional tab-based UI navigation into 20 connected functional modules that communicate through an event bus, share data through defined ownership boundaries, and enforce role-based access at every level.

**Core Principle:** Each tab is a real system module — not just a page. Every module owns specific data, triggers actions in other modules, receives updates from connected modules, and supports role-based access.

**Design Direction:** Internally modular, externally effortless. The frontend feels simple, soft, modern, and patient-centered despite the structured backend.

---

## 2. TECHNOLOGY STACK

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.14 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL via Prisma ORM | Prisma 7.6 |
| Styling | Tailwind CSS | 4.x |
| State Management | Zustand (cross-module store) | 5.x |
| Data Fetching | @tanstack/react-query | 5.x |
| Auth | JWT (jose + bcryptjs) | Custom |
| Charts | Recharts | 3.x |
| Icons | Lucide React | 1.7 |
| UI Utilities | clsx, tailwind-merge, class-variance-authority | Latest |
| Date Handling | date-fns | 4.x |
| ID Generation | uuid | 13.x |

---

## 3. FILE STRUCTURE

```
medicore/
├── prisma/
│   ├── schema.prisma              # 41 models, 35 enums
│   ├── seed.ts                    # Development seed data
│   └── migrations/                # 3 applied migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (AuthProvider, fonts)
│   │   ├── globals.css            # Global styles, animations, scrollbar
│   │   ├── page.tsx               # Landing redirect
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Dashboard shell (ModuleProvider + Sidebar + Topbar)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── patients/page.tsx
│   │   │   ├── patients/[id]/page.tsx
│   │   │   ├── appointments/page.tsx
│   │   │   ├── appointments/check-in/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   ├── consultation/page.tsx
│   │   │   ├── follow-ups/page.tsx
│   │   │   ├── call-center/page.tsx
│   │   │   ├── call-center/callbacks/page.tsx
│   │   │   ├── rooms/page.tsx
│   │   │   ├── vitals/page.tsx
│   │   │   ├── lab-results/page.tsx
│   │   │   ├── ai/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── admin/
│   │   │       ├── users/page.tsx
│   │   │       ├── branches/page.tsx
│   │   │       ├── treatments/page.tsx
│   │   │       ├── packages/page.tsx
│   │   │       ├── schedules/page.tsx
│   │   │       ├── roles/page.tsx
│   │   │       ├── audit/page.tsx
│   │   │       ├── settings/page.tsx
│   │   │       └── reports/page.tsx
│   │   └── api/                   # 39+ API endpoints
│   │       ├── auth/              # login, signup, logout, me
│   │       ├── patients/          # CRUD + sub-resources
│   │       ├── appointments/      # CRUD + check-in/checkout/calendar
│   │       ├── billing/           # invoices + payments
│   │       ├── leads/             # CRUD
│   │       ├── follow-ups/        # CRUD
│   │       ├── lab-tests/         # list + create
│   │       ├── treatments/        # list + create
│   │       ├── packages/          # list + create
│   │       ├── rooms/             # CRUD
│   │       ├── call-logs/         # list + create
│   │       ├── notifications/     # list + mark read
│   │       ├── dashboard/         # role-based stats
│   │       ├── admin/             # users, branches, audit-log
│   │       └── ai/               # transcribe, summarize
│   ├── modules/                   # MODULE SYSTEM
│   │   ├── index.ts               # Barrel export
│   │   ├── core/
│   │   │   ├── types.ts           # ModuleDefinition, ModuleId, events, permissions
│   │   │   ├── events.ts          # EventBus singleton, 60+ SystemEvents
│   │   │   ├── registry.ts        # ModuleRegistry, entity ownership, role matrix
│   │   │   ├── hooks.ts           # useModuleAccess, useModuleEmit, useModuleNavigation
│   │   │   ├── store.ts           # Zustand cross-module reactive state
│   │   │   ├── provider.tsx       # ModuleProvider, 30+ event handler wirings
│   │   │   ├── components.tsx     # ModuleGate, ModuleVisible, ModuleActionGate
│   │   │   └── index.ts
│   │   └── definitions/           # 20 module definition files
│   │       ├── dashboard.ts
│   │       ├── patient.ts
│   │       ├── appointment.ts
│   │       ├── consultation.ts
│   │       ├── medical-history.ts
│   │       ├── skin-history.ts
│   │       ├── procedure.ts
│   │       ├── prescription.ts
│   │       ├── billing.ts
│   │       ├── payment.ts
│   │       ├── follow-up.ts
│   │       ├── communication.ts
│   │       ├── ai-transcription.ts
│   │       ├── documents.ts
│   │       ├── images.ts
│   │       ├── admin.ts
│   │       ├── staff.ts
│   │       ├── branch.ts
│   │       ├── notifications.ts
│   │       ├── rooms.ts
│   │       └── index.ts           # registerAllModules()
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx        # Module-driven navigation
│   │   │   └── topbar.tsx         # Greeting, search, notifications, user menu
│   │   ├── dashboard/             # 6 role-specific dashboards
│   │   ├── patients/
│   │   │   ├── add-patient-modal.tsx
│   │   │   └── tabs/             # 15 patient profile tabs
│   │   ├── appointments/
│   │   │   ├── create-appointment-modal.tsx
│   │   │   ├── appointment-detail.tsx
│   │   │   └── calendar-view.tsx
│   │   ├── billing/
│   │   │   ├── create-invoice-modal.tsx
│   │   │   └── payment-modal.tsx
│   │   ├── call-center/
│   │   │   └── new-lead-modal.tsx
│   │   └── ui/                   # 20 reusable UI components
│   ├── lib/
│   │   ├── auth.ts               # JWT, session, password hashing
│   │   ├── auth-context.tsx      # React auth context/provider
│   │   ├── prisma.ts             # Prisma client singleton
│   │   ├── api.ts                # Frontend API client helpers
│   │   ├── utils.ts              # formatCurrency(PKR), formatDate, cn(), etc.
│   │   ├── constants.ts          # Colors, labels, module IDs
│   │   └── mock-data.ts          # 22,000+ lines of development mock data
│   ├── types/
│   │   └── index.ts              # All TypeScript interfaces and enums
│   └── middleware.ts             # Route protection, JWT validation
```

---

## 4. DATABASE SCHEMA

### 4.1 All Models (41 total)

#### CORE IDENTITY

**Branch** — Clinic location
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| name | VarChar(120) | |
| code | VarChar(10) | UNIQUE |
| address | Text | |
| phone | VarChar(20) | |
| email | VarChar(120) | |
| timezone | VarChar(40) | Default: "UTC" |
| isActive | Boolean | Default: true |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**User** — Staff member
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| email | VarChar(180) | UNIQUE |
| passwordHash | VarChar(255) | bcrypt, 12 rounds |
| name | VarChar(120) | |
| phone | VarChar(20) | Nullable |
| avatar | Text | Nullable |
| role | UserRole enum | |
| branchId | UUID | FK → Branch |
| speciality | VarChar(100) | Nullable, for doctors |
| licenseNumber | VarChar(60) | Nullable |
| isActive | Boolean | Default: true |
| lastLoginAt | DateTime | Nullable |
| createdAt/updatedAt | DateTime | |

**Permission** — Granular access control
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| userId | UUID | FK → User (cascade) |
| module | VarChar(60) | e.g., "PATIENT" |
| action | VarChar(20) | VIEW/CREATE/EDIT/DELETE/EXPORT |
| granted | Boolean | Default: false |
| | | UNIQUE: [userId, module, action] |

**AuditLog** — Compliance trail
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| userId | UUID | FK → User |
| action | VarChar(30) | |
| module | VarChar(60) | |
| entityType | VarChar(60) | |
| entityId | VarChar(60) | |
| details | JSON | Nullable |
| ipAddress | VarChar(45) | |
| userAgent | VarChar(300) | |
| createdAt | DateTime | |

#### PATIENT DOMAIN

**Patient** — Central entity
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| patientCode | VarChar(20) | UNIQUE, auto "PT-XXXX" |
| firstName | VarChar(60) | |
| middleName | VarChar(60) | Nullable |
| lastName | VarChar(60) | |
| email | VarChar(180) | Nullable |
| phone | VarChar(20) | |
| dateOfBirth | Date | |
| gender | Gender enum | |
| nationality | VarChar(60) | Nullable |
| address | Text | Nullable |
| city | VarChar(80) | Nullable |
| emergencyContact | VarChar(120) | Nullable |
| emergencyPhone | VarChar(20) | Nullable |
| bloodType | VarChar(5) | Nullable |
| skinType | SkinTypeScale enum | Nullable, Fitzpatrick I-VI |
| branchId | UUID | FK → Branch |
| assignedDoctorId | UUID | Nullable, FK → User |
| profileImage | Text | Nullable |
| notes | Text | Nullable |
| source | LeadSourceType | Nullable |
| consentGiven | Boolean | Default: false |
| isVip | Boolean | Default: false |
| isActive | Boolean | Default: true |
| deletedAt | DateTime | Nullable, soft delete |
| createdAt/updatedAt | DateTime | |

**PatientAllergy** — Allergy records
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| allergen | VarChar(120) |
| severity | Severity enum (MILD/MODERATE/SEVERE) |
| reaction | VarChar(200) Nullable |
| notes | Text Nullable |
| createdAt | DateTime |

**PatientMedication** — Active medications
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| name | VarChar(150) |
| dosage | VarChar(80) Nullable |
| frequency | VarChar(80) Nullable |
| prescriber | VarChar(120) Nullable |
| startDate | DateTime Nullable |
| endDate | DateTime Nullable |
| isActive | Boolean default true |
| createdAt | DateTime |

**MedicalHistory** — Conditions/diagnoses
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| condition | VarChar(200) |
| diagnosedDate | Date Nullable |
| status | ConditionStatus enum (ACTIVE/RESOLVED/CHRONIC) |
| notes | Text Nullable |
| createdAt | DateTime |

**SkinHistory** — Dermatology-specific
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| condition | VarChar(200) |
| affectedArea | VarChar(200) |
| severity | Severity enum |
| onsetDate | Date Nullable |
| treatmentHistory | Text Nullable |
| notes | Text Nullable |
| images | String[] array |
| createdAt | DateTime |

**Insurance** — Patient policies
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| provider | VarChar(120) |
| policyNumber | VarChar(60) |
| coverageType | VarChar(40) Nullable |
| copayAmount | Decimal(10,2) Nullable |
| expiryDate | Date Nullable |
| isActive | Boolean default true |
| createdAt | DateTime |

**PatientTag** — Labels/categories
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient (cascade) |
| tag | VarChar(50) |
| color | VarChar(7) Nullable, hex |
| createdAt | DateTime |
| | UNIQUE: [patientId, tag] |

#### SCHEDULING DOMAIN

**Appointment** — Visit scheduling
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| appointmentCode | VarChar(20) | UNIQUE, auto "APT-XXXX" |
| patientId | UUID | FK → Patient |
| doctorId | UUID | FK → User |
| branchId | UUID | FK → Branch |
| roomId | UUID | Nullable, FK → Room |
| date | Date | |
| startTime | VarChar(5) | "HH:MM" |
| endTime | VarChar(5) | "HH:MM" |
| durationMinutes | Int | Default: 30 |
| type | AppointmentType enum | |
| status | AppointmentStatus enum | Default: SCHEDULED |
| notes | Text | Nullable |
| priority | Priority enum | Default: NORMAL |
| waitlistPosition | Int | Nullable |
| checkinTime | DateTime | Nullable |
| checkoutTime | DateTime | Nullable |
| workflowStage | WorkflowStage enum | Default: BOOKED |
| cancellationNote | Text | Nullable |
| createdById | UUID | FK → User |
| createdAt/updatedAt | DateTime | |

**Room** — Physical spaces
| Field | Type |
|-------|------|
| id | UUID PK |
| branchId | UUID FK → Branch |
| name | VarChar(80) |
| number | VarChar(10) Nullable |
| floor | Int Nullable |
| type | RoomType enum |
| status | RoomStatus enum default AVAILABLE |
| isAvailable | Boolean default true |
| capacity | Int default 1 |
| equipment | Text Nullable |
| createdAt/updatedAt | DateTime |

**RoomAllocation** — Patient-room assignments
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID |
| roomId | UUID FK → Room |
| doctorId | UUID |
| bedNumber | VarChar(10) Nullable |
| admissionDate | DateTime |
| dischargeDate | DateTime Nullable |
| status | AllocationStatus enum (ACTIVE/DISCHARGED) |
| notes | Text Nullable |
| createdAt | DateTime |

**DoctorSchedule** — Weekly availability
| Field | Type |
|-------|------|
| id | UUID PK |
| doctorId | UUID FK → User (cascade) |
| dayOfWeek | DayOfWeek enum |
| startTime | VarChar(5) |
| endTime | VarChar(5) |
| breakStart | VarChar(5) Nullable |
| breakEnd | VarChar(5) Nullable |
| slotMinutes | Int default 30 |
| maxPatients | Int Nullable |
| isActive | Boolean default true |
| effectiveFrom | Date |
| effectiveTo | Date Nullable |
| | UNIQUE: [doctorId, dayOfWeek, effectiveFrom] |

**DoctorLeave** — Leave management
| Field | Type |
|-------|------|
| id | UUID PK |
| doctorId | UUID FK → User (cascade) |
| type | LeaveType enum |
| startDate | Date |
| endDate | Date |
| reason | Text Nullable |
| status | LeaveStatus enum default PENDING |
| approvedBy | VarChar(120) Nullable |
| createdAt/updatedAt | DateTime |

**Waitlist** — Appointment waitlist
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID |
| patientName | VarChar(120) denormalized |
| phone | VarChar(20) |
| doctorId | UUID Nullable |
| preferredDate | Date Nullable |
| preferredTime | VarChar(5) Nullable |
| appointmentType | AppointmentType enum |
| priority | Priority enum default NORMAL |
| notes | Text Nullable |
| isNotified | Boolean default false |
| bookedAppointmentId | VarChar(60) Nullable |
| createdAt | DateTime |

#### CLINICAL DOMAIN

**ConsultationNote** — Doctor's clinical notes
| Field | Type |
|-------|------|
| id | UUID PK |
| appointmentId | UUID FK → Appointment |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| chiefComplaint | Text Nullable |
| symptoms | Text Nullable |
| examination | Text Nullable |
| skinAssessment | Text Nullable (derm-specific) |
| affectedAreas | String[] array |
| conditionSeverity | Severity enum Nullable |
| diagnosis | Text Nullable |
| differentialDx | Text Nullable |
| treatmentPlan | Text Nullable |
| advice | Text Nullable |
| internalNotes | Text Nullable (not patient-visible) |
| followUpDate | Date Nullable |
| followUpNotes | Text Nullable |
| isSigned | Boolean default false |
| signedAt | DateTime Nullable |
| createdAt/updatedAt | DateTime |

**Treatment** — Treatment catalog
| Field | Type |
|-------|------|
| id | UUID PK |
| name | VarChar(150) |
| code | VarChar(20) Nullable UNIQUE |
| category | TreatmentCategory enum |
| description | Text Nullable |
| duration | Int (minutes) |
| basePrice | Decimal(10,2) |
| preInstructions | Text Nullable |
| postInstructions | Text Nullable |
| contraindications | Text Nullable |
| isActive | Boolean default true |
| createdAt/updatedAt | DateTime |

**Procedure** — Executed treatments
| Field | Type |
|-------|------|
| id | UUID PK |
| appointmentId | UUID FK → Appointment |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| treatmentId | UUID FK → Treatment |
| areasTreated | String[] array |
| settings | JSON Nullable (laser power, peel %, etc.) |
| notes | Text Nullable |
| outcome | Text Nullable |
| complications | Text Nullable |
| beforeImages | String[] array |
| afterImages | String[] array |
| consentSigned | Boolean default false |
| performedAt | DateTime default now |
| createdAt | DateTime |

**Prescription** — Medication orders
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| appointmentId | UUID Nullable FK → Appointment |
| notes | Text Nullable |
| isActive | Boolean default true |
| createdAt | DateTime |

**PrescriptionItem** — Individual medicines
| Field | Type |
|-------|------|
| id | UUID PK |
| prescriptionId | UUID FK → Prescription (cascade) |
| medicineName | VarChar(200) |
| dosage | VarChar(100) Nullable |
| frequency | VarChar(60) Nullable (OD/BD/TDS/QDS) |
| duration | VarChar(60) Nullable |
| route | VarChar(40) Nullable (Topical/Oral) |
| instructions | Text Nullable |

**LabTest** — Lab orders and results
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| appointmentId | UUID Nullable FK → Appointment |
| testName | VarChar(150) |
| testCode | VarChar(20) Nullable |
| status | LabTestStatus enum default REQUESTED |
| priority | Priority enum default NORMAL |
| results | JSON Nullable |
| technician | VarChar(120) Nullable |
| collectedAt | DateTime Nullable |
| completedAt | DateTime Nullable |
| notes | Text Nullable |
| createdAt | DateTime |

**PatientDocument** — Files and reports
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| name | VarChar(200) |
| type | DocumentType enum |
| fileUrl | Text |
| fileSize | Int Nullable |
| mimeType | VarChar(60) Nullable |
| uploadedById | UUID FK → User |
| notes | Text Nullable |
| createdAt | DateTime |

**ConsentForm** — Digital consent tracking
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| appointmentId | UUID Nullable FK → Appointment |
| title | VarChar(200) |
| templateKey | VarChar(60) Nullable |
| content | Text |
| status | ConsentStatus enum default PENDING |
| signedAt | DateTime Nullable |
| signatureUrl | Text Nullable |
| ipAddress | VarChar(45) Nullable |
| witnessName | VarChar(120) Nullable |
| expiresAt | DateTime Nullable |
| createdAt | DateTime |

**Triage** — Vitals / vital signs
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| appointmentId | UUID Nullable FK → Appointment |
| temperature | Float Nullable |
| temperatureUnit | VarChar(2) Nullable ("C"/"F") |
| systolicBP | Int Nullable |
| diastolicBP | Int Nullable |
| heartRate | Int Nullable |
| respiratoryRate | Int Nullable |
| weight | Float Nullable (kg) |
| height | Float Nullable (cm) |
| bmi | Float Nullable (auto-calculated) |
| oxygenSaturation | Float Nullable |
| painLevel | Int Nullable (0-10) |
| notes | Text Nullable |
| skinObservations | Text Nullable |
| moistureLevel | Int Nullable (1-5) |
| oilinessLevel | Int Nullable (1-5) |
| urgencyLevel | UrgencyLevel enum default ROUTINE |
| recordedById | UUID FK → User |
| createdAt | DateTime |

**AITranscription** — AI consultation transcripts
| Field | Type |
|-------|------|
| id | UUID PK |
| appointmentId | UUID FK → Appointment |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| rawTranscript | Text Nullable |
| structuredNote | JSON Nullable |
| summary | Text Nullable |
| status | TranscriptionStatus enum default RECORDING |
| duration | Int Nullable (seconds) |
| language | VarChar(10) Nullable |
| createdAt | DateTime |

#### BILLING DOMAIN

**Invoice** — Financial records
| Field | Type |
|-------|------|
| id | UUID PK |
| invoiceNumber | VarChar(30) UNIQUE, auto "INV-YYYY-XXXX" |
| patientId | UUID FK → Patient |
| appointmentId | UUID Nullable FK → Appointment |
| branchId | UUID FK → Branch |
| items | JSON (line items array) |
| subtotal | Decimal(10,2) |
| discount | Decimal(10,2) default 0 |
| discountType | DiscountType enum default FIXED |
| tax | Decimal(10,2) default 0 |
| total | Decimal(10,2) |
| amountPaid | Decimal(10,2) default 0 |
| balanceDue | Decimal(10,2) default 0 |
| status | InvoiceStatus enum default DRAFT |
| dueDate | Date Nullable |
| notes | Text Nullable |
| createdById | UUID FK → User |
| createdAt/updatedAt | DateTime |

**Payment** — Payment transactions
| Field | Type |
|-------|------|
| id | UUID PK |
| invoiceId | UUID FK → Invoice |
| amount | Decimal(10,2) |
| method | PaymentMethodType enum |
| reference | VarChar(100) Nullable |
| status | PaymentStatusType enum default PENDING |
| processedById | UUID FK → User |
| processedAt | DateTime Nullable |
| notes | Text Nullable |
| createdAt | DateTime |

**Refund** — Refund transactions
| Field | Type |
|-------|------|
| id | UUID PK |
| invoiceId | UUID FK → Invoice |
| amount | Decimal(10,2) |
| reason | Text |
| status | RefundStatus enum default REQUESTED |
| method | PaymentMethodType Nullable |
| reference | VarChar(100) Nullable |
| approvedById | UUID Nullable |
| processedById | UUID Nullable FK → User |
| processedAt | DateTime Nullable |
| notes | Text Nullable |
| createdAt/updatedAt | DateTime |

**Package** — Treatment bundles
| Field | Type |
|-------|------|
| id | UUID PK |
| name | VarChar(120) |
| description | Text Nullable |
| treatments | JSON array |
| price | Decimal(10,2) |
| validityDays | Int |
| maxRedemptions | Int Nullable |
| isActive | Boolean default true |
| createdAt/updatedAt | DateTime |

**PatientPackage** — Purchased packages
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| packageId | UUID FK → Package |
| purchaseDate | Date |
| expiryDate | Date |
| remainingSessions | JSON |
| status | PackageStatus enum default ACTIVE |
| invoiceId | VarChar(60) Nullable |
| createdAt | DateTime |

**Product** — Skincare product inventory
| Field | Type |
|-------|------|
| id | UUID PK |
| name | VarChar(150) |
| sku | VarChar(30) Nullable UNIQUE |
| barcode | VarChar(30) Nullable |
| category | ProductCategory enum |
| brand | VarChar(80) Nullable |
| description | Text Nullable |
| costPrice | Decimal(10,2) |
| sellPrice | Decimal(10,2) |
| quantity | Int default 0 |
| reorderLevel | Int default 5 |
| unit | VarChar(20) Nullable |
| expiryDate | Date Nullable |
| branchId | UUID FK → Branch |
| isActive | Boolean default true |
| imageUrl | Text Nullable |
| createdAt/updatedAt | DateTime |

#### COMMUNICATION DOMAIN

**Lead** — Sales leads
| Field | Type |
|-------|------|
| id | UUID PK |
| name | VarChar(120) |
| phone | VarChar(20) |
| email | VarChar(180) Nullable |
| source | LeadSourceType enum |
| status | LeadStatusType enum default NEW |
| interest | VarChar(200) Nullable |
| assignedToId | UUID FK → User |
| branchId | UUID FK → Branch |
| notes | Text Nullable |
| convertedPatientId | UUID Nullable FK → Patient |
| callbackDate | DateTime Nullable |
| createdAt/updatedAt | DateTime |

**CallLog** — Call records
| Field | Type |
|-------|------|
| id | UUID PK |
| leadId | UUID Nullable FK → Lead |
| patientId | UUID Nullable FK → Patient |
| userId | UUID FK → User |
| type | Direction enum (INBOUND/OUTBOUND) |
| duration | Int Nullable (seconds) |
| notes | Text Nullable |
| outcome | CallOutcome enum |
| createdAt | DateTime |

**CommunicationLog** — Multi-channel messages
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| type | CommChannel enum (CALL/SMS/EMAIL/WHATSAPP) |
| direction | Direction enum |
| subject | VarChar(200) Nullable |
| content | Text Nullable |
| sentById | UUID FK → User |
| createdAt | DateTime |

**FollowUp** — Post-visit follow-ups
| Field | Type |
|-------|------|
| id | UUID PK |
| patientId | UUID FK → Patient |
| doctorId | UUID FK → User |
| appointmentId | UUID Nullable FK → Appointment |
| dueDate | Date |
| reason | VarChar(300) |
| status | FollowUpStatus enum default PENDING |
| notes | Text Nullable |
| completedAt | DateTime Nullable (auto-set when status=COMPLETED) |
| createdAt | DateTime |

**Notification** — User alerts
| Field | Type |
|-------|------|
| id | UUID PK |
| userId | UUID FK → User (cascade) |
| title | VarChar(200) |
| message | Text |
| type | NotificationType enum |
| isRead | Boolean default false |
| link | VarChar(300) Nullable |
| createdAt | DateTime |

**SystemSetting** — Configuration
| Field | Type |
|-------|------|
| id | UUID PK |
| key | VarChar(100) UNIQUE |
| value | Text |
| group | VarChar(40) |
| label | VarChar(120) |
| type | VarChar(20) (string/number/boolean/json) |
| updatedAt/createdAt | DateTime |

### 4.2 Key Relationships

```
Branch ──< User ──< Permission
  │          │──< AuditLog
  │          │──< DoctorSchedule
  │          │──< DoctorLeave
  │          │──< Notification
  │
  │──< Patient ──< PatientAllergy
  │     │──< PatientMedication
  │     │──< MedicalHistory
  │     │──< SkinHistory
  │     │──< Insurance
  │     │──< PatientTag
  │     │──< PatientDocument
  │     │──< PatientPackage
  │     │──< CommunicationLog
  │     │──< CallLog
  │     │──< ConsentForm
  │     │
  │     │──< Appointment ──< ConsultationNote
  │     │     │──< Procedure
  │     │     │──< Prescription ──< PrescriptionItem
  │     │     │──< LabTest
  │     │     │──< FollowUp
  │     │     │──< AITranscription
  │     │     │──< Triage
  │     │     │──< ConsentForm
  │     │     │──< Invoice ──< Payment
  │     │                   ──< Refund
  │     │
  │     │──< Lead ──< CallLog
  │
  │──< Room ──< RoomAllocation
  │──< Product
  │──< Invoice
  │──< Lead
  
Treatment ──< Procedure
Package ──< PatientPackage
```

---

## 5. ENUMS AND STATUS FLOWS

### 5.1 All Enums (35 total)

| Enum | Values |
|------|--------|
| UserRole | SUPER_ADMIN, ADMIN, DOCTOR, RECEPTIONIST, BILLING, CALL_CENTER, ASSISTANT |
| Gender | MALE, FEMALE, OTHER |
| AppointmentType | CONSULTATION, PROCEDURE, FOLLOW_UP, REVIEW, EMERGENCY |
| AppointmentStatus | SCHEDULED, CONFIRMED, CHECKED_IN, WAITING, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW, RESCHEDULED |
| Priority | NORMAL, URGENT, EMERGENCY |
| InvoiceStatus | DRAFT, PENDING, PAID, PARTIAL, OVERDUE, CANCELLED, REFUNDED |
| DiscountType | PERCENTAGE, FIXED |
| PaymentMethodType | CASH, CARD, BANK_TRANSFER, DIGITAL_WALLET, INSURANCE, PACKAGE_DEDUCTION |
| PaymentStatusType | PENDING, COMPLETED, FAILED, REFUNDED |
| LeadStatusType | NEW, CONTACTED, INTERESTED, BOOKED, NOT_INTERESTED, FOLLOW_UP |
| LeadSourceType | CALL, WALK_IN, WEBSITE, SOCIAL_MEDIA, REFERRAL |
| TreatmentCategory | LASER, CHEMICAL_PEEL, FACIAL, INJECTABLE, SURGICAL, OTHER |
| LabTestStatus | REQUESTED, SAMPLE_COLLECTED, PROCESSING, COMPLETED, CANCELLED |
| DocumentType | REPORT, IMAGE, CONSENT, PRESCRIPTION, LAB_RESULT, BEFORE_AFTER, OTHER |
| RoomType | CONSULTATION, PROCEDURE, WAITING, RECOVERY |
| RoomStatus | AVAILABLE, OCCUPIED, CLEANING, MAINTENANCE |
| FollowUpStatus | PENDING, COMPLETED, MISSED, CANCELLED |
| Severity | MILD, MODERATE, SEVERE |
| ConditionStatus | ACTIVE, RESOLVED, CHRONIC |
| PackageStatus | ACTIVE, EXPIRED, CANCELLED |
| TranscriptionStatus | RECORDING, PROCESSING, COMPLETED, FAILED |
| NotificationType | APPOINTMENT, BILLING, LAB, FOLLOW_UP, SYSTEM, ALERT |
| CommChannel | CALL, SMS, EMAIL, WHATSAPP |
| Direction | INBOUND, OUTBOUND |
| CallOutcome | BOOKED, CALLBACK, NOT_INTERESTED, NO_ANSWER, INFO_PROVIDED |
| AllocationStatus | ACTIVE, DISCHARGED |
| WorkflowStage | INQUIRY, BOOKED, CHECKIN, WAITING, CONSULT, DIAGNOSIS, TREATMENT, PRESCRIPTION, BILLING, PAYMENT, CHECKOUT, FOLLOWUP, HISTORY_UPDATE |
| UrgencyLevel | ROUTINE, URGENT, EMERGENCY |
| SkinTypeScale | TYPE_I, TYPE_II, TYPE_III, TYPE_IV, TYPE_V, TYPE_VI |
| DayOfWeek | MONDAY–SUNDAY |
| RefundStatus | REQUESTED, APPROVED, PROCESSED, REJECTED |
| ConsentStatus | PENDING, SIGNED, DECLINED, EXPIRED |
| ProductCategory | CLEANSER, MOISTURIZER, SUNSCREEN, SERUM, TREATMENT, SUPPLEMENT, TOOL, OTHER |
| LeaveType | VACATION, SICK, PERSONAL, CONFERENCE, TRAINING |
| LeaveStatus | PENDING, APPROVED, REJECTED, CANCELLED |

### 5.2 Key State Flows

**Appointment Status Flow:**
```
SCHEDULED → CONFIRMED → CHECKED_IN → WAITING → IN_PROGRESS → COMPLETED
    │                                                              │
    ├→ CANCELLED                                                   └→ (triggers follow-up check)
    ├→ RESCHEDULED → SCHEDULED
    └→ NO_SHOW
```

**Workflow Stage Flow (Patient Journey):**
```
INQUIRY → BOOKED → CHECKIN → WAITING → CONSULT → DIAGNOSIS → TREATMENT → PRESCRIPTION → BILLING → PAYMENT → CHECKOUT → FOLLOWUP → HISTORY_UPDATE
```

**Invoice Status Flow:**
```
DRAFT → PENDING → PAID (when balanceDue = 0)
                → PARTIAL (when 0 < amountPaid < total)
                → OVERDUE (when past dueDate)
                → CANCELLED
                → REFUNDED
```

**Lead Status Flow:**
```
NEW → CONTACTED → INTERESTED → BOOKED (→ converted to Patient)
                             → FOLLOW_UP → CONTACTED
                → NOT_INTERESTED
```

**Lab Test Status Flow:**
```
REQUESTED → SAMPLE_COLLECTED → PROCESSING → COMPLETED
                                           → CANCELLED
```

---

## 6. MODULE ARCHITECTURE — ALL 20 MODULES

### MOD-DASHBOARD
| Attribute | Value |
|-----------|-------|
| **Purpose** | Role-specific command center showing key metrics, today's schedule, quick actions, and real-time activity feed |
| **Primary Roles** | All roles |
| **Workflow Position** | SYSTEM |
| **Route** | /dashboard |
| **Nav Order** | 1 |
| **Sections** | DASHBOARD-STATS (Key Metrics), DASHBOARD-SCHEDULE (Today's Schedule), DASHBOARD-ACTIONS (Quick Actions), DASHBOARD-ACTIVITY (Activity Feed), DASHBOARD-ALERTS (Alerts) |
| **Owned Entities** | None |
| **Data Received From** | MOD-APPOINTMENT (today's appointments), MOD-PATIENT (counts), MOD-BILLING (revenue), MOD-FOLLOWUP (due count), MOD-COMMUNICATION (leads), MOD-ROOMS (availability), MOD-NOTIFICATIONS (unread) |
| **Subscribed Events** | appointment.booked, appointment.checked_in, appointment.completed, patient.created, billing.invoice_created, payment.received, followup.scheduled, communication.lead_created, lab.results_ready |
| **Permissions** | VIEW: all roles, EXPORT: SUPER_ADMIN, ADMIN |

### MOD-PATIENT
| Attribute | Value |
|-----------|-------|
| **Purpose** | Central patient management hub. Registration, demographics, insurance, unified workspace pulling from all clinical modules |
| **Primary Roles** | SUPER_ADMIN, ADMIN, DOCTOR, RECEPTIONIST, ASSISTANT |
| **Workflow Position** | REGISTRATION |
| **Route** | /patients |
| **Nav Order** | 2 |
| **Sections** | PATIENT-LIST, PATIENT-REGISTRATION, PATIENT-PROFILE, PATIENT-OVERVIEW, PATIENT-INSURANCE, PATIENT-TAGS |
| **Actions** | PATIENT-CREATE (→ patient.created), PATIENT-EDIT (→ patient.updated), PATIENT-DEACTIVATE (→ patient.deactivated), PATIENT-EXPORT |
| **Owned Entities** | Patient, Insurance, PatientTag |
| **Data Received From** | MOD-APPOINTMENT, MOD-CONSULTATION, MOD-MEDICAL-HISTORY, MOD-SKIN-HISTORY, MOD-PROCEDURE, MOD-PRESCRIPTION, MOD-BILLING, MOD-DOCUMENTS, MOD-IMAGES, MOD-FOLLOWUP, MOD-COMMUNICATION, MOD-AI-TRANSCRIPTION |
| **Emitted Events** | patient.created, patient.updated, patient.deactivated |
| **Permissions** | VIEW: all roles, CREATE: SUPER_ADMIN/ADMIN/RECEPTIONIST, EDIT: SUPER_ADMIN/ADMIN/DOCTOR/RECEPTIONIST/ASSISTANT, DELETE: SUPER_ADMIN/ADMIN |

### MOD-APPOINTMENT
| Attribute | Value |
|-----------|-------|
| **Purpose** | End-to-end appointment lifecycle: scheduling, calendar, check-in, waiting queue, room assignment, workflow tracking, checkout |
| **Primary Roles** | SUPER_ADMIN, ADMIN, DOCTOR, RECEPTIONIST, ASSISTANT |
| **Workflow Position** | BOOKING |
| **Route** | /appointments |
| **Nav Order** | 3 |
| **Sections** | APPOINTMENT-LIST, APPOINTMENT-CALENDAR, APPOINTMENT-CHECKIN, APPOINTMENT-QUEUE, APPOINTMENT-DETAIL, APPOINTMENT-TRIAGE |
| **Actions** | APPOINTMENT-CREATE (→ appointment.booked), APPOINTMENT-CHECKIN-ACTION (→ appointment.checked_in), APPOINTMENT-START (→ appointment.started), APPOINTMENT-COMPLETE (→ appointment.completed), APPOINTMENT-CANCEL (→ appointment.cancelled), APPOINTMENT-RESCHEDULE (→ appointment.rescheduled), APPOINTMENT-RECORD-VITALS (→ vitals.recorded) |
| **Owned Entities** | Appointment, Triage, Waitlist |
| **Dependencies** | MOD-PATIENT, MOD-STAFF |
| **Permissions** | VIEW: all roles, CREATE: SUPER_ADMIN/ADMIN/RECEPTIONIST/CALL_CENTER, EDIT: SUPER_ADMIN/ADMIN/DOCTOR/RECEPTIONIST/ASSISTANT |

### MOD-CONSULTATION
| Attribute | Value |
|-----------|-------|
| **Purpose** | Doctor's clinical workspace. Chief complaint, symptoms, examination, skin assessment, diagnosis, treatment plan. Bridge between check-in and treatment/billing |
| **Primary Roles** | DOCTOR |
| **Workflow Position** | CONSULTATION |
| **Route** | /consultation |
| **Nav Order** | 4 |
| **Patient Submodule** | Yes |
| **Sections** | CONSULTATION-WORKSPACE, CONSULTATION-NOTES, CONSULTATION-DIAGNOSIS, CONSULTATION-PLAN, CONSULTATION-HISTORY |
| **Actions** | CONSULTATION-START (→ consultation.started), CONSULTATION-SAVE-NOTE (→ consultation.note_saved), CONSULTATION-COMPLETE (→ consultation.completed), CONSULTATION-ADD-DIAGNOSIS (→ consultation.diagnosis_added), CONSULTATION-ORDER-LAB (→ lab.test_ordered) |
| **Owned Entities** | ConsultationNote, LabTest |
| **Data Sent To** | MOD-MEDICAL-HISTORY, MOD-SKIN-HISTORY, MOD-PRESCRIPTION, MOD-PROCEDURE, MOD-FOLLOWUP, MOD-AI-TRANSCRIPTION, MOD-BILLING |
| **Permissions** | VIEW: SUPER_ADMIN/ADMIN/DOCTOR, CREATE/EDIT: DOCTOR |

### MOD-MEDICAL-HISTORY
| Attribute | Value |
|-----------|-------|
| **Purpose** | Longitudinal record of patient medical conditions, allergies, chronic diseases, diagnosis history |
| **Primary Roles** | DOCTOR |
| **Workflow Position** | HISTORY_UPDATE |
| **Patient Submodule** | Yes |
| **Nav Order** | 5 |
| **Sections** | MEDHISTORY-CONDITIONS, MEDHISTORY-ALLERGIES, MEDHISTORY-MEDICATIONS, MEDHISTORY-TIMELINE |
| **Owned Entities** | MedicalHistory, PatientAllergy, PatientMedication |
| **Subscribed Events** | consultation.diagnosis_added, prescription.created |

### MOD-SKIN-HISTORY
| Attribute | Value |
|-----------|-------|
| **Purpose** | Dermatology-specific: skin conditions, Fitzpatrick type, affected areas, severity, treatment responses, before/after progression |
| **Primary Roles** | DOCTOR |
| **Workflow Position** | HISTORY_UPDATE |
| **Patient Submodule** | Yes |
| **Nav Order** | 6 |
| **Sections** | SKINHISTORY-CONDITIONS, SKINHISTORY-ASSESSMENT, SKINHISTORY-AREAS, SKINHISTORY-PROGRESS |
| **Owned Entities** | SkinHistory |
| **Subscribed Events** | consultation.completed, procedure.completed, images.before_after_created |

### MOD-PRESCRIPTION
| Attribute | Value |
|-----------|-------|
| **Purpose** | Medication orders from consultations. Tracks medicine, dosage, frequency, duration, route, instructions. Updates active medication list |
| **Primary Roles** | DOCTOR |
| **Workflow Position** | PRESCRIPTION |
| **Patient Submodule** | Yes |
| **Nav Order** | 7 |
| **Owned Entities** | Prescription, PrescriptionItem |
| **Emitted Events** | prescription.created, prescription.updated |
| **Data Sent To** | MOD-MEDICAL-HISTORY (active medications), MOD-BILLING (charges) |

### MOD-BILLING
| Attribute | Value |
|-----------|-------|
| **Purpose** | Revenue management. Invoices from consultations/procedures/products. Tracks discounts, taxes, insurance, package deductions, overdue accounts |
| **Primary Roles** | BILLING, ADMIN |
| **Workflow Position** | BILLING |
| **Route** | /billing |
| **Nav Order** | 8 |
| **Patient Submodule** | Yes |
| **Sections** | BILLING-INVOICES, BILLING-CREATE-INVOICE, BILLING-PACKAGES, BILLING-PRODUCTS, BILLING-REVENUE, BILLING-INSURANCE |
| **Owned Entities** | Invoice, Package, PatientPackage, Product |
| **Emitted Events** | billing.invoice_created, billing.invoice_updated, billing.invoice_sent, billing.invoice_overdue |
| **Subscribed Events** | consultation.completed, procedure.completed, prescription.created, payment.received, payment.refunded |
| **Permissions** | VIEW: SUPER_ADMIN/ADMIN/DOCTOR/RECEPTIONIST/BILLING, CREATE/EDIT/DELETE/EXPORT: SUPER_ADMIN/ADMIN/BILLING |

### MOD-PAYMENT
| Attribute | Value |
|-----------|-------|
| **Purpose** | Payment collection. Supports cash, card, bank transfer, digital wallet, insurance, package deductions. Refunds. Triggers checkout |
| **Primary Roles** | BILLING, ADMIN |
| **Workflow Position** | PAYMENT |
| **Patient Submodule** | Yes |
| **Nav Order** | 9 |
| **Sections** | PAYMENT-COLLECT, PAYMENT-HISTORY, PAYMENT-REFUNDS, PAYMENT-CHECKOUT |
| **Owned Entities** | Payment, Refund |
| **Emitted Events** | payment.received, payment.failed, payment.refunded, payment.checkout_completed |
| **Permissions** | VIEW: SUPER_ADMIN/ADMIN/BILLING/RECEPTIONIST, CREATE/EDIT: SUPER_ADMIN/ADMIN/BILLING |

### MOD-PROCEDURE
| Attribute | Value |
|-----------|-------|
| **Purpose** | Treatment catalog and procedure execution. Areas treated, device settings, before/after images, outcomes, consent. Sends charges to billing |
| **Primary Roles** | DOCTOR, ADMIN |
| **Workflow Position** | TREATMENT |
| **Route** | /admin/treatments |
| **Nav Order** | 10 |
| **Patient Submodule** | Yes |
| **Owned Entities** | Treatment, Procedure |
| **Emitted Events** | procedure.scheduled, procedure.started, procedure.completed, procedure.images_uploaded |
| **Data Sent To** | MOD-BILLING (charges), MOD-IMAGES (before/after), MOD-SKIN-HISTORY (progress) |

### MOD-FOLLOWUP
| Attribute | Value |
|-----------|-------|
| **Purpose** | Post-visit follow-up scheduling and tracking. Due dates, completion status, reminders. Links to appointments for rebooking |
| **Primary Roles** | DOCTOR, RECEPTIONIST |
| **Workflow Position** | FOLLOW_UP |
| **Route** | /follow-ups |
| **Nav Order** | 11 |
| **Patient Submodule** | Yes |
| **Sections** | FOLLOWUP-DUE-TODAY, FOLLOWUP-OVERDUE, FOLLOWUP-UPCOMING, FOLLOWUP-COMPLETED |
| **Owned Entities** | FollowUp |
| **Emitted Events** | followup.scheduled, followup.completed, followup.missed, followup.reminder_sent |
| **Subscribed Events** | consultation.completed, procedure.completed, appointment.completed |

### MOD-COMMUNICATION
| Attribute | Value |
|-----------|-------|
| **Purpose** | Lead management and multi-channel patient communication. Calls, callbacks, lead-to-patient conversion, SMS, email, WhatsApp |
| **Primary Roles** | CALL_CENTER |
| **Workflow Position** | INQUIRY |
| **Route** | /call-center |
| **Nav Order** | 12 |
| **Patient Submodule** | Yes |
| **Sections** | COMM-LEADS, COMM-CALLBACKS, COMM-CALL-LOG, COMM-MESSAGES, COMM-PATIENT-COMMS |
| **Owned Entities** | Lead, CallLog, CommunicationLog |
| **Emitted Events** | communication.lead_created, communication.lead_converted, communication.lead_updated, communication.call_logged, communication.callback_scheduled, communication.message_sent |
| **Data Sent To** | MOD-PATIENT (convert leads), MOD-APPOINTMENT (book for leads) |

### MOD-AI-TRANSCRIPTION
| Attribute | Value |
|-----------|-------|
| **Purpose** | AI-powered consultation transcription and note summarization. Live recording, structured clinical notes, key point extraction |
| **Primary Roles** | DOCTOR |
| **Workflow Position** | CONSULTATION |
| **Route** | /ai |
| **Nav Order** | 13 |
| **Patient Submodule** | Yes |
| **Owned Entities** | AITranscription |
| **Emitted Events** | ai.transcription_started, ai.transcription_completed, ai.transcription_failed, ai.summary_generated |
| **Data Sent To** | MOD-CONSULTATION (structured notes) |

### MOD-DOCUMENTS
| Attribute | Value |
|-----------|-------|
| **Purpose** | Centralized document management. Reports, lab results, consent forms, prescriptions. Digital consent with signatures |
| **Primary Roles** | ADMIN, DOCTOR |
| **Workflow Position** | CONTINUOUS |
| **Patient Submodule** | Yes |
| **Nav Order** | 14 |
| **Owned Entities** | PatientDocument, ConsentForm |
| **Emitted Events** | documents.uploaded, documents.deleted, documents.consent_signed |

### MOD-IMAGES
| Attribute | Value |
|-----------|-------|
| **Purpose** | Before/after photo management. Clinical image capture, side-by-side comparison, treatment progress |
| **Primary Roles** | DOCTOR, ASSISTANT |
| **Workflow Position** | CONTINUOUS |
| **Patient Submodule** | Yes |
| **Nav Order** | 15 |
| **Emitted Events** | images.uploaded, images.before_after_created |
| **Data Sent To** | MOD-SKIN-HISTORY (progress), MOD-DOCUMENTS (stored as documents) |

### MOD-ROOMS
| Attribute | Value |
|-----------|-------|
| **Purpose** | Physical space management. Room inventory, real-time availability, patient-room assignments |
| **Primary Roles** | ADMIN, RECEPTIONIST |
| **Workflow Position** | CHECK_IN |
| **Route** | /rooms |
| **Nav Order** | 15 |
| **Owned Entities** | Room, RoomAllocation |
| **Emitted Events** | rooms.assigned, rooms.released, rooms.status_changed |
| **Subscribed Events** | appointment.checked_in, appointment.completed, payment.checkout_completed |

### MOD-STAFF
| Attribute | Value |
|-----------|-------|
| **Purpose** | Staff accounts, doctor schedules, availability, leave management, role assignments |
| **Primary Roles** | SUPER_ADMIN, ADMIN |
| **Workflow Position** | SYSTEM |
| **Route** | /admin/staff |
| **Nav Order** | 16 |
| **Owned Entities** | User, DoctorSchedule, DoctorLeave |
| **Emitted Events** | admin.user_created, admin.user_updated, staff.schedule_updated, staff.leave_requested, staff.leave_approved |
| **Data Sent To** | MOD-APPOINTMENT (doctor availability) |

### MOD-BRANCH
| Attribute | Value |
|-----------|-------|
| **Purpose** | Multi-branch clinic management. Branch config, timezone, system settings (tax rates, invoice prefixes) |
| **Primary Roles** | SUPER_ADMIN, ADMIN |
| **Workflow Position** | SYSTEM |
| **Route** | /admin/branches |
| **Nav Order** | 17 |
| **Owned Entities** | Branch, SystemSetting |
| **Emitted Events** | branch.created, branch.updated, branch.settings_changed |
| **Data Sent To** | MOD-BILLING (tax config), MOD-STAFF (branch assignment), MOD-ROOMS (branch rooms) |

### MOD-ADMIN
| Attribute | Value |
|-----------|-------|
| **Purpose** | System administration. User permissions at module/action level. Full audit trail for compliance |
| **Primary Roles** | SUPER_ADMIN, ADMIN |
| **Workflow Position** | SYSTEM |
| **Route** | /admin |
| **Nav Order** | 18 |
| **Owned Entities** | Permission, AuditLog |
| **Emitted Events** | admin.permission_changed |

### MOD-NOTIFICATIONS
| Attribute | Value |
|-----------|-------|
| **Purpose** | Cross-module notification hub. Listens to events from all modules. Generates notifications and reminders |
| **Primary Roles** | All roles |
| **Workflow Position** | SYSTEM |
| **Nav Order** | 19 |
| **Owned Entities** | Notification |
| **Subscribed Events** | appointment.booked, appointment.checked_in, appointment.cancelled, followup.scheduled, followup.missed, billing.invoice_created, billing.invoice_overdue, payment.received, payment.failed, lab.results_ready, communication.callback_scheduled, admin.user_created, admin.permission_changed |

---

## 7. INTER-MODULE CONNECTION MAP

```
                         ┌──────────────┐
                         │ MOD-DASHBOARD │  ← reads from all modules
                         └──────┬───────┘
                                │
          ┌─────────────────────┼──────────────────────────┐
          │                     │                          │
   ┌──────▼───────┐    ┌───────▼───────┐    ┌─────────────▼──────┐
   │MOD-COMMUNICATION│   │  MOD-PATIENT  │    │  MOD-NOTIFICATIONS │
   │  (INQUIRY)     │──→│ (REGISTRATION)│    │     (SYSTEM)       │
   └───────┬────────┘   └───────┬───────┘    └────────────────────┘
           │                    │                 ↑ listens to all
           │ lead.converted     │ patient.created
           ▼                    ▼
   ┌────────────────┐   ┌──────────────┐   ┌───────────────┐
   │ MOD-APPOINTMENT│←──│  MOD-STAFF   │   │  MOD-BRANCH   │
   │   (BOOKING)    │   │  (schedules) │   │  (config)     │
   └───────┬────────┘   └──────────────┘   └───────────────┘
           │ appointment.checked_in
           ▼
   ┌────────────────┐
   │   MOD-ROOMS    │
   │  (CHECK_IN)    │
   └───────┬────────┘
           │ room.assigned
           ▼
   ┌──────────────────┐    ┌────────────────────┐
   │ MOD-CONSULTATION │←──→│ MOD-AI-TRANSCRIPTION│
   │  (CONSULTATION)  │    └────────────────────┘
   └──┬──┬──┬──┬──────┘
      │  │  │  │ consultation.completed / diagnosis_added
      │  │  │  │
      │  │  │  └──→ ┌─────────────────┐
      │  │  │       │MOD-MEDICAL-HIST │ ← also from prescription.created
      │  │  │       └─────────────────┘
      │  │  │
      │  │  └─────→ ┌──────────────────┐
      │  │          │ MOD-SKIN-HISTORY │ ← also from procedure.completed
      │  │          └──────────────────┘
      │  │
      │  └────────→ ┌──────────────────┐
      │             │ MOD-PRESCRIPTION │ → prescription.created → MOD-BILLING
      │             └──────────────────┘
      │
      └───────────→ ┌──────────────────┐
                    │  MOD-PROCEDURE   │ → procedure.completed → MOD-BILLING
                    └──────────────────┘                       → MOD-SKIN-HISTORY
                                                               → MOD-IMAGES
      
   ┌────────────────┐     ┌────────────────┐
   │  MOD-BILLING   │────→│  MOD-PAYMENT   │
   │   (BILLING)    │←────│   (PAYMENT)    │
   └────────────────┘     └───────┬────────┘
                                  │ payment.checkout_completed
                                  ▼
                          ┌────────────────┐
                          │  MOD-FOLLOWUP  │ ← from consultation.completed
                          │  (FOLLOW_UP)   │   & appointment.completed
                          └────────────────┘
   
   ┌──────────────┐   ┌──────────────┐
   │ MOD-DOCUMENTS│   │  MOD-IMAGES  │ → feeds into MOD-SKIN-HISTORY
   │ (CONTINUOUS) │   │ (CONTINUOUS) │   & MOD-DOCUMENTS
   └──────────────┘   └──────────────┘
   
   ┌──────────────┐
   │  MOD-ADMIN   │ → controls permissions for ALL modules
   │   (SYSTEM)   │
   └──────────────┘
```

---

## 8. EVENT BUS — ALL SYSTEM EVENTS

### 8.1 Complete Event Catalog (60+ events)

**Patient Events:**
- `patient.created` — New patient registered
- `patient.updated` — Patient details modified
- `patient.deactivated` — Patient soft-deleted

**Appointment Events:**
- `appointment.booked` — New appointment scheduled
- `appointment.confirmed` — Appointment confirmed
- `appointment.checked_in` — Patient arrived and checked in
- `appointment.started` — Consultation/visit began
- `appointment.completed` — Visit finished
- `appointment.cancelled` — Appointment cancelled
- `appointment.rescheduled` — Appointment moved
- `appointment.no_show` — Patient didn't arrive

**Consultation Events:**
- `consultation.started` — Doctor began consultation
- `consultation.note_saved` — Clinical note saved
- `consultation.completed` — Consultation finalized
- `consultation.diagnosis_added` — Diagnosis recorded

**Medical History Events:**
- `medical_history.updated` — Record modified
- `medical_history.allergy_added` — New allergy recorded
- `medical_history.condition_added` — New condition added

**Skin History Events:**
- `skin_history.condition_added` — Skin condition recorded
- `skin_history.assessment_completed` — Assessment finalized

**Procedure Events:**
- `procedure.scheduled` — Treatment scheduled
- `procedure.started` — Treatment began
- `procedure.completed` — Treatment finished
- `procedure.images_uploaded` — Before/after images added

**Prescription Events:**
- `prescription.created` — New prescription written
- `prescription.updated` — Prescription modified

**Billing Events:**
- `billing.invoice_created` — Invoice generated
- `billing.invoice_updated` — Invoice modified
- `billing.invoice_sent` — Invoice sent to patient
- `billing.invoice_overdue` — Invoice past due date

**Payment Events:**
- `payment.received` — Payment collected
- `payment.failed` — Payment failed
- `payment.refunded` — Refund processed
- `payment.checkout_completed` — Patient checked out

**Follow-Up Events:**
- `followup.scheduled` — Follow-up created
- `followup.completed` — Follow-up done
- `followup.missed` — Follow-up missed
- `followup.reminder_sent` — Reminder sent

**Communication Events:**
- `communication.lead_created` — New lead
- `communication.lead_converted` — Lead → patient
- `communication.lead_updated` — Lead status changed
- `communication.call_logged` — Call recorded
- `communication.callback_scheduled` — Callback set
- `communication.message_sent` — SMS/email/WhatsApp sent

**AI Events:**
- `ai.transcription_started` — Recording began
- `ai.transcription_completed` — Transcript ready
- `ai.transcription_failed` — Transcription failed
- `ai.summary_generated` — AI summary created

**Document Events:**
- `documents.uploaded` — File uploaded
- `documents.deleted` — File removed
- `documents.consent_signed` — Consent recorded

**Image Events:**
- `images.uploaded` — Clinical image added
- `images.before_after_created` — Comparison set created

**Admin Events:**
- `admin.user_created` — Staff account created
- `admin.user_updated` — Staff modified
- `admin.user_deactivated` — Staff deactivated
- `admin.permission_changed` — Permission modified

**Staff Events:**
- `staff.schedule_updated` — Doctor schedule changed
- `staff.leave_requested` — Leave request filed
- `staff.leave_approved` — Leave approved

**Branch Events:**
- `branch.created` — New branch added
- `branch.updated` — Branch modified
- `branch.settings_changed` — System settings changed

**Notification Events:**
- `notification.created` — Notification generated
- `notification.read` — Notification marked read

**Room Events:**
- `rooms.assigned` — Patient assigned to room
- `rooms.released` — Room freed
- `rooms.status_changed` — Room status updated

**Clinical Events:**
- `vitals.recorded` — Triage vitals recorded
- `lab.test_ordered` — Lab test ordered
- `lab.results_ready` — Lab results available

---

## 9. EVENT HANDLER WIRING — REAL STATE MUTATIONS

All wired in `src/modules/core/provider.tsx`. Each handler mutates the Zustand store.

### Activity Feed (22 events → store.addActivity)
All significant events log to the activity feed with formatted messages.

### Notifications (13 events → store.addNotification)
Key events create user-facing notifications with title, message, type, and link.

### Patient Journey Tracking
| Event | State Mutation |
|-------|---------------|
| appointment.checked_in | startVisit(), addToQueue(), incrementCounter("waitingCount") |
| consultation.started | advanceVisit(CONSULT), updateQueueStage(CONSULT) |
| consultation.completed | advanceVisit(BILLING), incrementCounter("pendingInvoices") |
| billing.invoice_created | advanceVisit(PAYMENT), updateQueueStage(PAYMENT) |
| payment.received | decrementCounter("pendingInvoices"), incrementCounter("paymentsToday") |
| payment.checkout_completed | endVisit(), removeFromQueue(), decrementCounter("waitingCount") |
| vitals.recorded | advanceVisit(WAITING), updateQueueStage(WAITING) |

### Cross-Module Data Flows
| Event | Target Store Update |
|-------|-------------------|
| procedure.completed | incrementCounter("pendingCharges"), incrementCounter("completedProcedures") |
| prescription.created | incrementCounter("activePrescriptions") |
| lead.created | incrementCounter("activeLeads") |
| lead.converted | incrementCounter("convertedLeads"), decrementCounter("activeLeads") |
| ai.transcription_completed | incrementCounter("transcriptionsReady") |
| lab.results_ready | incrementCounter("labResultsReady") |
| followup.scheduled | incrementCounter("pendingFollowUps") |
| followup.completed | decrementCounter("pendingFollowUps") |
| rooms.assigned | decrementCounter("availableRooms") |
| rooms.released | incrementCounter("availableRooms") |
| patient.created | incrementCounter("totalPatients") |
| appointment.booked | incrementCounter("todayAppointments") |

---

## 10. REACTIVE STATE STORE

Zustand store at `src/modules/core/store.ts`:

```typescript
interface ModuleStoreState {
  // Activity feed — last 100 cross-module events
  activities: ActivityItem[];
  addActivity(item): void;

  // Notifications — last 200 with unread count
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification(item): void;
  markNotificationRead(id): void;
  markAllRead(): void;

  // Waiting queue — live during the day
  waitingQueue: QueueEntry[];           // {appointmentId, patientId, patientName, doctorName, checkinTime, stage}
  addToQueue(entry): void;
  removeFromQueue(appointmentId): void;
  updateQueueStage(appointmentId, stage): void;

  // Patient journey — active visit per patient
  activeVisits: Map<string, {appointmentId, stage, startedAt}>;
  startVisit(patientId, appointmentId): void;
  advanceVisit(patientId, stage): void;
  endVisit(patientId): void;

  // Counters — dashboard badges
  counters: Record<string, number>;
  setCounter(key, value): void;
  incrementCounter(key): void;
  decrementCounter(key): void;
}
```

---

## 11. SOURCE-OF-TRUTH DATA OWNERSHIP

| Entity | Source Module | Description |
|--------|-------------|-------------|
| Patient | MOD-PATIENT | Demographics, contact, profile |
| PatientAllergy | MOD-MEDICAL-HISTORY | Allergy records |
| PatientMedication | MOD-PRESCRIPTION | Active medications |
| MedicalHistory | MOD-MEDICAL-HISTORY | Conditions, diagnoses |
| SkinHistory | MOD-SKIN-HISTORY | Skin conditions, assessments |
| Insurance | MOD-PATIENT | Insurance policies |
| PatientTag | MOD-PATIENT | Labels/categories |
| Appointment | MOD-APPOINTMENT | Scheduling, status, workflow |
| Triage | MOD-APPOINTMENT | Vital signs |
| Waitlist | MOD-APPOINTMENT | Appointment waitlist |
| Room | MOD-ROOMS | Room inventory/status |
| RoomAllocation | MOD-ROOMS | Patient-room assignments |
| ConsultationNote | MOD-CONSULTATION | Clinical notes |
| LabTest | MOD-CONSULTATION | Lab orders/results |
| Treatment | MOD-PROCEDURE | Treatment catalog |
| Procedure | MOD-PROCEDURE | Executed treatments |
| Prescription | MOD-PRESCRIPTION | Medication orders |
| PrescriptionItem | MOD-PRESCRIPTION | Individual medicines |
| Invoice | MOD-BILLING | Financial records |
| Package | MOD-BILLING | Treatment bundles |
| PatientPackage | MOD-BILLING | Patient subscriptions |
| Product | MOD-BILLING | Product inventory |
| Payment | MOD-PAYMENT | Payment transactions |
| Refund | MOD-PAYMENT | Refund transactions |
| Lead | MOD-COMMUNICATION | Sales leads |
| CallLog | MOD-COMMUNICATION | Call records |
| CommunicationLog | MOD-COMMUNICATION | Multi-channel logs |
| FollowUp | MOD-FOLLOWUP | Follow-up records |
| PatientDocument | MOD-DOCUMENTS | Files and reports |
| ConsentForm | MOD-DOCUMENTS | Consent records |
| AITranscription | MOD-AI-TRANSCRIPTION | AI transcripts |
| Notification | MOD-NOTIFICATIONS | User notifications |
| User | MOD-STAFF | Staff profiles |
| DoctorSchedule | MOD-STAFF | Doctor availability |
| DoctorLeave | MOD-STAFF | Leave records |
| Permission | MOD-ADMIN | Granular permissions |
| AuditLog | MOD-ADMIN | Audit trail |
| Branch | MOD-BRANCH | Clinic branches |
| SystemSetting | MOD-BRANCH | Configuration |

---

## 12. ROLE-BASED ACCESS MATRIX

| Module | SUPER_ADMIN | ADMIN | DOCTOR | RECEPTIONIST | BILLING | CALL_CENTER | ASSISTANT |
|--------|:-----------:|:-----:|:------:|:------------:|:-------:|:-----------:|:---------:|
| Dashboard | V | V | V | V | V | V | V |
| Patient | VCEDE | VCEDE | VE | VCE | V | V | VE |
| Appointment | VCEDE | VCEDE | VE | VCE | V | VC | VE |
| Consultation | VCED | VCE | VCE | - | - | - | - |
| Medical History | VCED | V | VCE | - | - | - | V |
| Skin History | VCED | V | VCE | - | - | - | V |
| Procedure | VCEDE | VCEDE | VCE | - | - | - | V |
| Prescription | VCED | V | VCE | - | - | - | V |
| Billing | VCEDE | VCEDE | V | V | VCEDE | - | - |
| Payment | VCEDE | VCEDE | - | V | VCEDE | - | - |
| Follow-Up | VCEDE | VCEDE | VCE | VC | - | V | V |
| Communication | VCEDE | VCEDE | - | V | - | VCE | - |
| AI Transcription | VCED | V | VC | - | - | - | - |
| Documents | VCDE | VCDE | VCE | VC | - | - | VC |
| Images | VCDE | VCDE | VCE | - | - | - | VC |
| Rooms | VCEDE | VCEDE | V | VE | - | - | VE |
| Staff | VCEDE | VCEDE | - | - | - | - | - |
| Branch | VCDE | VE | - | - | - | - | - |
| Admin | VCDE | VCDE | - | - | - | - | - |
| Notifications | VE | VE | VE | VE | VE | VE | VE |

**Legend:** V=View, C=Create, E=Edit, D=Delete, X=Export, -=No Access

---

## 13. PATIENT JOURNEY WORKFLOW

```
1. INQUIRY          — Lead/call comes in (MOD-COMMUNICATION)
   │
2. REGISTRATION     — Patient registered (MOD-PATIENT)
   │
3. BOOKING          — Appointment booked (MOD-APPOINTMENT)
   │                  → appointment.booked event
   │                  → notification created
   │
4. CHECK-IN         — Patient arrives (MOD-APPOINTMENT check-in page)
   │                  → appointment.checked_in event
   │                  → visit started in store
   │                  → added to waiting queue
   │                  → room assigned (MOD-ROOMS)
   │
5. TRIAGE           — Vitals recorded (MOD-APPOINTMENT vitals page)
   │                  → vitals.recorded event
   │                  → queue stage → WAITING
   │
6. CONSULTATION     — Doctor sees patient (MOD-CONSULTATION)
   │                  → consultation.started event
   │                  → queue stage → CONSULT
   │                  → AI transcription optional (MOD-AI-TRANSCRIPTION)
   │
7. DIAGNOSIS        — Diagnosis recorded (MOD-CONSULTATION)
   │                  → consultation.diagnosis_added event
   │                  → medical history updated (MOD-MEDICAL-HISTORY)
   │                  → skin history updated (MOD-SKIN-HISTORY)
   │
8. TREATMENT        — Procedure performed (MOD-PROCEDURE)
   │                  → procedure.completed event
   │                  → before/after images (MOD-IMAGES)
   │                  → charges sent to billing
   │
9. PRESCRIPTION     — Medications prescribed (MOD-PRESCRIPTION)
   │                  → prescription.created event
   │                  → active medications updated
   │                  → charges sent to billing
   │
10. BILLING         — Invoice generated (MOD-BILLING)
    │                 → billing.invoice_created event
    │                 → visit stage → PAYMENT
    │
11. PAYMENT         — Payment collected (MOD-PAYMENT)
    │                 → payment.received event
    │                 → invoice status updated
    │
12. CHECKOUT        — Patient departs (MOD-PAYMENT)
    │                 → payment.checkout_completed event
    │                 → visit ended, queue cleared
    │                 → room released (MOD-ROOMS)
    │
13. FOLLOW-UP       — Follow-up scheduled (MOD-FOLLOWUP)
    │                 → followup.scheduled event
    │                 → reminder notification later
    │
14. HISTORY UPDATE  — Records finalized
                      → Medical history updated
                      → Skin history updated
                      → Documents stored
```

---

## 14. API ENDPOINTS — ALL ROUTES

### Authentication (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Authenticate, set JWT cookie |
| POST | /api/auth/signup | Register user, set JWT cookie |
| POST | /api/auth/logout | Clear session cookie |
| GET | /api/auth/me | Get current user from JWT |

### Patients (14 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/patients | List with pagination, search, filters |
| POST | /api/patients | Create (auto-generates PT-XXXX code) |
| GET | /api/patients/:id | Full profile with allergies, medications, insurance, history |
| PUT | /api/patients/:id | Partial update |
| DELETE | /api/patients/:id | Soft delete (isActive=false) |
| GET | /api/patients/:id/appointments | Patient's appointments |
| GET | /api/patients/:id/notes | Consultation notes |
| POST | /api/patients/:id/notes | Create consultation note |
| GET | /api/patients/:id/prescriptions | Prescription history |
| POST | /api/patients/:id/prescriptions | Create prescription with items |
| GET | /api/patients/:id/lab-tests | Lab test history |
| POST | /api/patients/:id/lab-tests | Order lab test |
| GET | /api/patients/:id/documents | Documents by type |
| POST | /api/patients/:id/documents | Upload document metadata |
| GET | /api/patients/:id/billing | Invoices + total outstanding |
| GET | /api/patients/:id/follow-ups | Follow-up history |
| POST | /api/patients/:id/follow-ups | Schedule follow-up |
| GET | /api/patients/:id/triage | Vital signs history |
| POST | /api/patients/:id/triage | Record vitals (auto-calculates BMI) |

### Appointments (7 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/appointments | List with date/doctor/status/branch filters |
| POST | /api/appointments | Create (auto-generates APT-XXXX) |
| GET | /api/appointments/:id | Full detail with notes, procedures, prescriptions, labs |
| PUT | /api/appointments/:id | Partial update |
| DELETE | /api/appointments/:id | Cancel (status=CANCELLED) |
| POST | /api/appointments/:id/check-in | Set CHECKED_IN + checkinTime |
| POST | /api/appointments/:id/checkout | Set COMPLETED + checkoutTime |
| GET | /api/appointments/calendar | Appointments grouped by date |

### Billing (5 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/billing/invoices | List with summary (total/paid/pending) |
| POST | /api/billing/invoices | Create (auto-generates INV-YYYY-XXXX) |
| GET | /api/billing/invoices/:id | Full detail with payments |
| PUT | /api/billing/invoices/:id | Partial update |
| GET | /api/billing/payments | Payment list |
| POST | /api/billing/payments | Record payment (auto-updates invoice status) |

### Leads & Calls (5 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/leads | List with search, status, source filters |
| POST | /api/leads | Create lead |
| GET | /api/leads/:id | Detail with call logs |
| PUT | /api/leads/:id | Update (can convert to patient) |
| GET | /api/call-logs | List with filters |
| POST | /api/call-logs | Log call |

### Follow-Ups (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/follow-ups | List sorted by due date |
| POST | /api/follow-ups | Create |
| GET | /api/follow-ups/:id | Detail |
| PUT | /api/follow-ups/:id | Update (auto-sets completedAt) |

### Reference Data (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/treatments | Treatment catalog |
| POST | /api/treatments | Add treatment |
| GET | /api/packages | Package catalog with subscriber counts |
| POST | /api/packages | Create package |

### Rooms (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rooms | List with branch/type/status filters |
| POST | /api/rooms | Create room |
| GET | /api/rooms/:id | Detail with upcoming appointments |
| PUT | /api/rooms/:id | Update |

### Lab Tests (2 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/lab-tests | Global list |
| POST | /api/lab-tests | Order test |

### Admin (5 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/users | Staff list |
| POST | /api/admin/users | Create staff (bcrypt password) |
| GET | /api/admin/branches | Branch list with counts |
| POST | /api/admin/branches | Create branch |
| GET | /api/admin/audit-log | Paginated audit trail |

### Other (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/notifications | User notifications + unread count |
| PUT | /api/notifications | Mark read |
| GET | /api/dashboard/stats | Role-based dashboard statistics |
| POST | /api/ai/transcribe | AI transcription (mock) |
| POST | /api/ai/summarize | AI summarization (mock) |

---

## 15. AUTHENTICATION & SECURITY

| Aspect | Implementation |
|--------|---------------|
| **Method** | JWT (HS256) via `jose` library |
| **Cookie** | `medicore-session`, httpOnly, secure (prod), SameSite=lax |
| **Duration** | 7 days |
| **Password** | bcryptjs, 12 salt rounds |
| **Secret** | `process.env.AUTH_SECRET` or dev fallback |
| **Middleware** | All routes protected except /login, /signup, /api/auth/* |
| **API Protection** | Returns 401 for missing/invalid tokens |
| **Page Protection** | Redirects to /login for missing/invalid tokens |
| **Module Access** | useModuleAccess hook checks registry.canAccess(role, moduleId, action) |
| **UI Gating** | ModuleGate, ModuleActionGate components hide/disable unauthorized elements |
| **SUPER_ADMIN** | Bypasses all module permission checks |

---

## 16. ALL PAGES & SCREENS

### 16.1 Auth Pages (2)
- `/login` — Email/password login
- `/signup` — Registration form

### 16.2 Dashboard Pages (24)

| Route | Module Gate | Events Emitted | Description |
|-------|-----------|----------------|-------------|
| /dashboard | MOD-DASHBOARD | — | Role-dispatched: Admin/Doctor/Receptionist/Billing/CallCenter/Assistant |
| /patients | MOD-PATIENT | — | Patient list (card/list view), search, filters, pagination |
| /patients/[id] | MOD-PATIENT | — | Patient profile with 15 module-filtered tabs |
| /appointments | MOD-APPOINTMENT | — | Appointment list + calendar view |
| /appointments/check-in | MOD-APPOINTMENT | appointment.checked_in | Check-in queue with search |
| /billing | MOD-BILLING | — | Invoice list with status filters |
| /consultation | MOD-CONSULTATION | consultation.note_saved | Clinical workspace with full form |
| /follow-ups | MOD-FOLLOWUP | — | Follow-up cards with status |
| /call-center | MOD-COMMUNICATION | — | Lead pipeline + phone lookup |
| /call-center/callbacks | MOD-COMMUNICATION | — | Callback queue |
| /rooms | MOD-ROOMS | — | Room status grid |
| /vitals | MOD-APPOINTMENT | vitals.recorded | Vitals recording form |
| /lab-results | MOD-CONSULTATION | — | Lab test list |
| /ai | MOD-AI-TRANSCRIPTION | — | AI transcribe/summarize/search |
| /settings | MOD-ADMIN | — | User profile settings |
| /admin/users | MOD-STAFF | — | Staff directory |
| /admin/branches | MOD-BRANCH | — | Branch cards |
| /admin/treatments | MOD-PROCEDURE | — | Treatment catalog |
| /admin/packages | MOD-BILLING | — | Package catalog |
| /admin/schedules | MOD-STAFF | — | Doctor schedules |
| /admin/roles | MOD-ADMIN | — | Permission matrix |
| /admin/audit | MOD-ADMIN | — | Audit log timeline |
| /admin/settings | MOD-BRANCH | — | System settings |
| /admin/reports | MOD-ADMIN | — | Report generators |

### 16.3 Patient Profile Tabs (15)

| Tab | Module | Access Control |
|-----|--------|---------------|
| Overview | MOD-PATIENT | Always visible if patient access |
| Appointments | MOD-APPOINTMENT | Filtered by role |
| Notes | MOD-CONSULTATION | Doctor/Admin only |
| Skin History | MOD-SKIN-HISTORY | Doctor/Admin/Assistant |
| Medical History | MOD-MEDICAL-HISTORY | Doctor/Admin/Assistant |
| Procedures | MOD-PROCEDURE | Doctor/Admin/Assistant |
| Prescriptions | MOD-PRESCRIPTION | Doctor/Admin/Assistant |
| Images | MOD-IMAGES | Doctor/Admin/Assistant |
| Labs | MOD-CONSULTATION | Doctor/Admin |
| Documents | MOD-DOCUMENTS | Most roles |
| Billing | MOD-BILLING | Admin/Billing/Receptionist |
| Packages | MOD-BILLING | Admin/Billing |
| Communications | MOD-COMMUNICATION | Admin/CallCenter/Receptionist |
| Follow-Ups | MOD-FOLLOWUP | Doctor/Admin/Receptionist |
| AI Transcripts | MOD-AI-TRANSCRIPTION | Doctor/Admin |

### 16.4 Dashboard Role Views (6)

| Role | Key Widgets |
|------|-------------|
| Admin | 4 stat cards, today's schedule, quick actions, activity feed, live activity, waiting queue count, unread badge |
| Doctor | 3 stat cards, my patients today, quick access, waiting-for-you queue, live activity |
| Receptionist | Check-in workflow, live waiting queue, activity feed |
| Billing | Revenue/pending/collected/outstanding stats, billing activity feed |
| Call Center | Lead pipeline, callback queue, lead-related activity |
| Assistant | Task list, live waiting queue, room status, activity feed |

---

## 17. UI COMPONENTS

### Reusable Library (20 components in src/components/ui/)
Avatar, Badge, Button, Card (CardHeader, CardContent), Checkbox, DatePicker, DropdownMenu, EmptyState, FileUpload, Input, LoadingSpinner, Modal, ProgressTracker, SearchInput (debounced), Select, StatCard, StatusTimeline, Table (TableHeader, TableBody, TableRow, TableHead, TableCell), Tabs (TabsList, TabsTrigger, TabsContent), Textarea

### Module Components (3 in src/modules/core/components.tsx)
- `ModuleGate` — Renders children only if user has specified permission
- `ModuleVisible` — Shorthand for ModuleGate with VIEW
- `ModuleActionGate` — Hides or disables action buttons based on permission

### Action Modals (5)
- CreateAppointmentModal → emits appointment.booked
- AddPatientModal → emits patient.created
- CreateInvoiceModal → emits billing.invoice_created
- PaymentModal → emits payment.received
- NewLeadModal → emits communication.lead_created

---

## 18. NAVIGATION STRUCTURE

### Sidebar (module-driven from registry)

**Admin/Super Admin:**
```
Dashboard
Patients
Appointments
─── Clinic ───
Consultation
Billing
Rooms
Call Center
─── Tools ───
AI Assistant
Follow-Ups
Lab Results
─── Settings ───
Staff
Treatments
Branches
Packages
Administration
```

**Doctor:**
```
My Day
Patients
Schedule
Consultation
AI Assistant
Follow-Ups
```

**Receptionist:**
```
Front Desk
Patients
Appointments
Check-In
Rooms
Billing
```

**Billing:**
```
Billing
Invoices
Packages
```

**Call Center:**
```
Workspace
Leads
Callbacks
Appointments
```

**Assistant:**
```
Tasks
Patients
Vitals
Rooms
Schedule
```

---

## 19. DESIGN SYSTEM

| Token | Value |
|-------|-------|
| **Primary** | Teal #0D9488 |
| **Background** | Stone #FAFAF9 |
| **Text** | Stone #1C1917 |
| **Success** | Emerald |
| **Warning** | Amber |
| **Danger** | Red |
| **Info** | Blue |
| **Card Radius** | 16px |
| **Card Padding** | 20px |
| **Section Gap** | 24px |
| **Font** | Inter (Google Fonts) |
| **Sidebar Width** | 240px (expanded), 72px (collapsed) |
| **Topbar Height** | 64px |
| **Currency** | PKR (Rs, no decimals) |
| **Scrollbar** | 5px, stone thumb, transparent track |
| **Focus Ring** | 2px solid teal, 2px offset |
| **Card Hover** | translateY(-2px) + shadow |
| **Animations** | fade-in (0.3s), slide-up (0.35s), pulse-dot, recording-pulse |

---

## 20. CURRENT GAPS & IMPROVEMENT OPPORTUNITIES

### 20.1 Critical Gaps

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 1 | **Frontend uses mock data, not real APIs** | All pages read from mock-data.ts instead of calling API endpoints | Replace mock data imports with react-query hooks calling the API client in src/lib/api.ts |
| 2 | **No file upload implementation** | Documents and images have no actual upload/storage | Implement file upload API with local storage or S3-compatible service (e.g., MinIO) |
| 3 | **AI features are mocked** | /api/ai/transcribe and /api/ai/summarize return static data | Integrate with OpenAI Whisper for transcription, Claude/GPT for summarization |
| 4 | **No real-time updates** | Event bus is client-side only; different browser tabs/users don't sync | Add WebSocket or Server-Sent Events for cross-client real-time updates |
| 5 | **No input validation library** | API routes validate manually with if-checks | Add Zod schemas for request validation on all endpoints |
| 6 | **No rate limiting** | API endpoints have no rate limiting | Add rate limiting middleware |
| 7 | **Patient tabs are read-only** | 14 of 15 patient tabs have no action buttons (no create/edit) | Add inline create/edit actions to notes, prescriptions, procedures, labs, follow-ups, billing tabs |

### 20.2 Authorization Gaps

| # | Gap | Recommendation |
|---|-----|----------------|
| 8 | No ownership-based access | Doctors should only see their own patients; billing staff only their branch. Add entity-level authorization |
| 9 | API routes don't check roles | All authenticated users can call any endpoint. Add role checks in API routes using session.user.role |
| 10 | Permissions table unused at runtime | The Permission model exists but no API route or UI reads/writes it. Wire granular permissions to the module system |
| 11 | Settings page gated by MOD-ADMIN | Regular users should be able to edit their own profile. Create a separate user-settings permission |

### 20.3 Missing CRUD Operations

| Entity | Missing Operations |
|--------|-------------------|
| ConsultationNote | GET by ID, PUT, DELETE |
| Prescription | GET by ID, PUT, DELETE |
| Triage | GET by ID, PUT, DELETE |
| LabTest | PUT (update status/results), DELETE |
| Treatment | GET by ID, PUT, DELETE |
| Package | GET by ID, PUT, DELETE |
| User | GET by ID, PUT, DELETE |
| Branch | GET by ID, PUT, DELETE |
| Room | DELETE |
| CallLog | PUT, DELETE |
| Lead | DELETE |
| Notification | DELETE individual |
| Product | Full CRUD (no endpoints exist) |
| Procedure | Full CRUD (no standalone endpoints) |
| Refund | Full CRUD (no endpoints exist) |
| ConsentForm | Full CRUD (no endpoints exist) |
| RoomAllocation | Full CRUD (no endpoints exist) |
| Waitlist | Full CRUD (no endpoints exist) |

### 20.4 Feature Gaps

| # | Feature | Description |
|---|---------|-------------|
| 12 | **No search across modules** | Need global search that finds patients, appointments, invoices, leads by any field |
| 13 | **No PDF generation** | Invoices, prescriptions, and reports should be exportable as PDF |
| 14 | **No email/SMS integration** | Communication module logs messages but doesn't actually send them |
| 15 | **No appointment reminders** | Should auto-send SMS/email reminders 24h before appointments |
| 16 | **No recurring appointments** | No way to schedule weekly/monthly recurring visits |
| 17 | **No waitlist-to-appointment conversion** | Waitlist exists in schema but no UI or logic to auto-book when slots open |
| 18 | **No inventory management UI** | Product model exists but no pages for stock management |
| 19 | **No refund workflow UI** | Refund model exists but no pages or modals |
| 20 | **No consent form templates** | ConsentForm model exists but no template system |
| 21 | **No reporting/analytics** | Reports page exists but generates no actual reports |
| 22 | **No data export** | EXPORT permission exists but no export functionality |
| 23 | **No patient portal / mobile access** | MOD-MOBILE-ACCESS is mentioned but not implemented |
| 24 | **No dark mode** | Appearance settings tab exists but no dark mode support |
| 25 | **No multi-language support** | Pakistan market may need Urdu support |
| 26 | **No audit logging in API routes** | AuditLog model exists but no routes write to it |
| 27 | **No pagination on most list endpoints** | Only /api/patients and /api/admin/audit-log have pagination |

### 20.5 UX Improvements

| # | Improvement |
|---|------------|
| 28 | Add loading skeletons to all pages (currently just spinner) |
| 29 | Add optimistic updates for actions (check-in, payment) |
| 30 | Add keyboard shortcuts (Cmd+K for search, Cmd+N for new patient) |
| 31 | Add drag-and-drop for calendar appointment rescheduling |
| 32 | Add toast notifications for event-driven updates |
| 33 | Add confirmation dialogs for destructive actions |
| 34 | Add breadcrumbs for nested pages |

---

## 21. RECOMMENDED IMPLEMENTATION ORDER

### Phase 1 — Data Layer (Connect Frontend to Real APIs)
1. Replace mock data with react-query hooks + API client
2. Add Zod validation to all API endpoints
3. Add role-based authorization to API routes
4. Add pagination to all list endpoints
5. Complete missing CRUD operations

### Phase 2 — Core Clinical Workflow
6. Add action buttons to patient tabs (create notes, prescriptions, lab orders inline)
7. Implement real check-in → consultation → billing → checkout flow
8. Wire follow-up auto-creation from consultation
9. Add appointment confirmation/reminder workflow
10. Implement consent form templates and signing

### Phase 3 — Financial
11. Implement payment processing with receipt generation
12. Add PDF invoice generation
13. Implement refund workflow
14. Add package session tracking and deduction
15. Wire insurance claim integration

### Phase 4 — Communication
16. Integrate SMS gateway (e.g., Twilio, local Pakistani gateway)
17. Implement appointment reminders
18. Add WhatsApp Business API integration
19. Wire lead-to-patient conversion end-to-end

### Phase 5 — Intelligence
20. Integrate AI transcription (Whisper API)
21. Integrate AI summarization (Claude/GPT)
22. Build reporting engine with charts
23. Add global search across all modules

### Phase 6 — Operations
24. Implement product/inventory management
25. Add waitlist management and auto-booking
26. Build recurring appointment support
27. Add data export (CSV, PDF)
28. Implement audit logging in all API routes

### Phase 7 — Scale & Polish
29. Add WebSocket for real-time cross-client updates
30. Add dark mode
31. Add Urdu language support
32. Add keyboard shortcuts
33. Build patient portal (read-only for patients)
34. Mobile-optimized PWA

---

## 22. FUTURE SCALABILITY NOTES

1. **Multi-Tenant Architecture** — Current branch model supports multi-clinic. Could extend to SaaS with tenant isolation at database level (Prisma multi-schema or row-level security).

2. **Microservices Path** — Module definitions already define clear boundaries. Each module could become an independent service communicating via message queue (replacing the client-side event bus).

3. **Event Sourcing** — The event bus pattern could be extended to persist all events (append-only event store), enabling full audit replay and temporal queries.

4. **Plugin System** — Module definitions could be loaded dynamically, allowing third-party modules (lab integrations, pharmacy connectors, insurance APIs).

5. **Offline Support** — Zustand store + service workers could enable offline-first for areas with unreliable internet (common in Pakistani clinics).

6. **FHIR Compliance** — Patient and clinical models could be mapped to HL7 FHIR resources for interoperability with other health systems.

7. **Queue-Based Processing** — Heavy operations (PDF generation, AI transcription, SMS sending) should move to background job queues (Bull/BullMQ with Redis).

8. **Caching Layer** — Add Redis caching for frequently accessed data (dashboard stats, treatment catalog, doctor schedules).

9. **Database Read Replicas** — For reporting queries that shouldn't impact transactional performance.

10. **CDN for Assets** — Clinical images and documents should be served via CDN for performance.

---

*This document is the complete technical and product blueprint for MediCore ERP. Any developer or AI can use it to understand the full system, identify improvement opportunities, and implement the next phase of development.*
