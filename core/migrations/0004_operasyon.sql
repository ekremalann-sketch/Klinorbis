-- 0004 · Akış tanımları (sürümlü), akış çalıştırmaları, görevler, durum geçişleri, yükseltme, bildirim, vardiya
CREATE TABLE kb.playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  code text NOT NULL CHECK (code ~ '^[a-z0-9-]{3,40}$'),
  title text NOT NULL,
  category text NOT NULL,
  current_version integer,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);
COMMENT ON TABLE kb.playbooks IS 'Operasyon akışı (kurum kendi akışını tanımlayabilir). Klinik karar adımı yalnız "yetkili personel karar verir" onayı olarak tanımlanır.';

CREATE TABLE kb.playbook_versions (
  tenant_id uuid NOT NULL,
  playbook_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND jsonb_typeof(definition -> 'steps') = 'array' AND jsonb_array_length(definition -> 'steps') BETWEEN 2 AND 30),
  authored_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playbook_id, version),
  FOREIGN KEY (tenant_id, playbook_id) REFERENCES kb.playbooks(tenant_id, id),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_by <> authored_by))
);
COMMENT ON TABLE kb.playbook_versions IS 'Akış sürümü: taslağı yazan kişi onaylayamaz (görevler ayrılığı); onaylı sürüm değiştirilemez.';

CREATE OR REPLACE FUNCTION kb.freeze_approved_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'approved' AND (NEW.definition IS DISTINCT FROM OLD.definition OR NEW.status NOT IN ('approved', 'retired')) THEN
    RAISE EXCEPTION 'Onaylı akış sürümü değiştirilemez; yeni sürüm açın' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER playbook_versions_freeze BEFORE UPDATE ON kb.playbook_versions FOR EACH ROW EXECUTE FUNCTION kb.freeze_approved_version();

CREATE TABLE kb.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reference text NOT NULL CHECK (reference ~ '^AKS-[A-Z0-9-]{6,40}$'),
  playbook_id uuid NOT NULL,
  playbook_version integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  step_count integer NOT NULL CHECK (step_count BETWEEN 2 AND 30),
  parent_run_id uuid REFERENCES kb.runs(id),
  trigger_event text,
  campus_id uuid,
  location_code text CHECK (location_code ~ '^[0-9A-Za-zÇĞİÖŞÜçğıöşü ./-]{1,24}$'),
  asset_id uuid,
  patient_token text CHECK (patient_token ~ '^P-[0-9A-F]{4,16}$'),
  chain_choices text[] NOT NULL DEFAULT '{}',
  started_by text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  cancel_reason text,
  idempotency_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, reference),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, trigger_event),
  UNIQUE (parent_run_id, playbook_id),
  FOREIGN KEY (playbook_id, playbook_version) REFERENCES kb.playbook_versions(playbook_id, version),
  FOREIGN KEY (tenant_id, campus_id) REFERENCES kb.campuses(tenant_id, id),
  CHECK (current_step < step_count),
  CHECK ((status = 'active') = (closed_at IS NULL)),
  CHECK (status <> 'cancelled' OR length(cancel_reason) >= 5)
);
COMMENT ON TABLE kb.runs IS 'Akış çalıştırması. Hasta yalnız takma ad belirteciyle (P-…) bağlanır; ad, TCKN veya tanı tutulmaz. Aynı olay ve aynı bağlı akış iki kez açılamaz.';
CREATE INDEX runs_active ON kb.runs (tenant_id, status, started_at DESC) WHERE status = 'active';
CREATE TRIGGER runs_touch BEFORE UPDATE ON kb.runs FOR EACH ROW EXECUTE FUNCTION kb.touch_row();

