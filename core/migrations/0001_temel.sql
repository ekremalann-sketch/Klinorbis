-- Klinorbis Türkiye çekirdeği · 0001 · şemalar, roller, oturum bağlamı yardımcıları
-- Bu veritabanı yalnız Türkiye'de (hastane içi veya Türkiye'deki veri merkezi) çalışır (ADR-001).
-- Şemalar:
--   kb    : kurum, yer, personel, operasyon (takma adlı)
--   vault : kimliğe geri dönüş verisi (şifreli); yalnız denetlenen fonksiyonla erişilir
--   audit : yalnız eklenebilir denetim ve erişim kayıtları
--   kvkk  : kişisel veri envanteri, başvurular, ihlaller, saklama-imha

CREATE SCHEMA IF NOT EXISTS kb;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS kvkk;

-- Roller: uygulama süper kullanıcıyla bağlanmaz; satır güvenliği (RLS) zorunlu uygulanır.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_app') THEN CREATE ROLE kb_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_bridge') THEN CREATE ROLE kb_bridge NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_auditor') THEN CREATE ROLE kb_auditor NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_reporting') THEN CREATE ROLE kb_reporting NOLOGIN; END IF;
END $$;

REVOKE ALL ON SCHEMA vault FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT USAGE ON SCHEMA kb, kvkk TO kb_app, kb_bridge, kb_auditor, kb_reporting;
GRANT USAGE ON SCHEMA audit TO kb_app, kb_bridge, kb_auditor;

-- Oturum bağlamı: uygulama her işlemde SET LOCAL ile kurum, kullanıcı ve birim kapsamını verir.
CREATE OR REPLACE FUNCTION kb.current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION kb.current_actor() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.actor', true), ''), 'sistem') $$;
CREATE OR REPLACE FUNCTION kb.all_units() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.all_units', true), '') = 'on' $$;
CREATE OR REPLACE FUNCTION kb.unit_scope() RETURNS uuid[] LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.unit_ids', true), '')::uuid[], '{}'::uuid[]) $$;
CREATE OR REPLACE FUNCTION kb.can_see_unit(u uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT kb.all_units() OR u = ANY (kb.unit_scope()) $$;

-- Genel güncelleme zamanı ve sürüm (iyimser kilit) tetikleyicisi.
CREATE OR REPLACE FUNCTION kb.touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'version alanı elle değiştirilemez' USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$;

-- Türkçe karakterli kısa kod denetimi (birim, yerleşke kodları).
CREATE OR REPLACE FUNCTION kb.is_code(v text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$ SELECT v ~ '^[A-Z0-9][A-Z0-9_-]{1,23}$' $$;
