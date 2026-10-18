-- 0003 · Personel, rol, yetki, birim üyeliği, kimlik doğrulama, acil erişim, erişim gözden geçirme
CREATE TABLE kb.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  external_subject text NOT NULL CHECK (length(external_subject) BETWEEN 3 AND 200),
  display_label text NOT NULL CHECK (length(display_label) BETWEEN 2 AND 80),
  email_hash text CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, external_subject),
  UNIQUE (tenant_id, id),
  CHECK (active OR deactivated_at IS NOT NULL)
);
COMMENT ON TABLE kb.staff IS 'Personel hesabı. Kimlik hastanenin kimlik sağlayıcısından (OIDC/SAML subject) gelir; e-posta yalnız karma olarak tutulur.';

CREATE TABLE kb.roles (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]{3,40}$'),
  label text NOT NULL,
  oversight boolean NOT NULL DEFAULT false,
  requires_mfa boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE kb.roles IS 'Sistem rolleri. Gözetim rolleri (KVKK, güvenlik) operasyon kaydını değiştiremez.';
INSERT INTO kb.roles VALUES
  ('operations_manager', 'Operasyon yöneticisi', false, true),
  ('unit_manager', 'Birim sorumlusu', false, true),
  ('clinician', 'Hekim / klinik rol', false, true),
  ('staff', 'Birim görevlisi', false, true),
  ('call_agent', 'Çağrı merkezi görevlisi', false, true),
  ('privacy_officer', 'KVKK sorumlusu', true, true),
  ('security_officer', 'Bilgi güvenliği sorumlusu', true, true),
  ('group_manager', 'Hastane grubu yöneticisi', false, true);

CREATE TABLE kb.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z]+(\.[a-z_]+)+$'),
  label text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE kb.permissions IS 'İnce taneli yetki kataloğu (RBAC+ABAC).';
INSERT INTO kb.permissions VALUES
  ('task.read', 'Görev görüntüleme', false), ('task.write', 'Görev işlem', false), ('task.assign', 'Görev atama', false),
  ('run.start', 'Akış başlatma', false), ('run.approve', 'Onay adımı', true), ('bed.update', 'Yatak durumu', false),
  ('patient.reidentify', 'Kimliğe geri dönüş (gerekçeli)', true), ('export.unmasked', 'Maskesiz dışa aktarma', true),
  ('kvkk.manage', 'KVKK süreçleri', true), ('security.manage', 'Güvenlik yönetimi', true), ('admin.staff', 'Personel yönetimi', true),
  ('report.read', 'Rapor görüntüleme', false), ('incident.report', 'Olay bildirimi', false), ('asset.manage', 'Cihaz/varlık', false);

CREATE TABLE kb.role_permissions (
  role_code text NOT NULL REFERENCES kb.roles(code),
  permission_code text NOT NULL REFERENCES kb.permissions(code),
  PRIMARY KEY (role_code, permission_code)
);
COMMENT ON TABLE kb.role_permissions IS 'Rol → yetki eşlemesi.';
INSERT INTO kb.role_permissions SELECT 'operations_manager', code FROM kb.permissions WHERE code NOT IN ('kvkk.manage', 'security.manage', 'patient.reidentify');
INSERT INTO kb.role_permissions VALUES
  ('unit_manager', 'task.read'), ('unit_manager', 'task.write'), ('unit_manager', 'task.assign'), ('unit_manager', 'run.start'), ('unit_manager', 'run.approve'), ('unit_manager', 'bed.update'), ('unit_manager', 'report.read'), ('unit_manager', 'incident.report'),
  ('clinician', 'task.read'), ('clinician', 'task.write'), ('clinician', 'run.approve'), ('clinician', 'incident.report'), ('clinician', 'patient.reidentify'),
  ('staff', 'task.read'), ('staff', 'task.write'), ('staff', 'bed.update'), ('staff', 'incident.report'),
  ('call_agent', 'task.read'), ('call_agent', 'task.write'), ('call_agent', 'incident.report'),
  ('privacy_officer', 'kvkk.manage'), ('privacy_officer', 'report.read'),
  ('security_officer', 'security.manage'), ('security_officer', 'report.read'),
  ('group_manager', 'report.read');

CREATE TABLE kb.staff_roles (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  role_code text NOT NULL REFERENCES kb.roles(code),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (staff_id, role_code),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE,
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);
COMMENT ON TABLE kb.staff_roles IS 'Personel rolleri; süreli rol verilebilir.';

