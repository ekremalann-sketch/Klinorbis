-- 0009 · KVKK: işleme envanteri, hukuki sebep, aydınlatma sürümleri, açık rıza, ilgili kişi başvuruları (30 gün),
-- veri ihlali (72 saat), veri işleyenler ve aktarımlar, saklama-imha politikası, imha çalıştırmaları, yasal saklama
CREATE TABLE kvkk.legal_bases (
  code text PRIMARY KEY,
  article text NOT NULL,
  label text NOT NULL,
  special_category boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE kvkk.legal_bases IS 'Hukuki sebep kataloğu (KVKK m.5 ve m.6). Metin hukukçu onayıyla güncellenir; sürüm değişikliği yeni satır olarak eklenir.';
INSERT INTO kvkk.legal_bases VALUES
  ('m5_2_c', 'KVKK m.5/2-c', 'Sözleşmenin kurulması veya ifası', false),
  ('m5_2_c_hukuki', 'KVKK m.5/2-ç', 'Hukuki yükümlülüğün yerine getirilmesi', false),
  ('m5_2_f', 'KVKK m.5/2-f', 'Meşru menfaat', false),
  ('m6_3_e', 'KVKK m.6/3-e (7499 sk. ile değişik; lafız hukukçuca doğrulanmalı)', 'Kamu sağlığının korunması, koruyucu hekimlik, tıbbi teşhis, tedavi ve bakım hizmetlerinin yürütülmesi, sağlık hizmetleri ile finansmanının planlanması ve yönetimi amacıyla, sır saklama yükümlülüğü altındaki kişiler veya yetkili kurumlar tarafından', true),
  ('m6_acik_riza', 'KVKK m.6/2', 'Açık rıza', true);

CREATE TABLE kvkk.processing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9._-]{2,30}$'),
  purpose text NOT NULL,
  data_categories text[] NOT NULL CHECK (cardinality(data_categories) >= 1),
  special_category boolean NOT NULL,
  legal_basis text NOT NULL REFERENCES kvkk.legal_bases(code),
  data_subjects text[] NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  storage_location text NOT NULL DEFAULT 'TR' CHECK (storage_location = 'TR'),
  retention_policy_id uuid,
  security_measures text[] NOT NULL DEFAULT '{}',
  role text NOT NULL CHECK (role IN ('veri_sorumlusu', 'veri_isleyen')),
  reviewed_at date,
  UNIQUE (tenant_id, code)
);
COMMENT ON TABLE kvkk.processing_activities IS 'Kişisel veri işleme envanteri (VERBİS hazırlığı). Saklama yeri her zaman TR.';

CREATE TABLE kvkk.privacy_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  audience text NOT NULL CHECK (audience IN ('hasta', 'personel', 'ziyaretci')),
  version integer NOT NULL CHECK (version >= 1),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  body text NOT NULL,
  published_at timestamptz,
  approved_by text,
  UNIQUE (tenant_id, audience, version),
  CHECK (published_at IS NULL OR approved_by IS NOT NULL)
);
COMMENT ON TABLE kvkk.privacy_notices IS 'Aydınlatma metni sürümleri; yayımlanan metin karmasıyla kanıtlanır.';

CREATE TABLE kvkk.notice_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  notice_id uuid NOT NULL REFERENCES kvkk.privacy_notices(id),
  subject_ref text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ekran', 'basili', 'sms', 'eposta')),
  delivered_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE kvkk.notice_deliveries IS 'Hangi aydınlatma sürümünün kime, ne zaman gösterildiği. Gösterim rıza anlamına gelmez.';

CREATE TABLE kvkk.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  subject_ref text NOT NULL,
  purpose text NOT NULL,
  text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  given_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  channel text NOT NULL,
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= given_at)
);
COMMENT ON TABLE kvkk.consents IS 'Açık rıza kaydı: belirli amaç, bilgilendirilmiş, özgür; geri alınabilir. Başka hukuki sebep varken rıza istenmez.';

CREATE TABLE kvkk.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  reference text NOT NULL CHECK (reference ~ '^KVKK-[0-9]{4}-[0-9A-Z]{4,10}$'),
  kind text NOT NULL CHECK (kind IN ('bilgi', 'erisim', 'duzeltme', 'silme', 'aktarim_bilgisi', 'itiraz', 'tazminat')),
  channel text NOT NULL CHECK (channel IN ('yazili', 'kep', 'eposta_kayitli', 'basvuru_formu')),
  subject_ref text,
  received_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  identity_verified_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'identity_pending', 'in_review', 'answered', 'rejected')),
  decision_reason text,
  answered_at timestamptz,
  answer_ref text,
  UNIQUE (tenant_id, reference),
  CHECK (due_at = received_at + interval '30 days'),
  CHECK ((status IN ('answered', 'rejected')) = (answered_at IS NOT NULL)),
  CHECK (status <> 'rejected' OR length(decision_reason) >= 10)
);
COMMENT ON TABLE kvkk.data_subject_requests IS 'İlgili kişi başvurusu (KVKK m.11, m.13): son gün başvuru tarihinden 30 gündür ve değiştirilemez; kimlik doğrulama beklemesi süreyi durdurmaz.';
CREATE INDEX dsr_open_due ON kvkk.data_subject_requests (tenant_id, due_at) WHERE status NOT IN ('answered', 'rejected');

