-- 0010 · Denetim izi (yalnız eklenebilir, karma zinciri), satır geçmişi, hasta kaydı erişim günlüğü, güvenlik olayları,
-- imzalı kontrol noktaları. UPDATE/DELETE tetikleyiciyle reddedilir; uygulama rolünün bu yetkileri yoktur.
CREATE TABLE audit.events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor text NOT NULL,
  action text NOT NULL CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  resource text NOT NULL,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'denied', 'error')),
  detail text CHECK (length(detail) <= 500),
  prev_hash text NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);
CREATE TABLE audit.events_default PARTITION OF audit.events DEFAULT;
CREATE INDEX audit_events_tenant_time ON audit.events (tenant_id, at DESC);
COMMENT ON TABLE audit.events IS 'Denetim izi: her satır bir öncekinin karmasını içerir (kurum başına zincir). Ay bazında bölümlenebilir; satır değiştirilemez veya silinemez.';

CREATE TABLE audit.chain_heads (
  tenant_id uuid PRIMARY KEY,
  last_id bigint NOT NULL,
  last_hash text NOT NULL
);
COMMENT ON TABLE audit.chain_heads IS 'Kurum başına zincirin son halkası (eşzamanlı yazımda sıralamayı garanti eder).';

CREATE OR REPLACE FUNCTION audit.chain_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE head audit.chain_heads%ROWTYPE;
BEGIN
  SELECT * INTO head FROM audit.chain_heads WHERE tenant_id = NEW.tenant_id FOR UPDATE;
  NEW.prev_hash := coalesce(head.last_hash, 'GENESIS');
  NEW.hash := encode(sha256(convert_to(concat_ws('|', NEW.prev_hash, NEW.tenant_id::text, to_char(NEW.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), NEW.actor, NEW.action, NEW.resource, NEW.result, coalesce(NEW.detail, '')), 'UTF8')), 'hex');
  INSERT INTO audit.chain_heads AS h (tenant_id, last_id, last_hash) VALUES (NEW.tenant_id, NEW.id, NEW.hash)
    ON CONFLICT (tenant_id) DO UPDATE SET last_id = EXCLUDED.last_id, last_hash = EXCLUDED.last_hash;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.chain_event();

CREATE OR REPLACE FUNCTION audit.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Denetim kaydı değiştirilemez veya silinemez (%.%)', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.reject_change();

