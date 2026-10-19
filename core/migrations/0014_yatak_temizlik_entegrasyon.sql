-- 0014 · Yatak durumunun bileşenlere ayrılması, temizlik iş akışı, HBYS kod eşleme, olay sırası, iptal/düzeltme,
-- karantina, yeniden deneme için şifreli yük ve mutabakat.

-- ---- Yatak: tek "status" yerine ayrı bileşenler; status artık bileşenlerden türetilen özet ----
ALTER TABLE kb.beds
  ADD COLUMN occupancy text NOT NULL DEFAULT 'bos' CHECK (occupancy IN ('bos', 'dolu')),
  ADD COLUMN occupancy_source text NOT NULL DEFAULT 'kurulum' CHECK (occupancy_source IN ('hbys', 'personel', 'kurulum')),
  ADD COLUMN occupancy_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN cleaning_state text NOT NULL DEFAULT 'temiz' CHECK (cleaning_state IN ('temiz', 'kirli', 'temizleniyor', 'kontrol_bekliyor')),
  ADD COLUMN block_reason text CHECK (block_reason IN ('teknik', 'personel', 'izolasyon', 'diger')),
  ADD COLUMN block_note text CHECK (length(block_note) <= 200),
  ADD COLUMN blocked_by text,
  ADD COLUMN reserved_for text CHECK (reserved_for ~ '^(P-[0-9A-F]{4,16}|AKS-[A-Z0-9-]{6,40})$'),
  ADD COLUMN reserved_until timestamptz,
  ADD COLUMN reserved_by text,
  ADD COLUMN conflict text CHECK (conflict IN ('kirli_yataga_yatis', 'bloklu_yataga_yatis'));
ALTER TABLE kb.beds ADD CONSTRAINT beds_block_by CHECK ((block_reason IS NULL) = (blocked_by IS NULL));
ALTER TABLE kb.beds ADD CONSTRAINT beds_reservation CHECK ((reserved_for IS NULL) = (reserved_until IS NULL) AND (reserved_for IS NULL) = (reserved_by IS NULL));
COMMENT ON COLUMN kb.beds.occupancy IS 'Doluluk: kaynağı HBYS (yatış/taburcu) veya yetkili personel; Klinorbis kendisi yatış kararı vermez.';
COMMENT ON COLUMN kb.beds.cleaning_state IS 'Fiziksel temizlik durumu; taburcu/nakilde otomatik kirli olur, bağımsız kontrolden sonra temiz olur.';
COMMENT ON COLUMN kb.beds.block_reason IS 'Teknik arıza, personel yetersizliği, izolasyon gibi engel; kim koyduğu kayıtlı.';
COMMENT ON COLUMN kb.beds.conflict IS 'HBYS kirli veya bloklu yatağa yatış bildirdiyse işaretlenir; insan çözer.';