CREATE TABLE kb.unit_memberships (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  unit_role text NOT NULL DEFAULT 'member' CHECK (unit_role IN ('member', 'manager', 'deputy')),
  active boolean NOT NULL DEFAULT true,
  since timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, unit_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id)
);
COMMENT ON TABLE kb.unit_memberships IS 'Personelin çalıştığı birimler; kayıt kapsamı (RLS) bu listeden kurulur.';
CREATE INDEX unit_memberships_unit ON kb.unit_memberships (tenant_id, unit_id) WHERE active;

CREATE TABLE kb.mfa_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('webauthn', 'totp')),
  credential_id text,
  public_key text,
  secret_ciphertext bytea,
  label text NOT NULL DEFAULT 'Cihaz',
  sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE,
  CHECK ((kind = 'webauthn' AND credential_id IS NOT NULL AND public_key IS NOT NULL AND secret_ciphertext IS NULL)
      OR (kind = 'totp' AND secret_ciphertext IS NOT NULL AND credential_id IS NULL)),
  UNIQUE (credential_id)
);
COMMENT ON TABLE kb.mfa_credentials IS 'Çok faktörlü doğrulama: passkey (WebAuthn açık anahtarı) veya TOTP (gizli anahtar yalnız şifreli).';

CREATE TABLE kb.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  mfa_level text NOT NULL CHECK (mfa_level IN ('none', 'otp', 'phishing_resistant')),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '12 hours')
);
COMMENT ON TABLE kb.sessions IS 'Oturumlar: yalnız belirteç karması tutulur; en fazla 12 saat; uzaktan kapatılabilir.';
CREATE INDEX sessions_staff_active ON kb.sessions (staff_id) WHERE revoked_at IS NULL;

CREATE TABLE kb.break_glass_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  unit_id uuid,
  reason text NOT NULL CHECK (length(reason) BETWEEN 15 AND 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  review_outcome text CHECK (review_outcome IN ('uygun', 'uygunsuz', 'egitim_gerekli')),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES kb.units(tenant_id, id),
  CHECK (expires_at > started_at AND expires_at <= started_at + interval '4 hours'),
  CHECK ((reviewed_at IS NULL) = (review_outcome IS NULL))
);
COMMENT ON TABLE kb.break_glass_sessions IS 'Acil erişim: gerekçe zorunlu, en fazla 4 saat; sonradan yönetici incelemesi yapılır.';

CREATE TABLE kb.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  completed_by text,
  completed_at timestamptz,
  CHECK (period_end > period_start),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
COMMENT ON TABLE kb.access_reviews IS 'Dönemsel (90 günlük) erişim gözden geçirme turu.';

CREATE TABLE kb.access_review_items (
  review_id uuid NOT NULL REFERENCES kb.access_reviews(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  decision text CHECK (decision IN ('devam', 'kaldir', 'degistir')),
  decided_by text,
  decided_at timestamptz,
  PRIMARY KEY (review_id, staff_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES kb.staff(tenant_id, id),
  CHECK ((decision IS NULL) = (decided_at IS NULL))
);
COMMENT ON TABLE kb.access_review_items IS 'Gözden geçirmede her kişi için karar.';

CREATE TABLE kb.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bridge', 'reporting', 'sms_callback')),
  key_id text NOT NULL UNIQUE CHECK (key_id ~ '^[a-z0-9-]{6,40}$'),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  allowed_cidrs text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE kb.api_clients IS 'Makine istemcileri (hastane köprüsü vb.). Gizli anahtarın yalnız karması tutulur; rotasyon tarihi izlenir.';

CREATE TRIGGER staff_touch BEFORE UPDATE ON kb.staff FOR EACH ROW EXECUTE FUNCTION kb.touch_row();

-- Yetki sorgusu: kişinin rolleri üzerinden yetkisi var mı (süresi dolmuş roller hariç).
CREATE OR REPLACE FUNCTION kb.has_permission(p_staff uuid, p_perm text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM kb.staff_roles sr JOIN kb.role_permissions rp ON rp.role_code = sr.role_code
    JOIN kb.staff s ON s.id = sr.staff_id AND s.active
    WHERE sr.staff_id = p_staff AND rp.permission_code = p_perm AND (sr.expires_at IS NULL OR sr.expires_at > now()))
$$;