-- Zinciri doğrula: ilk bozuk satırın kimliğini döndürür (NULL = sağlam).
CREATE OR REPLACE FUNCTION audit.verify_chain(p_tenant uuid) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE r record; expected text := 'GENESIS'; h text;
BEGIN
  FOR r IN SELECT * FROM audit.events WHERE tenant_id = p_tenant ORDER BY id LOOP
    IF r.prev_hash <> expected THEN RETURN r.id; END IF;
    h := encode(sha256(convert_to(concat_ws('|', r.prev_hash, r.tenant_id::text, to_char(r.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), r.actor, r.action, r.resource, r.result, coalesce(r.detail, '')), 'UTF8')), 'hex');
    IF h <> r.hash THEN RETURN r.id; END IF;
    expected := r.hash;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TABLE audit.checkpoints (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  last_event_id bigint NOT NULL,
  last_hash text NOT NULL,
  signature text NOT NULL,
  key_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER audit_checkpoints_immutable BEFORE UPDATE OR DELETE ON audit.checkpoints FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
COMMENT ON TABLE audit.checkpoints IS 'Zincir başının dönemsel imzası (HMAC/HSM). Dış ortama kopyalanarak geriye dönük değişiklik tespit edilir.';

CREATE TABLE audit.row_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  table_name text NOT NULL,
  row_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX row_history_lookup ON audit.row_history (table_name, row_id, at);
CREATE TRIGGER row_history_immutable BEFORE UPDATE OR DELETE ON audit.row_history FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
COMMENT ON TABLE audit.row_history IS 'Zamansal geçmiş: önemli tablolarda her değişikliğin eski ve yeni hâli (kim, ne zaman).';

CREATE OR REPLACE FUNCTION audit.track_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit, kb AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  o := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  n := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  INSERT INTO audit.row_history (tenant_id, table_name, row_id, op, old_row, new_row, actor)
  VALUES (coalesce((n ->> 'tenant_id')::uuid, (o ->> 'tenant_id')::uuid), TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, coalesce(n ->> 'id', o ->> 'id', n ->> 'staff_id', o ->> 'staff_id', (coalesce(n, o) ->> 'playbook_id') || ':' || (coalesce(n, o) ->> 'version'), md5(coalesce(n, o)::text)), TG_OP, o, n, kb.current_actor());
  RETURN NULL;
END $$;
CREATE TRIGGER beds_history AFTER INSERT OR UPDATE OR DELETE ON kb.beds FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER staff_history AFTER INSERT OR UPDATE OR DELETE ON kb.staff FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER staff_roles_history AFTER INSERT OR UPDATE OR DELETE ON kb.staff_roles FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER memberships_history AFTER INSERT OR UPDATE OR DELETE ON kb.unit_memberships FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER runs_history AFTER INSERT OR UPDATE OR DELETE ON kb.runs FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER encounters_history AFTER INSERT OR UPDATE OR DELETE ON kb.encounters FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER retention_history AFTER INSERT OR UPDATE OR DELETE ON kvkk.retention_policies FOR EACH ROW EXECUTE FUNCTION audit.track_history();
CREATE TRIGGER pv_history AFTER INSERT OR UPDATE OR DELETE ON kb.playbook_versions FOR EACH ROW EXECUTE FUNCTION audit.track_history();

CREATE TABLE audit.access_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  actor text NOT NULL,
  patient_token text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('gorev', 'onay', 'rapor', 'kvkk_basvuru', 'acil_erisim')),
  resource text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);
CREATE TABLE audit.access_log_default PARTITION OF audit.access_log DEFAULT;
CREATE INDEX access_log_patient ON audit.access_log (tenant_id, patient_token, at DESC);
CREATE TRIGGER access_log_immutable BEFORE UPDATE OR DELETE ON audit.access_log FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
COMMENT ON TABLE audit.access_log IS 'Hasta belirtecine kim, hangi amaçla, ne zaman eriştiği (ilgili kişi başvurusunda erişim listesi hazırlanır).';

CREATE TABLE audit.security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  kind text NOT NULL CHECK (kind IN ('login_ok', 'login_failed', 'mfa_failed', 'permission_denied', 'rate_limited', 'break_glass', 'export', 'bulk_read', 'off_hours_access', 'key_rotation', 'config_change', 'integration_auth_failed')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  actor_hash text,
  ip_hash text,
  detail text CHECK (length(detail) <= 300),
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER security_events_immutable BEFORE UPDATE OR DELETE ON audit.security_events FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE INDEX security_events_time ON audit.security_events (at DESC);
COMMENT ON TABLE audit.security_events IS 'Güvenlik olayları (SIEM''e aktarılabilir). Kimlik ve IP yalnız tuzlu karma; içerikte kişisel veri yok.';

-- Aylık bölüm açar (üst tablodaki değiştirilemezlik tetikleyicisi bölümlere kendiliğinden uygulanır).
CREATE OR REPLACE FUNCTION audit.ensure_month_partition(p_table text, p_month date) RETURNS text LANGUAGE plpgsql AS $$
DECLARE name text := p_table || '_' || to_char(p_month, 'YYYYMM'); start_at date := date_trunc('month', p_month)::date;
BEGIN
  IF p_table NOT IN ('events', 'access_log') THEN RAISE EXCEPTION 'Bilinmeyen tablo %', p_table; END IF;
  IF to_regclass('audit.' || name) IS NULL THEN
    EXECUTE format('CREATE TABLE audit.%I PARTITION OF audit.%I FOR VALUES FROM (%L) TO (%L)', name, p_table, start_at, (start_at + interval '1 month')::date);
  END IF;
  RETURN name;
END $$;