DROP TRIGGER IF EXISTS beds_transition ON kb.beds;
CREATE OR REPLACE FUNCTION kb.derive_bed_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Doluluk boşalınca yatak kendiliğinden kirli olur (temizlenmeden yeniden "hazır" görünemez).
    IF OLD.occupancy = 'dolu' AND NEW.occupancy = 'bos' THEN NEW.cleaning_state := 'kirli'; NEW.conflict := NULL; END IF;
    IF NEW.occupancy IS DISTINCT FROM OLD.occupancy THEN
      NEW.occupancy_changed_at := now();
      IF NEW.occupancy = 'dolu' THEN
        NEW.reserved_for := NULL; NEW.reserved_until := NULL; NEW.reserved_by := NULL;
        NEW.conflict := CASE WHEN NEW.block_reason IS NOT NULL THEN 'bloklu_yataga_yatis' WHEN NEW.cleaning_state <> 'temiz' THEN 'kirli_yataga_yatis' ELSE NULL END;
      END IF;
    END IF;
    IF NEW.cleaning_state IS DISTINCT FROM OLD.cleaning_state AND NOT (OLD.occupancy = 'dolu' AND NEW.occupancy = 'bos') AND NOT EXISTS (
      SELECT 1 FROM (VALUES ('temiz','kirli'), ('kirli','temizleniyor'), ('temizleniyor','kontrol_bekliyor'), ('temizleniyor','kirli'),
                            ('kontrol_bekliyor','temiz'), ('kontrol_bekliyor','kirli'), ('kirli','kirli')) t(a, b)
      WHERE a = OLD.cleaning_state AND b = NEW.cleaning_state) THEN
      RAISE EXCEPTION 'Temizlik durumu % → % geçişine izin yok', OLD.cleaning_state, NEW.cleaning_state USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reserved_for IS NOT NULL AND OLD.reserved_for IS DISTINCT FROM NEW.reserved_for
       AND (NEW.occupancy = 'dolu' OR NEW.cleaning_state <> 'temiz' OR NEW.block_reason IS NOT NULL OR NEW.conflict IS NOT NULL) THEN
      RAISE EXCEPTION 'Yalnız boş, temiz ve engelsiz yatak ayrılabilir' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.status := CASE
    WHEN NEW.block_reason = 'teknik' THEN 'maintenance'
    WHEN NEW.block_reason IS NOT NULL OR NEW.conflict IS NOT NULL THEN 'blocked'
    WHEN NEW.occupancy = 'dolu' THEN 'occupied'
    WHEN NEW.cleaning_state <> 'temiz' THEN 'cleaning'
    WHEN NEW.reserved_for IS NOT NULL AND NEW.reserved_until > now() THEN 'reserved'
    ELSE 'available' END;
  IF NEW.status IS DISTINCT FROM OLD.status OR TG_OP = 'INSERT' THEN NEW.status_since := now(); END IF;
  RETURN NEW;
END $$;

COMMENT ON TABLE kb.bed_transitions IS 'Eski tek durumlu model (0002). 0013 sonrası durum bileşenlerden türetilir; tablo geriye uyumluluk için duruyor.';
UPDATE kb.beds SET occupancy = CASE WHEN status = 'occupied' THEN 'dolu' ELSE 'bos' END,
  cleaning_state = CASE WHEN status = 'cleaning' THEN 'kirli' ELSE 'temiz' END,
  block_reason = CASE WHEN status = 'maintenance' THEN 'teknik' WHEN status IN ('blocked','reserved') THEN 'diger' ELSE NULL END,
  blocked_by = CASE WHEN status IN ('maintenance','blocked','reserved') THEN 'migration-review' ELSE NULL END,
  block_note = CASE WHEN status IN ('maintenance','blocked','reserved') THEN 'Önceki engel veya ayırma: yetkili doğrulaması gerekli' ELSE NULL END;
CREATE TRIGGER beds_derive BEFORE INSERT OR UPDATE ON kb.beds FOR EACH ROW EXECUTE FUNCTION kb.derive_bed_status();
UPDATE kb.beds SET occupancy = occupancy;

-- ---- Temizlik iş akışı: kabul → başlangıç → tamamlama → bağımsız kontrol (geçti / yeniden işlem) ----
ALTER TABLE kb.cleaning_jobs DROP CONSTRAINT IF EXISTS cleaning_jobs_status_check;
ALTER TABLE kb.cleaning_jobs DROP CONSTRAINT IF EXISTS cleaning_jobs_check;
ALTER TABLE kb.cleaning_jobs
  ADD COLUMN accepted_by text, ADD COLUMN accepted_at timestamptz,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN inspected_by text, ADD COLUMN inspected_at timestamptz,
  ADD COLUMN inspection_result text CHECK (inspection_result IN ('gecti', 'kaldi')),
  ADD COLUMN rework_of uuid REFERENCES kb.cleaning_jobs(id),
  ADD COLUMN cancelled_reason text,
  ADD COLUMN due_at timestamptz;
