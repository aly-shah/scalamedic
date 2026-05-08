# MediCore ERP — Complete UI Implementation Audit

**Generated:** 2026-04-08
**Purpose:** Full frontend implementation export for external analysis and improvement recommendations

---

## PART A — FULL ROUTE / PAGE MAP

| Route | Page | Purpose | Primary Roles | Layout Type | Optimized |
|-------|------|---------|--------------|-------------|-----------|
| `/` | Root | Redirect to /login | All | Redirect | - |
| `/login` | Login | Authentication | All | Centered form | Desktop/Mobile |
| `/signup` | Signup | Registration | All | Centered form | Desktop/Mobile |
| `/dashboard` | Dashboard | Role-based command center | All | Role dispatch (6 variants) | Desktop/Tablet |
| `/patients` | Patients List | Patient management workspace | Admin, Receptionist, Doctor | Split panel (list + preview) | Desktop/Tablet/Mobile |
| `/patients/new` | New Patient | Registration form | Admin, Receptionist | Single column centered | Desktop/Tablet |
| `/patients/[id]` | Patient Profile | Full patient workspace | All clinical | Sticky header + sidebar + tabs | Desktop/Tablet/Mobile |
| `/appointments` | Appointments | Scheduling list + calendar | Admin, Receptionist, Doctor | List/Calendar toggle + detail | Desktop/Tablet |
| `/appointments/check-in` | Check-In | Patient arrival queue | Receptionist | 3-column (queue + waiting) | Desktop/Tablet |
| `/consultation` | Consultation | Doctor treatment workspace | Doctor | 3-panel (snapshot + form + rail) | Desktop/Tablet/Mobile |
| `/calendar` | Calendar | Visual scheduling engine | Admin, Doctor, Receptionist | Time grid with views | Desktop/Tablet |
| `/billing` | Billing | Invoice management | Billing, Admin | List with modals | Desktop |
| `/follow-ups` | Follow-Ups | Post-visit tracking | Doctor, Receptionist | Card list with actions | Desktop |
| `/call-center` | Call Center | Lead pipeline | Call Center | Kanban columns | Desktop |
| `/call-center/callbacks` | Callbacks | Callback queue | Call Center | Stacked list | Desktop |
| `/rooms` | Rooms | Room management | Admin, Receptionist | Card grid | Desktop |
| `/vitals` | Vitals | Triage recording | Assistant | Form with patient selector | Desktop/Tablet |
| `/lab-results` | Lab Results | Lab test tracking | Doctor, Admin | Card list | Desktop |
| `/ai` | AI Assistant | Transcription/summary | Doctor | Tab-based workspace | Desktop |
| `/settings` | Settings | User preferences | All | Tab-based form | Desktop |
| `/admin/users` | Staff | User management | Admin | Card grid + slide form | Desktop |
| `/admin/branches` | Branches | Multi-location | Admin | Card grid + slide form | Desktop |
| `/admin/treatments` | Treatments | Treatment catalog | Admin | Card grid | Desktop |
| `/admin/packages` | Packages | Package catalog | Admin, Billing | Card grid | Desktop |
| `/admin/schedules` | Schedules | Doctor schedules | Admin | Schedule grid | Desktop |
| `/admin/roles` | Roles | Permission matrix | Admin | Matrix grid | Desktop |
| `/admin/audit` | Audit Log | Activity trail | Admin | Timeline list | Desktop |
| `/admin/settings` | Admin Settings | System config | Admin | Tab-based form | Desktop |
| `/admin/reports` | Reports | Report generators | Admin | Card grid | Desktop |

**Total: 28 routes (+ 404 page)**

---

## PART B — FULL FILE MAP

