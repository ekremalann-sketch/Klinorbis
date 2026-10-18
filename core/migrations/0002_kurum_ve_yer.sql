-- 0002 · Kurum (tenant), yerleşke, bina, kat, birim, oda, yatak
CREATE TABLE kb.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (kb.is_code(code)),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind text NOT NULL CHECK (kind IN ('kamu', 'ozel', 'universite', 'grup')),
  parent_id uuid REFERENCES kb.tenants(id),
  deployment text NOT NULL DEFAULT 'tr-core' CHECK (deployment IN ('tr-core', 'on-prem', 'demo')),
  data_residency text NOT NULL DEFAULT 'TR' CHECK (data_residency = 'TR'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CHECK (parent_id IS NULL OR parent_id <> id)
);
COMMENT ON TABLE kb.tenants IS 'Kurum (hastane veya hastane grubu). Her kayıt bir kuruma aittir; veri yerleşimi her zaman TR.';

CREATE TABLE kb.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (kb.is_code(code)),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  city text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);
COMMENT ON TABLE kb.campuses IS 'Yerleşke (kampüs). Bir kurumun birden çok yerleşkesi olabilir.';

CREATE TABLE kb.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  code text NOT NULL CHECK (kb.is_code(code)),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (campus_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, campus_id) REFERENCES kb.campuses(tenant_id, id)
);
COMMENT ON TABLE kb.buildings IS 'Bina. Yabancı anahtar kurum kimliğini de içerir; başka kurumun yerleşkesine bağlanamaz.';

CREATE TABLE kb.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  building_id uuid NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN -10 AND 200),
  label text NOT NULL,
  UNIQUE (building_id, level),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, building_id) REFERENCES kb.buildings(tenant_id, id)
);
COMMENT ON TABLE kb.floors IS 'Kat.';

CREATE TABLE kb.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  code text NOT NULL CHECK (kb.is_code(code)),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('clinical', 'diagnostic', 'operational', 'governance')),
  target_minutes integer NOT NULL DEFAULT 30 CHECK (target_minutes BETWEEN 1 AND 10080),
  sensitive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, campus_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, campus_id) REFERENCES kb.campuses(tenant_id, id)
);
COMMENT ON TABLE kb.units IS 'Birim. sensitive=true birimlerde (ör. psikiyatri, onkoloji) birim adı bile sağlık bilgisi ele verebilir; raporlarda ek maskeleme uygulanır.';

CREATE TABLE kb.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  floor_id uuid,
  code text NOT NULL CHECK (code ~ '^[0-9A-Za-z./-]{1,16}$'),
  isolation_capable boolean NOT NULL DEFAULT false,
  UNIQUE (unit_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  FOREIGN KEY (tenant_id, floor_id) REFERENCES kb.floors(tenant_id, id)
);
COMMENT ON TABLE kb.rooms IS 'Oda.';

CREATE TABLE kb.beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  room_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[0-9A-Za-z./-]{1,16}$'),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'occupied', 'cleaning', 'maintenance', 'blocked')),
  status_since timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (room_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES kb.rooms(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id)
);
COMMENT ON TABLE kb.beds IS 'Yatak ve anlık durumu. Durum geçişleri kb.bed_transitions tablosuyla sınırlandırılır.';
CREATE INDEX beds_unit_status ON kb.beds (tenant_id, unit_id, status);

CREATE TABLE kb.bed_transitions (
  from_status text NOT NULL,
  to_status text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
COMMENT ON TABLE kb.bed_transitions IS 'Yatak durumunun izin verilen geçişleri (ör. occupied → cleaning; occupied → available doğrudan yasak).';
INSERT INTO kb.bed_transitions VALUES
  ('available', 'reserved'), ('available', 'occupied'), ('available', 'maintenance'), ('available', 'blocked'),
  ('reserved', 'occupied'), ('reserved', 'available'),
  ('occupied', 'cleaning'),
  ('cleaning', 'available'), ('cleaning', 'maintenance'),
  ('maintenance', 'cleaning'), ('maintenance', 'available'), ('maintenance', 'blocked'),
  ('blocked', 'available'), ('blocked', 'maintenance');

CREATE OR REPLACE FUNCTION kb.enforce_bed_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM kb.bed_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'Yatak durumu % → % geçişine izin yok', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    NEW.status_since := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER beds_transition BEFORE UPDATE ON kb.beds FOR EACH ROW EXECUTE FUNCTION kb.enforce_bed_transition();

CREATE TRIGGER tenants_touch BEFORE UPDATE ON kb.tenants FOR EACH ROW EXECUTE FUNCTION kb.touch_row();
CREATE TRIGGER campuses_touch BEFORE UPDATE ON kb.campuses FOR EACH ROW EXECUTE FUNCTION kb.touch_row();
CREATE TRIGGER buildings_touch BEFORE UPDATE ON kb.buildings FOR EACH ROW EXECUTE FUNCTION kb.touch_row();
CREATE TRIGGER units_touch BEFORE UPDATE ON kb.units FOR EACH ROW EXECUTE FUNCTION kb.touch_row();
CREATE TRIGGER beds_touch BEFORE UPDATE ON kb.beds FOR EACH ROW EXECUTE FUNCTION kb.touch_row();