-- Önceki kayıtlarda eksik sahiplik/kontrol bilgisi uydurulmaz; eski bitişler yeniden kontrol bekler.
UPDATE kb.cleaning_jobs SET accepted_at = coalesce(done_at,created_at), accepted_by = done_by WHERE status <> 'queued';
UPDATE kb.cleaning_jobs SET status = 'done' WHERE status = 'inspected';
ALTER TABLE kb.cleaning_jobs ADD CONSTRAINT cleaning_status CHECK (status IN ('queued', 'accepted', 'in_progress', 'done', 'inspected', 'failed', 'cancelled'));
ALTER TABLE kb.cleaning_jobs ADD CONSTRAINT cleaning_flow CHECK (
  (status = 'queued' OR accepted_at IS NOT NULL OR status = 'cancelled')
  AND (status NOT IN ('done', 'inspected', 'failed') OR done_at IS NOT NULL)
  AND (status NOT IN ('inspected', 'failed') OR (inspected_at IS NOT NULL AND inspection_result IS NOT NULL))
  AND (inspected_by IS NULL OR inspected_by <> done_by)
  AND (status <> 'cancelled' OR length(cancelled_reason) >= 5));
DROP INDEX IF EXISTS kb.cleaning_one_open_per_bed;
CREATE UNIQUE INDEX cleaning_one_open_per_bed ON kb.cleaning_jobs (bed_id) WHERE status IN ('queued', 'accepted', 'in_progress', 'done');
COMMENT ON TABLE kb.cleaning_jobs IS 'Temizlik işi: kabul, başlangıç, tamamlama ve temizliği yapandan farklı kişinin kontrolü. Kontrolden kalan iş yeniden işlem olarak açılır.';

-- ---- HBYS kod eşleme ----
CREATE TABLE kb.code_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  system text NOT NULL DEFAULT 'hbys' CHECK (system ~ '^[a-z0-9_-]{2,20}$'),
  kind text NOT NULL CHECK (kind IN ('unit', 'bed')),
  external_code text NOT NULL CHECK (length(external_code) BETWEEN 1 AND 60),
  unit_id uuid,
  bed_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, system, kind, external_code),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, bed_id) REFERENCES kb.beds(tenant_id, id),
  CHECK ((kind = 'unit' AND unit_id IS NOT NULL AND bed_id IS NULL) OR (kind = 'bed' AND bed_id IS NOT NULL))
);
COMMENT ON TABLE kb.code_mappings IS 'HBYS birim/yatak kodlarının Klinorbis kayıtlarına eşlemesi. Eşleşmeyen kod mesajı karantinaya alır.';
ALTER TABLE kb.code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.code_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kb.code_mappings USING (tenant_id = kb.current_tenant()) WITH CHECK (tenant_id = kb.current_tenant());
GRANT SELECT, INSERT, UPDATE ON kb.code_mappings TO kb_app;
GRANT SELECT ON kb.code_mappings TO kb_bridge;

-- ---- Olay sırası ve iptal/düzeltme ----
ALTER TABLE kb.encounters ADD COLUMN last_event_at timestamptz;
UPDATE kb.encounters SET last_event_at = source_message_at;
ALTER TABLE kb.encounters ADD COLUMN prior_bed_id uuid REFERENCES kb.beds(id);
COMMENT ON COLUMN kb.encounters.last_event_at IS 'İşlenen son HBYS olayının zamanı; daha eski tarihli mesaj kaydı geri almaz (sessiz yeniden açma yok).';

-- ---- Gelen mesaj: karantina ve yeniden deneme ----
ALTER TABLE kb.inbound_messages DROP CONSTRAINT IF EXISTS inbound_messages_status_check;
ALTER TABLE kb.inbound_messages ADD CONSTRAINT inbound_status CHECK (status IN ('received', 'processed', 'ignored', 'failed', 'dead_letter', 'quarantined', 'resolved'));
ALTER TABLE kb.inbound_messages
  ADD COLUMN quarantine_reason text CHECK (quarantine_reason IN ('UNMAPPED_UNIT', 'UNMAPPED_BED', 'STALE', 'NO_ENCOUNTER', 'CONFLICT', 'PARSE', 'NO_NATIONAL_ID')),
  ADD COLUMN event_at timestamptz,
  ADD COLUMN resolved_by text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolution text CHECK (resolution IN ('yeniden_islendi', 'yok_sayildi'));
CREATE INDEX inbound_quarantine ON kb.inbound_messages (tenant_id, received_at) WHERE status IN ('quarantined', 'failed', 'dead_letter');
GRANT UPDATE (status, attempts, error_code, processed_at, quarantine_reason, event_at) ON kb.inbound_messages TO kb_bridge;
GRANT UPDATE (status, resolved_by, resolved_at, resolution, attempts, processed_at, error_code) ON kb.inbound_messages TO kb_app;