### Page Files (33)
```
src/app/page.tsx                                    → / (redirect)
src/app/not-found.tsx                               → 404 page
src/app/layout.tsx                                  → Root layout (providers)
src/app/(auth)/layout.tsx                           → Auth layout
src/app/(auth)/login/page.tsx                       → Login
src/app/(auth)/signup/page.tsx                      → Signup
src/app/(dashboard)/layout.tsx                      → Dashboard shell
src/app/(dashboard)/dashboard/page.tsx              → Role dashboard
src/app/(dashboard)/patients/page.tsx               → Patient list
src/app/(dashboard)/patients/[id]/page.tsx          → Patient profile
src/app/(dashboard)/patients/new/page.tsx           → New patient
src/app/(dashboard)/appointments/page.tsx           → Appointments
src/app/(dashboard)/appointments/check-in/page.tsx  → Check-in
src/app/(dashboard)/consultation/page.tsx           → Consultation
src/app/(dashboard)/calendar/page.tsx               → Calendar
src/app/(dashboard)/billing/page.tsx                → Billing
src/app/(dashboard)/follow-ups/page.tsx             → Follow-ups
src/app/(dashboard)/call-center/page.tsx            → Call center
src/app/(dashboard)/call-center/callbacks/page.tsx  → Callbacks
src/app/(dashboard)/rooms/page.tsx                  → Rooms
src/app/(dashboard)/vitals/page.tsx                 → Vitals
src/app/(dashboard)/lab-results/page.tsx            → Lab results
src/app/(dashboard)/ai/page.tsx                     → AI assistant
src/app/(dashboard)/settings/page.tsx               → Settings
src/app/(dashboard)/admin/users/page.tsx            → Staff mgmt
src/app/(dashboard)/admin/branches/page.tsx         → Branches
src/app/(dashboard)/admin/treatments/page.tsx       → Treatments
src/app/(dashboard)/admin/packages/page.tsx         → Packages
src/app/(dashboard)/admin/schedules/page.tsx        → Schedules
src/app/(dashboard)/admin/roles/page.tsx            → Roles
src/app/(dashboard)/admin/audit/page.tsx            → Audit log
src/app/(dashboard)/admin/settings/page.tsx         → Admin settings
src/app/(dashboard)/admin/reports/page.tsx          → Reports
```

### Component Files (54)
```
src/components/layout/sidebar.tsx                   → Module-driven nav (used: all pages)
src/components/layout/topbar.tsx                    → Header + search + notifications (used: all pages)
src/components/dashboard/admin-dashboard.tsx         → Admin dashboard view
src/components/dashboard/doctor-dashboard.tsx        → Doctor dashboard view
src/components/dashboard/receptionist-dashboard.tsx  → Receptionist dashboard view
src/components/dashboard/billing-dashboard.tsx       → Billing dashboard view
src/components/dashboard/callcenter-dashboard.tsx    → Call center dashboard view
src/components/dashboard/assistant-dashboard.tsx     → Assistant dashboard view
src/components/appointments/create-appointment-modal.tsx → Booking slide panel
src/components/appointments/appointment-detail.tsx   → Appointment detail slideover
src/components/appointments/calendar-view.tsx        → Week calendar (appointments page)
src/components/billing/create-invoice-modal.tsx      → Invoice creation slide panel
src/components/billing/payment-modal.tsx             → Payment collection modal
src/components/call-center/new-lead-modal.tsx        → Lead creation modal
src/components/patients/add-patient-modal.tsx        → Patient registration slide panel
src/components/patients/edit-patient-modal.tsx       → Patient edit slide panel
src/components/patients/tabs/overview-tab.tsx        → Patient overview
src/components/patients/tabs/appointments-tab.tsx    → Patient appointments
src/components/patients/tabs/notes-tab.tsx           → Consultation notes
src/components/patients/tabs/prescriptions-tab.tsx   → Prescriptions with CRUD
src/components/patients/tabs/procedures-tab.tsx      → Procedures (mock)
src/components/patients/tabs/billing-tab.tsx         → Patient billing with pay
src/components/patients/tabs/documents-tab.tsx       → Documents with upload
src/components/patients/tabs/followups-tab.tsx       → Follow-ups with actions
src/components/patients/tabs/labs-tab.tsx            → Lab tests
src/components/patients/tabs/images-tab.tsx          → Images (mock)
src/components/patients/tabs/medical-history-tab.tsx → Medical history (partial mock)
src/components/patients/tabs/skin-history-tab.tsx    → Skin history (mock)
src/components/patients/tabs/comms-tab.tsx           → Communications (mock)
src/components/patients/tabs/packages-tab.tsx        → Packages (mock)
src/components/patients/tabs/ai-transcripts-tab.tsx  → AI transcripts (mock)
src/components/ui/avatar.tsx                         → Avatar with initials fallback
src/components/ui/badge.tsx                          → Status badges (7 variants)
src/components/ui/button.tsx                         → Button (7 variants, 3 sizes)
src/components/ui/card.tsx                           → Card container (4 sub-components)
src/components/ui/checkbox.tsx                       → Checkbox input
src/components/ui/date-picker.tsx                    → Calendar date picker dropdown
src/components/ui/dropdown.tsx                       → Dropdown menu
src/components/ui/empty-state.tsx                    → Empty state display
src/components/ui/file-upload.tsx                    → Drag-drop file upload
src/components/ui/input.tsx                          → Text input with label/error
src/components/ui/loading.tsx                        → Spinner + skeleton loaders
src/components/ui/modal.tsx                          → Centered modal dialog
src/components/ui/progress-tracker.tsx               → Step progress indicator
src/components/ui/search-input.tsx                   → Debounced search input
src/components/ui/select.tsx                         → Native select dropdown
src/components/ui/slide-panel.tsx                    → Right-side slide drawer
src/components/ui/stat-card.tsx                      → KPI metric card
src/components/ui/status-timeline.tsx                → Timeline display
src/components/ui/table.tsx                          → Data table (5 sub-components)
src/components/ui/tabs.tsx                           → Controlled/uncontrolled tabs
src/components/ui/textarea.tsx                       → Multi-line text input
src/components/ui/time-picker.tsx                    → Time slot picker dropdown
src/components/ui/index.ts                           → Barrel export
```

