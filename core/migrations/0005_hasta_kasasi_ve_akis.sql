-- 0005 · Takma ad kasası (vault), yatış dönemi (takma adlı), yatak hareketleri, taburcu planı, transport, temizlik
-- Kimlik (ad, TCKN) yalnız vault.identities içinde ve yalnız şifreli tutulur. Uygulama rolü bu tabloyu doğrudan
-- okuyamaz; kimliğe geri dönüş yalnız gerekçeli ve kayıtlı kb.reidentify() fonksiyonuyla yapılır.
CREATE TABLE vault.key_versions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  purpose text NOT NULL CHECK (purpose IN ('identity', 'pseudonym', 'blind_index', 'totp')),
  wrapped_dek bytea NOT NULL,
  kek_ref text NOT NULL CHECK (length(kek_ref) BETWEEN 3 AND 200),
  algorithm text NOT NULL DEFAULT 'AES-256-GCM' CHECK (algorithm IN ('AES-256-GCM', 'HMAC-SHA256')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'decrypt_only', 'destroyed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  CHECK ((status = 'destroyed') = (destroyed_at IS NOT NULL))
);
CREATE UNIQUE INDEX key_versions_one_active ON vault.key_versions (tenant_id, purpose) WHERE status = 'active';
COMMENT ON TABLE vault.key_versions IS 'Zarf şifreleme: veri anahtarı (DEK) ana anahtarla (KEK, KMS/HSM) sarılı tutulur; amaç başına tek etkin anahtar; rotasyonda eski anahtar yalnız çözme modunda kalır.';

CREATE TABLE vault.identities (
  token text PRIMARY KEY CHECK (token ~ '^P-[0-9A-F]{4,16}$'),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  national_id_bidx text NOT NULL CHECK (national_id_bidx ~ '^[0-9a-f]{64}$'),
  identity_ciphertext bytea NOT NULL,
  key_version integer NOT NULL REFERENCES vault.key_versions(id),
  source text NOT NULL DEFAULT 'bridge' CHECK (source IN ('bridge', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  anonymized_at timestamptz,
  UNIQUE (tenant_id, national_id_bidx)
);
COMMENT ON TABLE vault.identities IS 'Takma ad ↔ kimlik eşlemesi. Kimlik yalnız AES-256-GCM ile şifreli; arama için anahtarlı kör indeks (HMAC). Anonimleştirmede şifreli alan silinir.';

CREATE TABLE vault.reidentification_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  token text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 15 AND 500),
  break_glass_id uuid REFERENCES kb.break_glass_sessions(id),
  at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE vault.reidentification_log IS 'Kimliğe her geri dönüşün gerekçeli kaydı (KVKK m.12, Kişisel Sağlık Verileri Yön. erişim kaydı).';

CREATE TABLE kb.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  patient_token text NOT NULL CHECK (patient_token ~ '^P-[0-9A-F]{4,16}$'),
  external_visit_hash text NOT NULL CHECK (external_visit_hash ~ '^[0-9a-f]{64}$'),
  unit_id uuid NOT NULL,
  bed_id uuid,
  status text NOT NULL DEFAULT 'admitted' CHECK (status IN ('expected', 'admitted', 'transferring', 'discharge_planned', 'discharged', 'cancelled')),
  admitted_at timestamptz,
  expected_discharge_at timestamptz,
  discharged_at timestamptz,
  source text NOT NULL DEFAULT 'bridge' CHECK (source IN ('bridge', 'manual', 'demo')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, external_visit_hash),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, bed_id) REFERENCES kb.beds(tenant_id, id),
  CHECK ((status = 'discharged') = (discharged_at IS NOT NULL)),
  CHECK (discharged_at IS NULL OR admitted_at IS NULL OR discharged_at >= admitted_at)
);
COMMENT ON TABLE kb.encounters IS 'Yatış dönemi (takma adlı). HBYS protokol/ziyaret numarası yalnız anahtarlı karma olarak tutulur; tanı, ilaç ve klinik not tutulmaz.';
CREATE UNIQUE INDEX encounters_one_per_bed ON kb.encounters (bed_id) WHERE bed_id IS NOT NULL AND status IN ('admitted', 'transferring', 'discharge_planned');
CREATE INDEX encounters_unit_status ON kb.encounters (tenant_id, unit_id, status);
CREATE TRIGGER encounters_touch BEFORE UPDATE ON kb.encounters FOR EACH ROW EXECUTE FUNCTION kb.touch_row();

