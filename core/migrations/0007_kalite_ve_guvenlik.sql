-- 0007 · Hasta güvenliği olay bildirimi, kök neden analizi, şikâyet (iç takip), kalite göstergeleri, iç denetim, tatbikat
CREATE TABLE kb.safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('dusme', 'ilac_hatasi', 'kimlik_hatasi', 'enfeksiyon', 'cihaz', 'ramak_kala', 'siddet', 'diger')),
  harm_level text NOT NULL CHECK (harm_level IN ('yok', 'hafif', 'orta', 'ciddi', 'bilinmiyor')),
  anonymous boolean NOT NULL DEFAULT false,
  reported_by text,
  summary text NOT NULL CHECK (length(summary) BETWEEN 10 AND 1000),
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'rca', 'closed')),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  CHECK (anonymous = (reported_by IS NULL)),
  CHECK (occurred_at <= reported_at + interval '5 minutes')
);
COMMENT ON TABLE kb.safety_incidents IS 'Hasta güvenliği olay bildirimi (iç kalite süreci). Anonim bildirimde bildiren tutulmaz. Özet maskelenmiş serbest metindir; hasta kimliği yazılmaz.';

CREATE TABLE kb.rca_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  incident_id uuid NOT NULL UNIQUE REFERENCES kb.safety_incidents(id),
  method text NOT NULL DEFAULT '5_neden' CHECK (method IN ('5_neden', 'balik_kilcigi', 'hfmea')),
  findings text,
  owner text NOT NULL,
  due_at date NOT NULL,
  closed_at timestamptz
);
COMMENT ON TABLE kb.rca_cases IS 'Kök neden analizi.';

CREATE TABLE kb.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  origin text NOT NULL CHECK (origin IN ('rca', 'audit', 'indicator', 'complaint', 'drill', 'access_review', 'breach')),
  origin_id uuid NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 500),
  owner text NOT NULL,
  due_at date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  done_at timestamptz,
  CHECK ((status = 'done') = (done_at IS NOT NULL))
);
COMMENT ON TABLE kb.action_items IS 'Düzeltici/önleyici faaliyetler (DÖF): kök neden, denetim, gösterge, şikâyet, tatbikat ve ihlal kaynaklı.';
CREATE INDEX action_items_open ON kb.action_items (tenant_id, due_at) WHERE status = 'open';

CREATE TABLE kb.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('yuz_yuze', 'telefon', 'web', 'eposta', 'resmi_kanal')),
  official_ref text,
  summary text NOT NULL CHECK (length(summary) BETWEEN 10 AND 1000),
  received_at timestamptz NOT NULL DEFAULT now(),
  first_response_due timestamptz NOT NULL,
  responded_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'unit_review', 'board', 'answered', 'closed')),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  CHECK (first_response_due > received_at)
);
COMMENT ON TABLE kb.complaints IS 'Şikâyet iç takibi. SABİM/CİMER gibi resmî kanalların yerine geçmez; resmî referans numarası yalnız not edilir.';

CREATE TABLE kb.quality_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9._-]{2,30}$'),
  name text NOT NULL,
  unit_of_measure text NOT NULL CHECK (unit_of_measure IN ('oran', 'dakika', 'sayi', 'yuzde')),
  direction text NOT NULL CHECK (direction IN ('artmali', 'azalmali')),
  target numeric,
  threshold numeric,
  UNIQUE (tenant_id, code)
);
COMMENT ON TABLE kb.quality_indicators IS 'Kalite göstergesi tanımı (ör. yatak hazırlama süresi, ilk vaka gecikmesi).';

CREATE TABLE kb.indicator_measurements (
  indicator_id uuid NOT NULL REFERENCES kb.quality_indicators(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  unit_id uuid,
  period date NOT NULL,
  value numeric NOT NULL,
  sample_size integer NOT NULL CHECK (sample_size >= 0),
  UNIQUE NULLS NOT DISTINCT (indicator_id, period, unit_id)
);
COMMENT ON TABLE kb.indicator_measurements IS 'Gösterge ölçümleri (dönem bazında). Küçük örneklemler raporda bastırılır.';

CREATE TABLE kb.internal_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  scope text NOT NULL,
  standard_ref text,
  planned_at date NOT NULL,
  performed_at date,
  auditor text NOT NULL,
  result text CHECK (result IN ('uygun', 'minor_bulgu', 'major_bulgu'))
);
COMMENT ON TABLE kb.internal_audits IS 'İç denetim kaydı (kalite/bilgi güvenliği).';

CREATE TABLE kb.drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  scenario text NOT NULL CHECK (scenario IN ('kitlesel_yaralanma', 'yangin', 'elektrik', 'hbys_kesinti', 'siber_olay', 'salgin', 'tahliye', 'yedekten_donus')),
  planned_at timestamptz NOT NULL,
  performed_at timestamptz,
  findings text,
  rto_minutes_measured integer CHECK (rto_minutes_measured >= 0),
  rpo_minutes_measured integer CHECK (rpo_minutes_measured >= 0)
);
COMMENT ON TABLE kb.drills IS 'Tatbikat planı ve sonucu (yedekten dönüş tatbikatında ölçülen RTO/RPO dahil).';