### Module System (30)
```
src/modules/core/types.ts        → Module type definitions
src/modules/core/events.ts       → EventBus + 60+ SystemEvents
src/modules/core/registry.ts     → ModuleRegistry + entity ownership + role matrix
src/modules/core/hooks.ts        → useModuleAccess, useModuleEmit, useModuleNavigation
src/modules/core/store.ts        → Zustand cross-module state
src/modules/core/provider.tsx    → ModuleProvider + 30+ event wirings
src/modules/core/components.tsx  → ModuleGate, ModuleActionGate
src/modules/core/index.ts        → Core barrel
src/modules/definitions/*.ts     → 20 module definitions + index
src/modules/index.ts             → Top barrel
```

### Lib + Hooks (9)
```
src/lib/api.ts              → API client (buildQuery + apiFetch + all endpoints)
src/lib/auth.ts             → JWT auth (bcrypt, jose, cookies)
src/lib/auth-context.tsx    → AuthProvider context
src/lib/constants.ts        → Colors, labels, module IDs
src/lib/mock-data.ts        → Development mock data (22K+ lines)
src/lib/prisma.ts           → Prisma client singleton
src/lib/query-provider.tsx  → React Query setup
src/lib/utils.ts            → formatCurrency(PKR), formatDate, cn(), calculateAge, calculateBMI
src/hooks/use-queries.ts    → 50+ React Query hooks
```

---

## PART C — COMPONENT HIERARCHY