CREATE TABLE kvkk.breach_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  reference text NOT NULL CHECK (reference ~ '^IHL-[0-9]{4}-[0-9A-Z]{4,10}$'),
  detected_at timestamptz NOT NULL,
  learned_at timestamptz NOT NULL,
  board_deadline timestamptz NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
  data_categories text[] NOT NULL DEFAULT '{}',
  affected_estimate integer CHECK (affected_estimate >= 0),
  special_category boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'assessing' CHECK (status IN ('assessing', 'notified_board', 'notified_subjects', 'closed', 'not_reportable')),
  board_notified_at timestamptz,
  subjects_notified_at timestamptz,
  controller_notified_at timestamptz,
  cyber_reported_at timestamptz,
  not_reportable_reason text,
  UNIQUE (tenant_id, reference),
  CHECK (learned_at >= detected_at - interval '1 day'),
  CHECK (status <> 'not_reportable' OR length(not_reportable_reason) >= 20),
  CHECK (status NOT IN ('notified_board', 'notified_subjects') OR board_notified_at IS NOT NULL)
);
COMMENT ON TABLE kvkk.breach_incidents IS 'Kişisel veri ihlali: Kurula bildirim için 72 saatlik son an öğrenme zamanından otomatik hesaplanır. Veri işleyen olarak veri sorumlusuna (hastaneye) bildirim ve 7545 kapsamında siber olay bildirimi ayrı alanlardır. Sistem kendiliğinden bildirim göndermez.';

CREATE TABLE kvkk.breach_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  breach_id uuid NOT NULL REFERENCES kvkk.breach_incidents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('tespit', 'degerlendirme', 'onlem', 'bildirim_kurul', 'bildirim_ilgili', 'bildirim_sorumlu', 'bildirim_sgb', 'kapanis')),
  note text NOT NULL CHECK (length(note) BETWEEN 3 AND 1000),
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION kvkk.set_breach_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Kurula bildirim son anı: öğrenme zamanı + 72 saat (KVKK m.12/5; Kurul 2019/10). Elle değiştirilemez.
  NEW.board_deadline := NEW.learned_at + interval '72 hours';
  RETURN NEW;
END $$;
CREATE TRIGGER breach_deadline BEFORE INSERT OR UPDATE ON kvkk.breach_incidents FOR EACH ROW EXECUTE FUNCTION kvkk.set_breach_deadline();

COMMENT ON TABLE kvkk.breach_events IS 'İhlal zaman çizelgesi (kanıt).';

CREATE TABLE kvkk.processors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  name text NOT NULL,
  service text NOT NULL,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  contract_ref text,
  contract_signed_at date,
  sub_processor_of uuid REFERENCES kvkk.processors(id),
  handles_special_category boolean NOT NULL DEFAULT false,
  CHECK (NOT handles_special_category OR country = 'TR')
);
COMMENT ON TABLE kvkk.processors IS 'Veri işleyen ve alt işleyenler. Sağlık verisi işleyen alt işleyen yalnız TR olabilir (SBYS md.16(3) ürün kararı).';

CREATE TABLE kvkk.cross_border_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  processor_id uuid NOT NULL REFERENCES kvkk.processors(id),
  data_categories text[] NOT NULL,
  mechanism text NOT NULL CHECK (mechanism IN ('yeterlilik', 'standart_sozlesme', 'bagli_sirket_kurallari', 'taahhutname', 'arizi')),
  contains_personal_data boolean NOT NULL,
  contains_health_data boolean NOT NULL DEFAULT false CHECK (NOT contains_health_data),
  board_notified_at date,
  CHECK (mechanism <> 'standart_sozlesme' OR board_notified_at IS NOT NULL OR NOT contains_personal_data)
);
COMMENT ON TABLE kvkk.cross_border_transfers IS 'Yurt dışı aktarım kaydı. Sağlık verisi aktarımı kaydedilemez (ürün kuralı); standart sözleşmede Kurula 5 iş günü içindeki bildirim tarihi zorunlu.';

CREATE TABLE kvkk.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  data_category text NOT NULL,
  target text NOT NULL CHECK (target IN ('kb.notifications', 'kb.task_events', 'kb.sessions', 'kb.inbound_messages', 'kb.outbound_messages', 'kb.idempotency_keys', 'kb.encounters', 'vault.identities', 'kb.cold_chain_readings')),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 36500),
  action text NOT NULL CHECK (action IN ('sil', 'anonimlestir')),
  legal_reference text NOT NULL,
  approved_by text,
  active boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, target),
  CHECK (NOT active OR approved_by IS NOT NULL)
);
COMMENT ON TABLE kvkk.retention_policies IS 'Saklama-imha politikası. Yalnız beyaz listedeki tablolar imha edilebilir; politika onaylanmadan etkinleşmez. Süreler hastanenin hukukçusu tarafından belirlenir.';

CREATE TABLE kvkk.legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  target text NOT NULL,
  subject_ref text,
  reason text NOT NULL CHECK (length(reason) >= 10),
  placed_by text NOT NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
COMMENT ON TABLE kvkk.legal_holds IS 'Yasal saklama: dava, soruşturma veya başvuru süresince imha durdurulur.';

CREATE TABLE kvkk.disposal_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  actor text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(summary) = 'object'),
  report_sha256 text CHECK (report_sha256 ~ '^[0-9a-f]{64}$')
);
COMMENT ON TABLE kvkk.disposal_runs IS 'Periyodik imha çalıştırması ve tutanak karması (en az 3 yıl saklanır).';
