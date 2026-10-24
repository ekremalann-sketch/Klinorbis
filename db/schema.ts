import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  patientAlias: text("patient_alias").notNull(),
  subject: text("subject").notNull(),
  maskedSubject: text("masked_subject"),
  detectedPii: text("detected_pii").notNull().default("[]"),
  urgencyLevel: integer("urgency_level").notNull().default(2),
  humanApprovalRequired: integer("human_approval_required", { mode: "boolean" }).notNull().default(false),
  unit: text("unit").notNull(),
  unitCode: text("unit_code").notNull().default("HIL"),
  previousUnitCode: text("previous_unit_code"),
  assignedRole: text("assigned_role").notNull().default("Birim Görevlisi"),
  acceptedBy: text("accepted_by"),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  priority: text("priority").notNull().default("Normal"),
  status: text("status").notNull().default("Yeni"),
  channel: text("channel").notNull().default("Web"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  slaDueAt: integer("sla_due_at", { mode: "timestamp_ms" }),
});

export const automationEvents = sqliteTable("automation_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketReference: text("ticket_reference").notNull(),
  rule: text("rule").notNull(),
  outcome: text("outcome").notNull(),
  unitCode: text("unit_code"),
  eventType: text("event_type").notNull().default("workflow"),
  actor: text("actor").notNull().default("system"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const workflowJobs = sqliteTable("workflow_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobKey: text("job_key").notNull().unique(),
  ticketReference: text("ticket_reference"),
  ruleCode: text("rule_code").notNull(),
  payload: text("payload").notNull().default("{}"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull().default("system"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  result: text("result").notNull().default("success"),
  detail: text("detail"),
  previousHash: text("previous_hash").notNull().default("GENESIS"),
  currentHash: text("current_hash").notNull().default("LEGACY"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const privacyPolicies = sqliteTable("privacy_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purposeCode: text("purpose_code").notNull().unique(),
  legalBasis: text("legal_basis").notNull(),
  minimumFields: text("minimum_fields").notNull().default("[]"),
  retentionDays: integer("retention_days").notNull(),
  requiresExplicitConsent: integer("requires_explicit_consent", { mode: "boolean" }).notNull().default(false),
  requiresHumanApproval: integer("requires_human_approval", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const hospitalUnits = sqliteTable("hospital_units", {
  code: text("code").primaryKey(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull(),
  scope: text("scope").notNull(),
  slaMinutes: integer("sla_minutes").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const staffAccounts = sqliteTable("staff_accounts", {
  email: text("email").primaryKey(),
  displayLabel: text("display_label").notNull().default("Yetkili Kullanıcı"),
  systemRole: text("system_role").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
});

export const unitMemberships = sqliteTable("unit_memberships", {
  email: text("email").notNull(),
  unitCode: text("unit_code").notNull(),
  unitRole: text("unit_role").notNull().default("Birim Görevlisi"),
  canManageTickets: integer("can_manage_tickets", { mode: "boolean" }).notNull().default(false),
  canReadCalls: integer("can_read_calls", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [primaryKey({ columns: [table.email, table.unitCode] })]);

export const ticketEvents = sqliteTable("ticket_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketReference: text("ticket_reference").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  fromUnitCode: text("from_unit_code"),
  toUnitCode: text("to_unit_code"),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const operationalTasks = sqliteTable("operational_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  ticketReference: text("ticket_reference"),
  callReference: text("call_reference"),
  unitCode: text("unit_code").notNull(),
  assignedRole: text("assigned_role").notNull(),
  assignedUser: text("assigned_user"),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull().default("queued"),
  priority: text("priority").notNull().default("Normal"),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  acceptedBy: text("accepted_by"),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  // Gecikme yükseltmesi: 0 = yok, 1 = birim sorumlusuna, 2 = operasyon yöneticisine bildirildi.
  escalationLevel: integer("escalation_level").notNull().default(0),
  escalatedAt: integer("escalated_at", { mode: "timestamp_ms" }),
  // İşlerim ekranı: iş adı ve konumu (kart başlığı), başlama zamanı, bildirilen engel ve yardım isteği.
  title: text("title"),
  location: text("location"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  blockedReason: text("blocked_reason"),
  blockedAt: integer("blocked_at", { mode: "timestamp_ms" }),
  helpRequestedAt: integer("help_requested_at", { mode: "timestamp_ms" }),
}, (table) => [index("operational_tasks_overdue").on(table.status, table.dueAt), index("operational_tasks_assignee").on(table.assignedUser, table.status)]);

export const callSessions = sqliteTable("call_sessions", {
  reference: text("reference").primaryKey(),
  patientAlias: text("patient_alias").notNull(),
  source: text("source").notNull(),
  direction: text("direction").notNull().default("Gelen"),
  status: text("status").notNull().default("ringing"),
  unitCode: text("unit_code").notNull().default("CAG"),
  assignedRole: text("assigned_role").notNull().default("Çağrı Merkezi Görevlisi"),
  summary: text("summary"),
  training: integer("training", { mode: "boolean" }).notNull().default(false),
  requiresHuman: integer("requires_human", { mode: "boolean" }).notNull().default(false),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

export const callMessages = sqliteTable("call_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  callReference: text("call_reference").notNull(),
  sequence: integer("sequence").notNull(),
  speakerType: text("speaker_type").notNull(),
  speakerLabel: text("speaker_label").notNull(),
  message: text("message").notNull(),
  redacted: integer("redacted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [uniqueIndex("call_messages_call_sequence_unique").on(table.callReference, table.sequence)]);

export const approvals = sqliteTable("approvals", {
  reference: text("reference").primaryKey(),
  ticketReference: text("ticket_reference"),
  callReference: text("call_reference"),
  unitCode: text("unit_code").notNull(),
  approvalType: text("approval_type").notNull(),
  status: text("status").notNull().default("pending"),
  requestedBy: text("requested_by").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
});

export const integrationEvents = sqliteTable("integration_events", {
  eventId: text("event_id").primaryKey(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull().default("accepted"),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const securityEvents = sqliteTable("security_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull(),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull(),
  actor: text("actor").notNull().default("anonymous"),
  ipHash: text("ip_hash"),
  path: text("path").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const rateLimitCounters = sqliteTable("rate_limit_counters", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const facilities = sqliteTable("facilities", {
  code: text("code").primaryKey(),
  name: text("name").notNull().unique(),
  campusType: text("campus_type").notNull(),
  city: text("city").notNull().default("İzmir"),
  status: text("status").notNull().default("operational"),
  totalBeds: integer("total_beds").notNull().default(0),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const capacitySnapshots = sqliteTable("capacity_snapshots", {
  facilityCode: text("facility_code").notNull(),
  unitCode: text("unit_code").notNull(),
  resourceCode: text("resource_code").notNull(),
  resourceLabel: text("resource_label").notNull(),
  total: integer("total").notNull().default(0),
  occupied: integer("occupied").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  blocked: integer("blocked").notNull().default(0),
  cleaning: integer("cleaning").notNull().default(0),
  staffed: integer("staffed").notNull().default(0),
  dischargeForecast: integer("discharge_forecast").notNull().default(0),
  incoming: integer("incoming").notNull().default(0),
  outgoing: integer("outgoing").notNull().default(0),
  status: text("status").notNull().default("available"),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [primaryKey({ columns: [table.facilityCode, table.unitCode, table.resourceCode] })]);

export const transferRequests = sqliteTable("transfer_requests", {
  reference: text("reference").primaryKey(),
  patientAlias: text("patient_alias").notNull(),
  sourceFacilityCode: text("source_facility_code").notNull(),
  targetFacilityCode: text("target_facility_code").notNull(),
  requestedUnitCode: text("requested_unit_code").notNull(),
  resourceCode: text("resource_code").notNull(),
  resourceLabel: text("resource_label").notNull(),
  requestedCount: integer("requested_count").notNull().default(1),
  priority: text("priority").notNull().default("Normal"),
  status: text("status").notNull().default("received"),
  decisionCode: text("decision_code"),
  decisionDetail: text("decision_detail"),
  alternatives: text("alternatives").notNull().default("[]"),
  ticketReference: text("ticket_reference"),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const staffShifts = sqliteTable("staff_shifts", {
  reference: text("reference").primaryKey(),
  staffLabel: text("staff_label").notNull(),
  facilityCode: text("facility_code").notNull(),
  unitCode: text("unit_code").notNull(),
  role: text("role").notNull(),
  shiftCode: text("shift_code").notNull(),
  status: text("status").notNull().default("active"),
  handoffTo: text("handoff_to"),
  // Kişiye bağlı vardiya (uygunluk kontrolü için). Eski kayıtlarda boş olabilir.
  staffEmail: text("staff_email"),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const reportAssignments = sqliteTable("report_assignments", {
  reference: text("reference").primaryKey(),
  reportCode: text("report_code").notNull().unique(),
  title: text("title").notNull(),
  scopeType: text("scope_type").notNull().default("network"),
  facilityCode: text("facility_code"),
  unitCode: text("unit_code"),
  assignedRole: text("assigned_role").notNull(),
  schedule: text("schedule").notNull(),
  status: text("status").notNull().default("active"),
  delivery: text("delivery").notNull().default("dashboard"),
  resultJson: text("result_json").notNull().default("{}"),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Gerçek kullanıcı vardiya devri. Otomasyonun sentetik vardiya panosundan (staff_shifts) ayrıdır:
// giden görevli devri başlatır, gelen görevli kabul eder; kabulde açık işler gelen kişiye geçer.
export const shiftHandoffs = sqliteTable("shift_handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  unitCode: text("unit_code").notNull(),
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("pending"),
  openTickets: integer("open_tickets").notNull().default(0),
  openTasks: integer("open_tasks").notNull().default(0),
  movedTickets: integer("moved_tickets").notNull().default(0),
  movedTasks: integer("moved_tasks").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
}, (table) => [
  index("shift_handoffs_unit_status").on(table.unitCode, table.status),
  // Aynı kişinin aynı birimde aynı anda yalnız bir bekleyen devri olabilir (çift tıklama/yarış).
  uniqueIndex("shift_handoffs_one_pending").on(table.fromEmail, table.unitCode).where(sql`status = 'pending'`),
]);

// Patient coordination uses aliases only; delivery is recorded by staff, never simulated.
export const patientCoordination = sqliteTable("patient_coordination", {
 ticketReference:text("ticket_reference").primaryKey().references(()=>tickets.reference),
 version:integer("version").notNull().default(1),
 state:text("state").notNull().default("assessment"),
 providerAlias:text("provider_alias").notNull().default(""),
 availability:text("availability").notNull().default("unconfirmed"),
 plannedAt:text("planned_at").notNull().default(""),
 alternative:text("alternative").notNull().default(""),
 contactChannel:text("contact_channel").notNull().default("Telefon"),
 notificationStatus:text("notification_status").notNull().default("pending"),
 requestedBy:text("requested_by").notNull(),
 approvedBy:text("approved_by"),
 history:text("history").notNull().default("[]"),
 updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull().$defaultFn(()=>new Date()),
});


// ————— Randevu ve hasta iletişimi —————
// Hekim ve randevu satırları kurumun HBYS/MHRS takviminden imzalı entegrasyonla gelir
// (`/api/integrations/schedule`). `training = true` satırlar eğitim senaryosudur ve ekranda öyle etiketlenir.
// Hekimler takma kodla tutulur (ör. "KRD-H01"); ad-soyad yalnız HBYS'de kalır.
export const physicians = sqliteTable("physicians", {
  code: text("code").primaryKey(),
  displayLabel: text("display_label").notNull(),
  unitCode: text("unit_code").notNull(),
  facilityCode: text("facility_code").notNull(),
  dailyCapacity: integer("daily_capacity").notNull().default(20),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [index("physicians_unit").on(table.unitCode, table.facilityCode)]);

export const appointments = sqliteTable("appointments", {
  reference: text("reference").primaryKey(),
  patientAlias: text("patient_alias").notNull(),
  physicianCode: text("physician_code").notNull(),
  unitCode: text("unit_code").notNull(),
  facilityCode: text("facility_code").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  // scheduled → (hekim yokluğu) needs_action → offered → rescheduled | cancelled ; confirmed ; completed ; no_show
  status: text("status").notNull().default("scheduled"),
  clinicalPriority: integer("clinical_priority", { mode: "boolean" }).notNull().default(false),
  allowOtherPhysician: integer("allow_other_physician", { mode: "boolean" }).notNull().default(false),
  preferredChannel: text("preferred_channel"),
  consentChannels: text("consent_channels").notNull().default("[]"),
  contactMasked: text("contact_masked"),
  source: text("source").notNull().default("HBYS"),
  version: integer("version").notNull().default(1),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("appointments_physician_day").on(table.physicianCode, table.startsAt),
  index("appointments_unit_status").on(table.unitCode, table.status),
]);

export const physicianAbsences = sqliteTable("physician_absences", {
  reference: text("reference").primaryKey(),
  physicianCode: text("physician_code").notNull(),
  unitCode: text("unit_code").notNull(),
  day: text("day").notNull(),
  reason: text("reason").notNull(),
  // planned (onay bekliyor) → approved (bildirimler kuyrukta) → closed ; rejected (plan yeniden yapılır)
  status: text("status").notNull().default("planned"),
  affectedCount: integer("affected_count").notNull().default(0),
  reportedBy: text("reported_by").notNull(),
  decidedBy: text("decided_by"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
}, (table) => [
  // Aynı hekim için aynı güne ikinci açık kayıt açılamaz.
  uniqueIndex("physician_absences_open").on(table.physicianCode, table.day).where(sql`status in ('planned','approved')`),
]);

export const appointmentChanges = sqliteTable("appointment_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  absenceReference: text("absence_reference").notNull(),
  appointmentReference: text("appointment_reference").notNull(),
  option: text("option").notNull(),
  proposedPhysicianCode: text("proposed_physician_code"),
  proposedFacilityCode: text("proposed_facility_code"),
  proposedStartsAt: integer("proposed_starts_at", { mode: "timestamp_ms" }),
  reason: text("reason").notNull(),
  // proposed → offered → accepted | declined | unreachable | cancelled ; review (hekim kararı bekler)
  status: text("status").notNull().default("proposed"),
  attempts: integer("attempts").notNull().default(0),
  respondedBy: text("responded_by"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("appointment_changes_once").on(table.absenceReference, table.appointmentReference),
  // Aynı hekim + aynı saat, eşzamanlı iki farklı plana önerilemez (veritabanı düzeyinde son kilit).
  uniqueIndex("appointment_changes_slot_once").on(table.proposedPhysicianCode, table.proposedStartsAt)
    .where(sql`proposed_starts_at is not null and status in ('proposed','offered','accepted')`),
]);

export const patientNotifications = sqliteTable("patient_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  appointmentReference: text("appointment_reference"),
  ticketReference: text("ticket_reference"),
  patientAlias: text("patient_alias").notNull(),
  channel: text("channel").notNull(),
  template: text("template").notNull(),
  body: text("body").notNull(),
  // queued → sent → delivered | failed ; call_task (telefonla aranacak) ; held (sessiz saat)
  status: text("status").notNull().default("queued"),
  provider: text("provider").notNull().default("not_configured"),
  attempts: integer("attempts").notNull().default(0),
  sendAfter: integer("send_after", { mode: "timestamp_ms" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [index("patient_notifications_status").on(table.status, table.sendAfter)]);

// Operasyon akışları (playbook): bir akış birimden birime sırayla ilerler; her adım bir operasyon görevi açar.
// active → done | cancelled. Onay adımını akışı başlatan kişi geçiremez.
export const playbookRuns = sqliteTable("playbook_runs", {
  reference: text("reference").primaryKey(),
  playbookCode: text("playbook_code").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  currentStep: integer("current_step").notNull().default(0),
  stepCount: integer("step_count").notNull(),
  note: text("note"),
  parentReference: text("parent_reference"),
  startedBy: text("started_by").notNull(),
  version: integer("version").notNull().default(1),
  mutationToken: text("mutation_token"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  // Olaydan başlatılan akışlarda olay kimliği (aynı olay ikinci kez akış açmaz).
  triggerEvent: text("trigger_event"),
  // Yapılandırılmış alanlar (isteğe bağlı): yerleşke, oda/yatak, cihaz kodu, hasta kısa kodu (ad değil).
  campus: text("campus"),
  location: text("location"),
  deviceCode: text("device_code"),
  patientRef: text("patient_ref"),
  // Son adımda işaretlenen zincir koşulları (JSON dizi).
  chainChoices: text("chain_choices"),
  // Nakil akışlarında hedef konum (kaynak = location).
  targetLocation: text("target_location"),
}, (table) => [
  uniqueIndex("playbook_runs_trigger_once").on(table.triggerEvent).where(sql`trigger_event is not null`),
  // Bir akış kapanınca aynı bağlı akış iki kez açılmaz (çift tıklama, yarış).
  uniqueIndex("playbook_runs_chain_once").on(table.parentReference, table.playbookCode).where(sql`parent_reference is not null`),
]);

export const playbookSteps = sqliteTable("playbook_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runReference: text("run_reference").notNull(),
  stepIndex: integer("step_index").notNull(),
  unitCode: text("unit_code").notNull(),
  task: text("task").notNull(),
  approval: integer("approval", { mode: "boolean" }).notNull().default(false),
  taskReference: text("task_reference").notNull(),
  completedBy: text("completed_by"),
  note: text("note"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  // Gecikmeli adım: bu zamandan önce görev "scheduled" bekler (ör. taburcudan 48 saat sonra arama).
  activateAt: integer("activate_at", { mode: "timestamp_ms" }),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("playbook_steps_once").on(table.runReference, table.stepIndex)]);

// Kişiye özel bildirim: iş atanınca, gecikme yükseltmesinde. Aynı olay için ikinci kez yazılmaz (dedupe_key).
export const staffNotifications = sqliteTable("staff_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  path: text("path").notNull().default("/inbox"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
}, (table) => [index("staff_notifications_inbox").on(table.email, table.readAt, table.createdAt)]);

// Sanal hastane simülasyonu: yalnız sonuç özeti saklanır; gerçek iş, görev ve sayaç tablolarına yazılmaz.
export const simulationRuns = sqliteTable("simulation_runs", {
  id: text("id").primaryKey(),
  seed: integer("seed").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  params: text("params").notNull(),
  result: text("result").notNull(),
});

// Görev devri: hedef kişi kabul edene kadar eski sahiplik korunur.
export const taskHandoffs = sqliteTable("task_handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskReference: text("task_reference").notNull(),
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("task_handoffs_one_pending").on(table.taskReference).where(sql`status = 'pending'`)]);

// Arıza bildirimi: bildiren kişi, açılan akış ve bitişte kullanıcı onayı (giderildi / sorun sürüyor) ayrı izlenir.
export const faultReports = sqliteTable("fault_reports", {
  reference: text("reference").primaryKey(),
  runReference: text("run_reference").notNull().unique(),
  category: text("category").notNull(),
  reporterEmail: text("reporter_email").notNull(),
  reporterUnit: text("reporter_unit"),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  reopenedRunReference: text("reopened_run_reference"),
}, (table) => [index("fault_reports_reporter").on(table.reporterEmail, table.status)]);

// Temizlik bağımsız kontrolü (bulut uygulaması): temizlik adımı "tamamlandı" denince akış ilerlemez; kontrol işi açılır.
// Temizliği yapan kişi kontrol edemez. Geçmezse gerekçeyle yeniden temizlik işi açılır. Bir adım için tek bekleyen kontrol.
export const cleaningInspections = sqliteTable("cleaning_inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runReference: text("run_reference").notNull(),
  stepIndex: integer("step_index").notNull(),
  cleaningTaskReference: text("cleaning_task_reference").notNull(),
  inspectionTaskReference: text("inspection_task_reference").notNull().unique(),
  cleanedBy: text("cleaned_by").notNull(),
  status: text("status").notNull().default("pending"),
  inspectorEmail: text("inspector_email"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("cleaning_inspections_one_pending").on(table.runReference, table.stepIndex).where(sql`status = 'pending'`)]);

// Talep yönlendirme: talep türü → birim. Kayıt yoksa kodda tanımlı varsayılan birim geçerlidir (lib/unit-directory.ts).
export const routingRules = sqliteTable("routing_rules", {
  requestCode: text("request_code").primaryKey(),
  unitCode: text("unit_code").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Birimden talep: personelin başka birimden istediği iş. Tek görev olarak hedef birim kuyruğuna düşer;
// işi o birimin sorumlusu dağıtır. Bitince talep eden "tamam / sorun sürüyor" der.
export const serviceRequests = sqliteTable("service_requests", {
  reference: text("reference").primaryKey(),
  typeCode: text("type_code").notNull(),
  unitCode: text("unit_code").notNull(),
  taskReference: text("task_reference").notNull().unique(),
  requesterEmail: text("requester_email").notNull(),
  requesterUnit: text("requester_unit"),
  location: text("location"),
  targetLocation: text("target_location"),
  deviceCode: text("device_code"),
  note: text("note"),
  status: text("status").notNull().default("open"),
  reopenedFrom: text("reopened_from"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  doneAt: integer("done_at", { mode: "timestamp_ms" }),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
}, (table) => [index("service_requests_requester").on(table.requesterEmail, table.status), index("service_requests_unit").on(table.unitCode, table.status)]);