```
RootLayout (providers: QueryProvider → AuthProvider)
├── AuthLayout
│   ├── LoginPage
│   └── SignupPage
└── DashboardLayout (ModuleProvider → Sidebar + Topbar + main)
    ├── Sidebar (module-driven, role-based, collapsible)
    │   ├── Brand section
    │   ├── Nav sections (role-specific groups)
    │   ├── Extra routes (calendar, vitals, check-in, etc.)
    │   └── Bottom (Settings + Logout)
    ├── Topbar
    │   ├── Greeting section
    │   ├── Search button → GlobalSearchModal
    │   │   ├── Patient search results
    │   │   └── Quick navigation links
    │   ├── Notification bell → NotificationDropdown
    │   │   ├── Notification list
    │   │   └── Mark All Read button
    │   └── User dropdown (Profile, Preferences, Logout)
    │
    ├── DashboardPage (role dispatch)
    │   ├── AdminDashboard
    │   │   ├── Welcome card (dynamic greeting)
    │   │   ├── StatCard × 4
    │   │   ├── Today's Schedule (appointment list)
    │   │   ├── Quick Actions grid (6 buttons → slide panels)
    │   │   │   ├── AddPatientModal (slide panel)
    │   │   │   ├── CreateAppointmentModal (slide panel)
    │   │   │   └── CreateInvoiceModal (slide panel)
    │   │   └── Activity feed (module store)
    │   ├── DoctorDashboard
    │   │   ├── Header (greeting + status toggle + actions)
    │   │   ├── StatCard × 4
    │   │   ├── Patient SearchInput → results dropdown
    │   │   ├── In-Progress card (voice note button)
    │   │   ├── Coverage Alert (other doctors' overdue)
    │   │   ├── Waiting Queue (with Engage buttons)
    │   │   ├── My Schedule (with Engage/Continue buttons)
    │   │   ├── Quick Actions sidebar
    │   │   ├── Live Activity feed
    │   │   ├── Today Summary card
    │   │   ├── AddPatientModal
    │   │   ├── CreateAppointmentModal
    │   │   └── QuickOutcomePanel (slide panel)
    │   ├── ReceptionistDashboard
    │   ├── BillingDashboard
    │   ├── CallCenterDashboard
    │   └── AssistantDashboard
    │
    ├── PatientsPage
    │   ├── Header (title + Walk-in + New Patient buttons)
    │   ├── KPI cards × 5
    │   ├── Saved views row (pill filters)
    │   ├── Sticky toolbar (search + view toggle)
    │   ├── Patient list (list view OR card grid)
    │   ├── Patient preview panel (sticky right side)
    │   ├── Pagination
    │   ├── AddPatientModal
    │   └── CreateAppointmentModal
    │
    ├── PatientProfilePage
    │   ├── Sticky header (avatar + name + contact buttons)
    │   ├── Alert strip (allergies + blood + skin + tags)
    │   ├── Action bar (Add Note, Prescribe, Procedure, Vitals, Follow-Up)
    │   ├── Left sidebar (identity + vitals + meds + conditions + nav)
    │   ├── Grouped tabs (Clinical | Records | Admin)
    │   │   ├── OverviewTab
    │   │   ├── NotesTab
    │   │   ├── PrescriptionsTab (with CRUD + print)
    │   │   ├── ProceduresTab
    │   │   ├── LabsTab
    │   │   ├── SkinHistoryTab
    │   │   ├── MedicalHistoryTab
    │   │   ├── AppointmentsTab
    │   │   ├── FollowUpsTab
    │   │   ├── DocumentsTab (with upload)
    │   │   ├── ImagesTab
    │   │   ├── AITranscriptsTab
    │   │   ├── BillingTab (with pay button)
    │   │   ├── PackagesTab
    │   │   └── CommsTab
    │   ├── EditPatientModal
    │   └── CreateAppointmentModal
    │
    ├── ConsultationPage (3-panel)
    │   ├── Sticky header (patient search/info + appointment link)
    │   ├── Left: Patient Snapshot
    │   │   ├── Identity card
    │   │   ├── Alerts (allergies, blood, skin)
    │   │   ├── Vitals grid
    │   │   ├── Recent Visits
    │   │   └── Recent Prescriptions
    │   ├── Center: Workspace
    │   │   ├── Section progress indicator
    │   │   ├── Last Visit context card
    │   │   ├── Chief Complaint (with quick chips)
    │   │   ├── Clinical Notes (with voice button)
    │   │   │   ├── Diagnosis (with smart suggestions)
    │   │   │   └── Treatment Plan
    │   │   ├── Prescriptions (with Repeat Last Rx)
    │   │   ├── Procedures (with catalog quick-add)
    │   │   ├── Lab Order
    │   │   └── Follow-Up (with preset chips)
    │   ├── Right: Action Rail
    │   │   ├── Visit Summary card
    │   │   ├── Billing Handoff card
    │   │   ├── Quick Actions
    │   │   └── Complete & Send to Billing button
    │   └── Mobile Bottom Bar (Rx | Proc | Complete)
    │
    ├── CalendarPage
    │   ├── Header (title + Find Available + Block Slot + Book)
    │   ├── Summary cards × 4
    │   ├── Controls (date nav + view toggle + filters)
    │   ├── AvailabilityPanel (collapsible)
    │   ├── BlockSlotForm (collapsible)
    │   ├── DayGrid / WeekGrid (view-dependent)
    │   │   ├── Doctor/Room columns
    │   │   ├── Time slots (click → book or view)
    │   │   └── Current time indicator
    │   ├── Legend
    │   ├── QuickBookPanel (slide panel)
    │   └── AppointmentDetail (slideover)
    │
    ├── AppointmentsPage
    │   ├── Header + date picker + filters
    │   ├── StatCard × 4
    │   ├── List/Calendar view toggle
    │   ├── CreateAppointmentModal
    │   └── AppointmentDetail
    │
    ├── BillingPage
    │   ├── Stats + filters + invoice list
    │   ├── CreateInvoiceModal (slide panel)
    │   └── PaymentModal
    │
    └── Admin Pages (all follow pattern: header + cards/list + slide panel)
```