CREATE TABLE kb.encounter_moves (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL REFERENCES kb.encounters(id) ON DELETE CASCADE,
  from_bed_id uuid REFERENCES kb.beds(id),
  to_bed_id uuid REFERENCES kb.beds(id),
  reason text NOT NULL CHECK (reason IN ('admit', 'transfer', 'discharge', 'correction')),
  source_message_id uuid,
  at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_bed_id IS DISTINCT FROM to_bed_id)
);
COMMENT ON TABLE kb.encounter_moves IS 'Yatak hareketleri (yatış, nakil, taburcu) — HL7 ADT A01/A02/A03 ile beslenir.';

CREATE TABLE kb.discharge_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL UNIQUE REFERENCES kb.encounters(id) ON DELETE CASCADE,
  planned_at timestamptz NOT NULL,
  blockers text[] NOT NULL DEFAULT '{}' CHECK (blockers <@ ARRAY['epikriz', 'recete', 'provizyon', 'ulasim', 'egitim', 'yakin_bilgilendirme', 'evde_bakim']::text[]),
  ready boolean GENERATED ALWAYS AS (cardinality(blockers) = 0) STORED,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE kb.discharge_plans IS 'Taburcu planı ve idari engeller (epikriz yazılmadı, provizyon yok…). Klinik içerik değil, yalnız engel adı tutulur.';

CREATE TABLE kb.transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid REFERENCES kb.encounters(id),
  from_unit_id uuid NOT NULL,
  to_unit_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('sedye', 'tekerlekli_sandalye', 'yatak', 'yurur')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  assigned_staff_id uuid,
  delivered_at timestamptz,
  FOREIGN KEY (tenant_id, from_unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, to_unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_staff_id) REFERENCES kb.staff(tenant_id, id),
  CHECK (from_unit_id <> to_unit_id),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL))
);
COMMENT ON TABLE kb.transport_requests IS 'Hasta transportu talebi ve süreleri.';

CREATE TABLE kb.cleaning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bed_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('standart', 'izolasyon', 'terminal')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'done', 'inspected')),
  checklist jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checklist) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  done_by text,
  FOREIGN KEY (tenant_id, bed_id) REFERENCES kb.beds(tenant_id, id),
  CHECK ((status IN ('done', 'inspected')) = (done_at IS NOT NULL))
);
CREATE UNIQUE INDEX cleaning_one_open_per_bed ON kb.cleaning_jobs (bed_id) WHERE status IN ('queued', 'in_progress');
COMMENT ON TABLE kb.cleaning_jobs IS 'Oda/yatak temizlik işi; yatak başına tek açık iş.';

-- Kimliğe geri dönüş: yalnız yetkili kişi, gerekçeyle ve kayıt düşülerek. Şifreli veriyi döndürür; çözme uygulama
-- katmanında, anahtar kasasından alınan anahtarla yapılır (veritabanı düz metin kimlik görmez).
CREATE OR REPLACE FUNCTION kb.reidentify(p_token text, p_reason text, p_break_glass uuid DEFAULT NULL)
RETURNS TABLE (identity_ciphertext bytea, key_version integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, kb, vault AS $$
BEGIN
  IF kb.current_tenant() IS NULL THEN RAISE EXCEPTION 'Kurum bağlamı yok' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF length(coalesce(p_reason, '')) < 15 THEN RAISE EXCEPTION 'Gerekçe en az 15 karakter olmalı' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(current_setting('app.can_reidentify', true), '') <> 'on' AND p_break_glass IS NULL THEN
    RAISE EXCEPTION 'Kimliğe geri dönüş yetkisi yok' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO vault.reidentification_log (tenant_id, token, actor, reason, break_glass_id) VALUES (kb.current_tenant(), p_token, kb.current_actor(), p_reason, p_break_glass);
  RETURN QUERY SELECT i.identity_ciphertext, i.key_version FROM vault.identities i
    WHERE i.token = p_token AND i.tenant_id = kb.current_tenant() AND i.anonymized_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION kb.reidentify(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb.reidentify(text, text, uuid) TO kb_app;