CREATE TABLE kb.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reference text NOT NULL CHECK (reference ~ '^TSK-[A-Z0-9-]{4,60}$'),
  unit_id uuid NOT NULL,
  run_id uuid REFERENCES kb.runs(id) ON DELETE CASCADE,
  step_index integer CHECK (step_index >= 0),
  source text NOT NULL CHECK (source IN ('playbook', 'bridge', 'manual', 'call', 'request', 'kvkk', 'incident', 'maintenance')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('scheduled', 'queued', 'accepted', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'yuksek', 'kritik')),
  priority_source text NOT NULL DEFAULT 'kural' CHECK (priority_source IN ('kural', 'personel', 'hbys')),
  requires_approval boolean NOT NULL DEFAULT false,
  clinical_approval boolean NOT NULL DEFAULT false,
  assigned_staff_id uuid,
  activate_at timestamptz,
  due_at timestamptz,
  escalation_level smallint NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 2),
  completed_by text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, reference),
  UNIQUE (run_id, step_index),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_staff_id) REFERENCES kb.staff(tenant_id, id),
  CHECK ((run_id IS NULL) = (step_index IS NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (status <> 'scheduled' OR activate_at IS NOT NULL),
  CHECK (NOT clinical_approval OR requires_approval),
  CHECK (priority_source <> 'kural' OR priority <> 'kritik')
);
COMMENT ON TABLE kb.tasks IS 'Birim iş kutusundaki görev. "kritik" öncelik kuralla üretilemez; yalnız personel veya HBYS verir (ADR-003). Durum geçişleri kb.task_transitions ile sınırlı.';
CREATE INDEX tasks_queue ON kb.tasks (tenant_id, unit_id, status, due_at) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX tasks_overdue ON kb.tasks (tenant_id, due_at) WHERE status IN ('queued', 'accepted', 'in_progress', 'blocked') AND escalation_level < 2;
CREATE INDEX tasks_assignee ON kb.tasks (assigned_staff_id) WHERE assigned_staff_id IS NOT NULL AND status NOT IN ('completed', 'cancelled');
CREATE TRIGGER tasks_touch BEFORE UPDATE ON kb.tasks FOR EACH ROW EXECUTE FUNCTION kb.touch_row();

CREATE TABLE kb.task_transitions (
  from_status text NOT NULL,
  to_status text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
COMMENT ON TABLE kb.task_transitions IS 'Görev durumunun izin verilen geçişleri; tamamlanan veya iptal edilen görev yeniden açılamaz.';
INSERT INTO kb.task_transitions VALUES
  ('scheduled', 'queued'), ('scheduled', 'cancelled'),
  ('queued', 'accepted'), ('queued', 'in_progress'), ('queued', 'completed'), ('queued', 'cancelled'), ('queued', 'blocked'),
  ('accepted', 'in_progress'), ('accepted', 'completed'), ('accepted', 'queued'), ('accepted', 'cancelled'), ('accepted', 'blocked'),
  ('in_progress', 'completed'), ('in_progress', 'blocked'), ('in_progress', 'cancelled'), ('in_progress', 'queued'),
  ('blocked', 'queued'), ('blocked', 'in_progress'), ('blocked', 'cancelled');

CREATE OR REPLACE FUNCTION kb.enforce_task_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (SELECT 1 FROM kb.task_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN
    RAISE EXCEPTION 'Görev durumu % → % geçişine izin yok', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.reference IS DISTINCT FROM OLD.reference THEN
    RAISE EXCEPTION 'Görevin kurumu ve referansı değiştirilemez' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_transition BEFORE UPDATE ON kb.tasks FOR EACH ROW EXECUTE FUNCTION kb.enforce_task_transition();

CREATE TABLE kb.task_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES kb.tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('created', 'status', 'assigned', 'escalated', 'note', 'approved')),
  from_status text,
  to_status text,
  actor text NOT NULL,
  note text CHECK (length(note) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE kb.task_events IS 'Görev geçmişi (kim, ne zaman, ne değişti). Not alanı maskelenmiş kısa metindir.';
CREATE INDEX task_events_task ON kb.task_events (task_id, at);

CREATE OR REPLACE FUNCTION kb.log_task_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO kb.task_events (tenant_id, task_id, kind, to_status, actor) VALUES (NEW.tenant_id, NEW.id, 'created', NEW.status, kb.current_actor());
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO kb.task_events (tenant_id, task_id, kind, from_status, to_status, actor) VALUES (NEW.tenant_id, NEW.id, 'status', OLD.status, NEW.status, kb.current_actor());
    END IF;
    IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
      INSERT INTO kb.task_events (tenant_id, task_id, kind, actor) VALUES (NEW.tenant_id, NEW.id, 'assigned', kb.current_actor());
    END IF;
    IF NEW.escalation_level > OLD.escalation_level THEN
      INSERT INTO kb.task_events (tenant_id, task_id, kind, actor, note) VALUES (NEW.tenant_id, NEW.id, 'escalated', kb.current_actor(), 'seviye ' || NEW.escalation_level);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER tasks_events AFTER INSERT OR UPDATE ON kb.tasks FOR EACH ROW EXECUTE FUNCTION kb.log_task_event();

CREATE TABLE kb.target_policies (
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  source text NOT NULL,
  target_minutes integer NOT NULL CHECK (target_minutes BETWEEN 1 AND 10080),
  first_escalation_after integer NOT NULL DEFAULT 0 CHECK (first_escalation_after >= 0),
  second_escalation_after integer NOT NULL DEFAULT 30 CHECK (second_escalation_after > first_escalation_after),
  PRIMARY KEY (unit_id, source),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id)
);
COMMENT ON TABLE kb.target_policies IS 'Birim ve iş türüne göre hedef süre ve yükseltme eşikleri (dakika). Kod sabiti değil, kurum ayarıdır.';

CREATE TABLE kb.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('task', 'escalation', 'report', 'security', 'kvkk')),
  title text NOT NULL CHECK (length(title) <= 120),
  detail text NOT NULL CHECK (length(detail) <= 240),
  link text NOT NULL CHECK (link ~ '^/[A-Za-z0-9/_#?=&.-]*$'),
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (tenant_id, dedupe_key, staff_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE
);
COMMENT ON TABLE kb.notifications IS 'Kişisel bildirim. Metinde hasta belirteci veya kimliği yer almaz; bağlantı yalnız uygulama içi yoldur.';
CREATE INDEX notifications_inbox ON kb.notifications (staff_id, read_at, created_at DESC);

CREATE TABLE kb.notification_preferences (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'web_push', 'email')),
  enabled boolean NOT NULL DEFAULT true,
  quiet_from time,
  quiet_to time,
  PRIMARY KEY (staff_id, channel),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE,
  CHECK ((quiet_from IS NULL) = (quiet_to IS NULL))
);
COMMENT ON TABLE kb.notification_preferences IS 'Bildirim kanalı tercihleri ve sessiz saat.';

CREATE TABLE kb.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'handoff', 'closed')),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '36 hours')
);
COMMENT ON TABLE kb.shifts IS 'Vardiya planı.';
CREATE INDEX shifts_unit_time ON kb.shifts (tenant_id, unit_id, starts_at);

CREATE TABLE kb.shift_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  from_staff_id uuid NOT NULL,
  to_staff_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  open_tasks integer NOT NULL DEFAULT 0 CHECK (open_tasks >= 0),
  note text CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, from_staff_id) REFERENCES kb.staff(tenant_id, id),
  FOREIGN KEY (tenant_id, to_staff_id) REFERENCES kb.staff(tenant_id, id),
  CHECK (from_staff_id <> to_staff_id),
  CHECK ((status = 'pending') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX shift_handoffs_one_pending ON kb.shift_handoffs (from_staff_id, unit_id) WHERE status = 'pending';
COMMENT ON TABLE kb.shift_handoffs IS 'Vardiya devri; kişi başına birimde tek bekleyen devir.';