---

## PART D — PAGE-BY-PAGE LAYOUT (see Part A table + agent audit above)

Key layout patterns:
- **Split panel**: Patients list (7/5 cols), Patient profile (3/9 cols), Consultation (3/6/3 cols)
- **Sticky headers**: Patient profile (top-16), Consultation (top-16), Patients list toolbar
- **Slide panels**: All creation forms (patients, appointments, invoices, prescriptions, staff, branches)
- **Time grids**: Calendar (doctor/room columns × time rows)
- **Role dispatch**: Dashboard page delegates to 6 role-specific components

---

## PART E — CSS / TAILWIND STRUCTURE

### Design Tokens
```css
--sidebar-width: 240px
--sidebar-collapsed: 72px
--topbar-height: 64px (h-16)
--page-px: 24px
--content-max: 1440px
--card-radius: 16px (rounded-2xl)
--card-padding: 20px
--section-gap: 24px
```

### Color System
| Token | Value | Usage |
|-------|-------|-------|
| Primary | teal-500/600 | CTAs, active states, links, rings |
| Success | emerald-500/600 | Completed, paid, available |
| Warning | amber-500/600 | Waiting, pending, overdue |
| Danger | red-500/600 | Alerts, allergies, cancelled |
| Info | blue-500/sky-500 | Confirmed, info badges |
| Purple | violet-500/indigo-500 | AI, procedures, skin type |
| Neutral | stone-50 to stone-900 | Background, text, borders |
| Background | #FAFAF9 | Page background |

### Spacing System
- Section gaps: `space-y-4 sm:space-y-5` or `space-y-4 sm:space-y-6`
- Card padding: `p-3` to `p-6`
- Grid gaps: `gap-2.5` to `gap-4 sm:gap-6`
- Page padding: `px-5 sm:px-8 lg:px-10 xl:px-12 py-5 sm:py-6`

### Typography
- Page titles: `text-xl sm:text-2xl font-bold text-stone-900`
- Section headers: `text-sm font-semibold text-stone-900`
- Labels: `text-xs font-semibold text-stone-400 uppercase tracking-wider`
- Body: `text-sm text-stone-700`
- Helper: `text-xs text-stone-400`
- Tiny: `text-[10px]` or `text-[11px]`

### Border Radius
- Cards: `rounded-2xl`
- Buttons: `rounded-xl`
- Inputs: `rounded-xl`
- Badges: `rounded-full`
- Chips: `rounded-lg` or `rounded-xl`
- Avatars: `rounded-full`

### Shadows
- Cards: `shadow-sm`
- Hover: `hover:shadow-md`
- Dropdowns: `shadow-lg` or `shadow-xl`
- Modals: `shadow-2xl`

### Animations
- Page entry: `animate-fade-in` (0.3s)
- Slide panel: `animate-in slide-in-from-right duration-300`
- Pulse: `animate-pulse` (loading), `animate-pulse-dot` (status)
- Recording: `animate-recording` (red pulse)

---

## PART F — RESPONSIVE BEHAVIOR

### Global Shell
- **Desktop (>1024px)**: Sidebar 240px + Topbar + content with max-w-1440px
- **Tablet (768-1024px)**: Sidebar collapsed 72px + full content
- **Mobile (<768px)**: No sidebar (overlay on toggle) + full content

### Key Page Behaviors

**Patients List:**
- Desktop: List + sticky preview panel (7/5 grid)
- Tablet: List only, no preview panel
- Mobile: Stacked, card view preferred

