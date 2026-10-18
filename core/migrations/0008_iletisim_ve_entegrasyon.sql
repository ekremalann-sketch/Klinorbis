-- 0008 · Hasta iletişimi (İYS ayrımı), entegrasyon uç noktaları, gelen mesajlar, ölü mektup, tekrar koruması
CREATE TABLE kb.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{3,40}$'),
  purpose text NOT NULL CHECK (purpose IN ('bilgilendirme', 'ticari')),
  channel text NOT NULL CHECK (channel IN ('sms', 'eposta', 'push')),
  body text NOT NULL CHECK (length(body) BETWEEN 5 AND 612),
  version integer NOT NULL DEFAULT 1,
  approved_by text,
  active boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, code, version),
  CHECK (NOT active OR approved_by IS NOT NULL),
  CHECK (purpose <> 'ticari' OR NOT active)
);
COMMENT ON TABLE kb.message_templates IS 'Mesaj şablonları. Ticari (tanıtım) şablon etkinleştirilemez (6563/İYS doğrulaması tamamlanana kadar kapalı); bilgilendirme şablonu onaylanmadan kullanılmaz.';

CREATE TABLE kb.contact_preferences (
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  patient_token text NOT NULL CHECK (patient_token ~ '^P-[0-9A-F]{4,16}$'),
  channel text NOT NULL CHECK (channel IN ('sms', 'eposta')),
  contact_ref text NOT NULL,
  legal_basis text NOT NULL CHECK (legal_basis IN ('sozlesme_ifasi', 'hukuki_yukumluluk', 'acik_riza')),
  consent_id uuid,
  opted_out_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, patient_token, channel),
  CHECK (legal_basis <> 'acik_riza' OR consent_id IS NOT NULL)
);
COMMENT ON TABLE kb.contact_preferences IS 'İletişim tercihi. İletişim bilgisi doğrudan tutulmaz; contact_ref kasadaki şifreli kayda işaret eder. Hukuki sebep ayrı alan.';

CREATE TABLE kb.outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  patient_token text NOT NULL,
  template_id uuid NOT NULL REFERENCES kb.message_templates(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'held_quiet_hours', 'sent', 'delivered', 'failed', 'cancelled', 'fallback_task')),
  send_after timestamptz NOT NULL DEFAULT now(),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  provider_ref text,
  last_error text CHECK (length(last_error) <= 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);
COMMENT ON TABLE kb.outbound_messages IS 'Giden mesaj kuyruğu: sessiz saatte bekletilir, en fazla 5 deneme; başarısızlıkta çağrı merkezine görev (fallback_task).';
CREATE INDEX outbound_due ON kb.outbound_messages (tenant_id, send_after) WHERE status IN ('queued', 'held_quiet_hours');

CREATE TABLE kb.integration_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  kind text NOT NULL CHECK (kind IN ('hl7v2_mllp', 'fhir_r4', 'db_view', 'bms', 'pbx', 'sms_provider')),
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  writes_to_his boolean NOT NULL DEFAULT false CHECK (NOT writes_to_his),
  api_client_id uuid REFERENCES kb.api_clients(id),
  active boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_error_at timestamptz
);
COMMENT ON TABLE kb.integration_endpoints IS 'Entegrasyon uç noktaları. HBYS''ye yazan uç nokta tanımlanamaz (writes_to_his her zaman false; kapsam dışı).';

CREATE TABLE kb.inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES kb.tenants(id),
  endpoint_id uuid REFERENCES kb.integration_endpoints(id),
  message_type text NOT NULL CHECK (message_type ~ '^[A-Z0-9_^.-]{2,40}$'),
  control_id text NOT NULL CHECK (length(control_id) BETWEEN 1 AND 80),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed', 'dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (tenant_id, endpoint_id, control_id)
);
COMMENT ON TABLE kb.inbound_messages IS 'Köprüden gelen mesajların izi. Ham mesaj (kimlik içerir) saklanmaz; yalnız karma ve kontrol numarası. Aynı kontrol numarası ikinci kez işlenmez.';
CREATE INDEX inbound_status ON kb.inbound_messages (tenant_id, status, received_at);

CREATE TABLE kb.idempotency_keys (
  tenant_id uuid NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 8 AND 120),
  request_hash text NOT NULL,
  response_status smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, key),
  CHECK (expires_at > created_at)
);
COMMENT ON TABLE kb.idempotency_keys IS 'Aynı isteğin iki kez uygulanmasını önleyen anahtarlar (süreli).';

-- Köprü, kimliği kasaya yalnız bu fonksiyonla yazar (tablolara doğrudan yetkisi yoktur).
CREATE OR REPLACE FUNCTION kb.register_identity(p_token text, p_bidx text, p_ciphertext bytea, p_key_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, kb, vault AS $$
DECLARE existing text;
BEGIN
  IF kb.current_tenant() IS NULL THEN RAISE EXCEPTION 'Kurum bağlamı yok' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT token INTO existing FROM vault.identities WHERE tenant_id = kb.current_tenant() AND national_id_bidx = p_bidx;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  INSERT INTO vault.identities (token, tenant_id, national_id_bidx, identity_ciphertext, key_version)
    VALUES (p_token, kb.current_tenant(), p_bidx, p_ciphertext, p_key_version);
  RETURN p_token;
END $$;
REVOKE ALL ON FUNCTION kb.register_identity(text, text, bytea, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb.register_identity(text, text, bytea, integer) TO kb_bridge;