-- Yeniden deneme için ham mesaj yalnız şifreli, süreli ve kasada tutulur (kimlik içerir).
CREATE TABLE vault.inbound_payloads (
  message_id uuid PRIMARY KEY REFERENCES kb.inbound_messages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  ciphertext bytea NOT NULL,
  key_version integer NOT NULL REFERENCES vault.key_versions(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
COMMENT ON TABLE vault.inbound_payloads IS 'Karantina/yeniden deneme için şifreli ham mesaj; en fazla 7 gün, sonra imha edilir.';
ALTER TABLE vault.inbound_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.inbound_payloads FORCE ROW LEVEL SECURITY;
CREATE POLICY payload_tenant ON vault.inbound_payloads USING (tenant_id = kb.current_tenant()) WITH CHECK (tenant_id = kb.current_tenant());
GRANT USAGE ON SCHEMA vault TO kb_bridge;
GRANT SELECT, INSERT, DELETE ON vault.inbound_payloads TO kb_bridge;

-- ---- Mutabakat: HBYS anlık yatan listesi ile Klinorbis kayıtlarının karşılaştırılması ----
CREATE TABLE kb.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  census_count integer NOT NULL CHECK (census_count >= 0),
  matched integer NOT NULL DEFAULT 0,
  missing_in_klinorbis integer NOT NULL DEFAULT 0,
  missing_in_hbys integer NOT NULL DEFAULT 0,
  location_mismatch integer NOT NULL DEFAULT 0
);
CREATE TABLE kb.reconciliation_items (
  run_id uuid NOT NULL REFERENCES kb.reconciliation_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('missing_in_klinorbis', 'missing_in_hbys', 'location_mismatch')),
  visit_hash text NOT NULL,
  detail text NOT NULL CHECK (length(detail) <= 200),
  resolved_at timestamptz,
  resolved_by text,
  PRIMARY KEY (run_id, visit_hash, kind)
);
COMMENT ON TABLE kb.reconciliation_runs IS 'Mutabakat turu: HBYS yatan hasta listesi ile Klinorbis yatış kayıtları karşılaştırılır; fark kendiliğinden düzeltilmez, insan çözer.';
COMMENT ON TABLE kb.reconciliation_items IS 'Mutabakat farkları (yalnız ziyaret karması ve konum; kimlik yok).';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['kb.reconciliation_runs', 'kb.reconciliation_items'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = kb.current_tenant()) WITH CHECK (tenant_id = kb.current_tenant())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON kb.reconciliation_runs, kb.reconciliation_items TO kb_app;
GRANT SELECT ON kb.encounters TO kb_app;
GRANT UPDATE (occupancy, occupancy_source, cleaning_state, conflict) ON kb.beds TO kb_bridge;

ALTER TABLE kb.cleaning_jobs ADD COLUMN task_id uuid REFERENCES kb.tasks(id);
GRANT UPDATE (task_id) ON kb.cleaning_jobs TO kb_bridge;
INSERT INTO kb.permissions VALUES ('integration.manage', 'Entegrasyon merkezi (karantina, yeniden deneme, eşleme, mutabakat)', true), ('cleaning.inspect', 'Temizlik kontrolü', false), ('cleaning.work', 'Temizlik işi', false);
INSERT INTO kb.role_permissions VALUES ('operations_manager', 'integration.manage'), ('operations_manager', 'cleaning.inspect'), ('operations_manager', 'cleaning.work'),
  ('unit_manager', 'cleaning.inspect'), ('unit_manager', 'cleaning.work'), ('staff', 'cleaning.work'), ('security_officer', 'integration.manage');

-- Kimlik doğrulama vekili kurum kodunu gönderir; kurum tablosu RLS altında olduğu için kimlik bu fonksiyonla çözülür.
CREATE OR REPLACE FUNCTION kb.tenant_id_by_code(p_code text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, kb AS
$$ SELECT id FROM kb.tenants WHERE code = p_code AND active $$;
REVOKE ALL ON FUNCTION kb.tenant_id_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb.tenant_id_by_code(text) TO kb_app;
