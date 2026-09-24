import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
});

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