**Patient Profile:**
- Desktop: Sidebar (3 cols) + tabs (9 cols)
- Tablet: Same but tighter spacing
- Mobile: Sidebar hidden, tabs full-width, scrollable tab bar

**Consultation:**
- Desktop: 3-panel (3/6/3)
- Tablet: Snapshot collapsible, workspace + rail
- Mobile: Stacked, snapshot accordion, fixed bottom action bar

**Calendar:**
- Desktop: Full grid with doctor/room columns
- Tablet: Horizontal scroll on grid
- Mobile: Horizontal scroll, summary cards stack

---

## PART G — STATE MANAGEMENT

### Global State
- **Auth**: React Context (user, login, logout, refreshUser)
- **Module System**: Zustand store (activities, notifications, waitingQueue, activeVisits, counters)
- **Server State**: React Query (50+ hooks, 30s stale time, auto-refetch)

### Page-Level State
- **Patients**: search, debouncedSearch, quickFilter, viewMode, selectedPatient, page
- **Patient Profile**: activeTab, showEditModal, showBookModal, newTag
- **Consultation**: patientId, appointmentId, visitStatus, all form fields, rxRows[], procedures[]
- **Calendar**: view, selectedDate, doctorFilter, branchFilter, bookingSlot, selectedAppointment
- **Doctor Dashboard**: showAddPatient, showBookAppointment, showOutcome, doctorStatus, isRecording

### Data Flow
- Pages fetch via React Query hooks → display data
- Actions call mutations → invalidate queries → UI auto-refreshes
- Module events emitted → Zustand store updates → dashboard widgets react
- URL params pass context between pages (e.g., consultation?patientId=xxx)

---

## PART H — KNOWN UI/UX WEAKNESSES

### Critical
1. **6 patient tabs still on mock data** (skin-history, procedures, packages, comms, ai-transcripts, medical-history conditions)
2. **AI features are mocked** — transcription and summary return static data
3. **No file upload storage** — documents tab saves metadata but no actual file handling
4. **No real-time sync** — event bus is client-side only, different browser tabs don't sync

### Design Issues
5. **Appointments page date defaults to today** — no visual calendar picker inline
6. **Admin pages are basic** — most are card grids without CRUD actions beyond create
7. **Check-in page wait time calculation** uses current time but no auto-refresh
8. **Settings page** is module-gated by MOD-ADMIN — regular users can't edit their own profile
9. **Billing dashboard** stats are from API but payment method breakdown is placeholder
10. **Receptionist/Assistant/Billing dashboards** are simpler than Admin/Doctor — less polished

### Interaction Gaps
11. **No toast/snackbar notifications** — success states are inline or modals
12. **No keyboard shortcuts** beyond "/" for search
13. **No drag-and-drop** on calendar for rescheduling
14. **No confirmation dialogs** on most destructive actions (just browser confirm())
15. **No undo** on any action

### Mobile Weaknesses
16. **Calendar time grid** requires horizontal scroll on mobile — not ideal
17. **Consultation 3-panel** left sidebar content is cramped on smaller screens
18. **Table views** (billing, appointments) don't have mobile-optimized card alternatives everywhere
19. **Patient profile sidebar** hidden on mobile — useful context lost

### Consistency Issues
20. **Some pages use StatCard, others use inline stat divs** — not uniform
21. **Slide panels have varying widths** (sm/md/lg/xl) — some forms feel cramped
22. **Loading states** — some pages show spinner, others show skeletons, some show nothing
23. **Empty states** — inconsistent across pages (some have icons, some just text)

---

## PART I — CODE EXPORT

The full source code for all files is available in the repository:
**https://github.com/rd20inc-beep/Clinic-ERP**

Key files by size:
```
consultation/page.tsx     — ~600 lines (largest page)
calendar/page.tsx         — ~780 lines (including QuickBookPanel + DayGrid + WeekGrid)
doctor-dashboard.tsx      — ~450 lines
patients/page.tsx         — ~390 lines
patients/[id]/page.tsx    — ~350 lines
mock-data.ts              — ~22,000 lines (development data)
use-queries.ts            — ~650 lines (all React Query hooks)
sidebar.tsx               — ~240 lines
topbar.tsx                — ~230 lines
```

---

*This audit covers 173 frontend files, 28 routes, 54 components, 20 modules, and 47 API endpoints.*
