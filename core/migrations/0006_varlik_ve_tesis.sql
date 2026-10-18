-- 0006 · Biyomedikal varlık (CMMS), bakım planı, arıza, tesis talepleri, kritik sistem alarmları, stok ve soğuk zincir uyarıları
CREATE TABLE kb.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[0-9A-Za-z._/-]{2,24}$'),
  category text NOT NULL CHECK (category IN ('tibbi_cihaz', 'goruntuleme', 'laboratuvar', 'tesis', 'bilisim', 'diger')),
  model text,
  uts_number text CHECK (uts_number ~ '^[0-9A-Za-z-]{4,40}$'),
  unit_id uuid,
  criticality text NOT NULL DEFAULT 'orta' CHECK (criticality IN ('dusuk', 'orta', 'yuksek', 'hayati')),
  status text NOT NULL DEFAULT 'in_service' CHECK (status IN ('in_service', 'out_of_service', 'maintenance', 'retired')),
  installed_at date,
  retired_at date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
COMMENT ON TABLE kb.assets IS 'Varlık/cihaz envanteri. ÜTS numarası yalnız kayıt amaçlıdır; ÜTS sistemine bağlanılmaz.';
CREATE TRIGGER assets_touch BEFORE UPDATE ON kb.assets FOR EACH ROW EXECUTE FUNCTION kb.touch_row();

CREATE TABLE kb.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('periyodik_bakim', 'kalibrasyon', 'elektriksel_guvenlik', 'yazilim')),
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 1825),
  next_due date NOT NULL,
  vendor text,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES kb.assets(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (asset_id, kind)
);
COMMENT ON TABLE kb.maintenance_plans IS 'Periyodik bakım ve kalibrasyon takvimi.';
CREATE INDEX maintenance_due ON kb.maintenance_plans (tenant_id, next_due);

CREATE TABLE kb.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  plan_id uuid REFERENCES kb.maintenance_plans(id),
  kind text NOT NULL CHECK (kind IN ('periyodik_bakim', 'kalibrasyon', 'elektriksel_guvenlik', 'yazilim', 'ariza_onarim')),
  result text NOT NULL CHECK (result IN ('uygun', 'uygun_degil', 'kosullu')),
  performed_at timestamptz NOT NULL,
  performed_by text NOT NULL,
  certificate_ref text,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES kb.assets(tenant_id, id)
);
COMMENT ON TABLE kb.maintenance_records IS 'Yapılan bakım/kalibrasyon kayıtları ve sonuç.';

CREATE TABLE kb.device_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  reported_by text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('dusuk', 'orta', 'yuksek')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_repair', 'waiting_parts', 'resolved', 'replaced')),
  run_id uuid REFERENCES kb.runs(id),
  resolved_at timestamptz,
  downtime_minutes integer GENERATED ALWAYS AS (CASE WHEN resolved_at IS NULL THEN NULL ELSE (extract(epoch FROM resolved_at - reported_at) / 60)::integer END) STORED,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES kb.assets(tenant_id, id),
  CHECK ((status IN ('resolved', 'replaced')) = (resolved_at IS NOT NULL)),
  CHECK (resolved_at IS NULL OR resolved_at >= reported_at)
);
COMMENT ON TABLE kb.device_failures IS 'Cihaz arıza kaydı; duruş süresi otomatik hesaplanır.';

CREATE TABLE kb.facility_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  room_id uuid,
  category text NOT NULL CHECK (category IN ('elektrik', 'su', 'iklimlendirme', 'medikal_gaz', 'asansor', 'mobilya', 'diger')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES kb.rooms(tenant_id, id),
  CHECK ((status = 'done') = (done_at IS NOT NULL))
);
COMMENT ON TABLE kb.facility_requests IS 'Tesis/teknik bakım talebi.';

CREATE TABLE kb.facility_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  system text NOT NULL CHECK (system IN ('elektrik', 'jenerator', 'su', 'medikal_gaz', 'iklim', 'yangin', 'asansor')),
  campus_id uuid,
  raised_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  source_event_id text NOT NULL,
  run_id uuid REFERENCES kb.runs(id),
  UNIQUE (tenant_id, source_event_id),
  FOREIGN KEY (tenant_id, campus_id) REFERENCES kb.campuses(tenant_id, id),
  CHECK (cleared_at IS NULL OR cleared_at >= raised_at)
);
COMMENT ON TABLE kb.facility_alarms IS 'Bina yönetim sisteminden gelen kritik alarm; aynı olay iki kez kaydedilmez.';

CREATE TABLE kb.stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  item_code text NOT NULL CHECK (item_code ~ '^[0-9A-Za-z._-]{2,40}$'),
  kind text NOT NULL CHECK (kind IN ('kritik_seviye', 'miad', 'geri_cekme', 'soguk_zincir')),
  level_value numeric,
  threshold numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  raised_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
COMMENT ON TABLE kb.stock_alerts IS 'Stok ve soğuk zincir UYARISI (stok muhasebesi değildir).';

CREATE TABLE kb.cold_chain_readings (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  sensor_code text NOT NULL CHECK (sensor_code ~ '^[0-9A-Za-z._-]{2,40}$'),
  celsius numeric(5,2) NOT NULL CHECK (celsius BETWEEN -90 AND 60),
  measured_at timestamptz NOT NULL,
  PRIMARY KEY (id, measured_at)
) PARTITION BY RANGE (measured_at);
CREATE TABLE kb.cold_chain_readings_default PARTITION OF kb.cold_chain_readings DEFAULT;
COMMENT ON TABLE kb.cold_chain_readings IS 'Sıcaklık sensörü okumaları; zamana göre bölümlenmiş (partition) yüksek hacimli tablo.';
CREATE INDEX cold_chain_sensor_time ON kb.cold_chain_readings (tenant_id, sensor_code, measured_at DESC);
