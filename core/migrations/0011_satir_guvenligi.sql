-- 0011 · Satır düzeyi güvenlik (RLS) ve yetkiler
-- Kural: her kurum tablosunda tenant_id = oturumdaki kurum. Birim kapsamlı tablolarda ayrıca birim kapsamı.
-- FORCE ROW LEVEL SECURITY: tablo sahibi dışındaki herkes için zorunlu. Uygulama rolleri süper kullanıcı değildir.
DO $$
DECLARE t text;
  tenant_tables text[] := ARRAY[
    'kb.campuses','kb.buildings','kb.floors','kb.units','kb.rooms','kb.beds','kb.staff','kb.staff_roles','kb.unit_memberships',
    'kb.mfa_credentials','kb.sessions','kb.break_glass_sessions','kb.access_reviews','kb.access_review_items','kb.api_clients',
    'kb.playbooks','kb.playbook_versions','kb.runs','kb.task_events','kb.target_policies','kb.notifications','kb.notification_preferences',
    'kb.shifts','kb.shift_handoffs','kb.encounter_moves','kb.discharge_plans','kb.transport_requests','kb.cleaning_jobs',
    'kb.assets','kb.maintenance_plans','kb.maintenance_records','kb.device_failures','kb.facility_requests','kb.facility_alarms',
    'kb.stock_alerts','kb.cold_chain_readings','kb.rca_cases','kb.action_items','kb.complaints','kb.quality_indicators',
    'kb.indicator_measurements','kb.internal_audits','kb.drills','kb.message_templates','kb.contact_preferences','kb.outbound_messages',
    'kb.integration_endpoints','kb.inbound_messages','kb.idempotency_keys',
    'kvkk.processing_activities','kvkk.privacy_notices','kvkk.notice_deliveries','kvkk.consents','kvkk.data_subject_requests',
    'kvkk.breach_incidents','kvkk.breach_events','kvkk.processors','kvkk.cross_border_transfers','kvkk.retention_policies',
    'kvkk.legal_holds','kvkk.disposal_runs'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = kb.current_tenant()) WITH CHECK (tenant_id = kb.current_tenant())', t);
  END LOOP;
END $$;

-- Kurum tablosu: yalnız kendi kurumu (grup yöneticisi için alt kurumlar uygulama katmanında ayrı oturumla okunur).
ALTER TABLE kb.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON kb.tenants USING (id = kb.current_tenant());

-- Birim kapsamlı tablolar: kurum + birim kapsamı.
ALTER TABLE kb.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY task_scope ON kb.tasks USING (tenant_id = kb.current_tenant() AND kb.can_see_unit(unit_id)) WITH CHECK (tenant_id = kb.current_tenant() AND kb.can_see_unit(unit_id));

ALTER TABLE kb.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.encounters FORCE ROW LEVEL SECURITY;
CREATE POLICY encounter_scope ON kb.encounters USING (tenant_id = kb.current_tenant() AND kb.can_see_unit(unit_id)) WITH CHECK (tenant_id = kb.current_tenant() AND kb.can_see_unit(unit_id));

ALTER TABLE kb.safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.safety_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_scope ON kb.safety_incidents USING (tenant_id = kb.current_tenant() AND kb.can_see_unit(unit_id)) WITH CHECK (tenant_id = kb.current_tenant());

-- Kasa ve denetim: uygulama rolü kasayı doğrudan okuyamaz; denetim tablolarına yalnız ekleyebilir.
ALTER TABLE vault.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.identities FORCE ROW LEVEL SECURITY;
CREATE POLICY vault_none ON vault.identities USING (false);
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_read ON audit.events FOR SELECT USING (tenant_id = kb.current_tenant());
CREATE POLICY audit_tenant_insert ON audit.events FOR INSERT WITH CHECK (tenant_id = kb.current_tenant());
ALTER TABLE audit.access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY access_tenant_read ON audit.access_log FOR SELECT USING (tenant_id = kb.current_tenant());
CREATE POLICY access_tenant_insert ON audit.access_log FOR INSERT WITH CHECK (tenant_id = kb.current_tenant());

-- Yetkiler
GRANT SELECT ON ALL TABLES IN SCHEMA kb TO kb_app;
GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA kb TO kb_app;
GRANT DELETE ON kb.notifications, kb.sessions, kb.idempotency_keys, kb.notification_preferences TO kb_app;
REVOKE INSERT, UPDATE ON kb.tenants, kb.roles, kb.permissions, kb.role_permissions, kb.bed_transitions, kb.task_transitions FROM kb_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA kvkk TO kb_app;
REVOKE INSERT, UPDATE ON kvkk.legal_bases FROM kb_app;
GRANT INSERT, SELECT ON audit.events, audit.access_log, audit.security_events TO kb_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA kb, kvkk, audit TO kb_app;

GRANT SELECT ON kb.units, kb.beds, kb.rooms, kb.campuses, kb.integration_endpoints TO kb_bridge;
GRANT SELECT, INSERT, UPDATE ON kb.encounters, kb.encounter_moves, kb.inbound_messages, kb.tasks, kb.facility_alarms TO kb_bridge;
GRANT UPDATE (status, status_since, updated_at, version) ON kb.beds TO kb_bridge;
GRANT INSERT ON audit.events TO kb_bridge;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA kb, audit TO kb_bridge;

GRANT SELECT ON audit.events, audit.access_log, audit.security_events, audit.row_history, audit.checkpoints TO kb_auditor;
GRANT SELECT ON kvkk.data_subject_requests, kvkk.breach_incidents, kvkk.disposal_runs, kvkk.retention_policies TO kb_auditor;

-- Raporlama rolü kişi düzeyi tabloları okuyamaz; yalnız kurum bağlamıyla filtrelenen toplu fonksiyonları çağırır.
-- Küçük sayılar (5'ten az) bastırılır (yeniden kimliklendirme riskine karşı).
CREATE OR REPLACE FUNCTION kb.report_bed_summary()
RETURNS TABLE (unit_id uuid, available bigint, occupied bigint, cleaning bigint, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, kb AS $$
  SELECT b.unit_id, count(*) FILTER (WHERE b.status = 'available'), count(*) FILTER (WHERE b.status = 'occupied'),
         count(*) FILTER (WHERE b.status = 'cleaning'), count(*)
  FROM kb.beds b WHERE b.tenant_id = kb.current_tenant() GROUP BY b.unit_id
$$;
CREATE OR REPLACE FUNCTION kb.report_task_delays(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (unit_id uuid, tasks bigint, late_tasks bigint, avg_minutes numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, kb AS $$
  SELECT t.unit_id, count(*),
         CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE t.completed_at > t.due_at) END,
         CASE WHEN count(*) < 5 THEN NULL ELSE round(avg(extract(epoch FROM (t.completed_at - t.created_at)) / 60)::numeric, 1) END
  FROM kb.tasks t WHERE t.tenant_id = kb.current_tenant() AND t.created_at >= p_from AND t.created_at < p_to GROUP BY t.unit_id
$$;
REVOKE ALL ON FUNCTION kb.report_bed_summary(), kb.report_task_delays(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb.report_bed_summary(), kb.report_task_delays(timestamptz, timestamptz) TO kb_reporting, kb_app;

-- Sonraki migrasyonlarda açılan tablolar için varsayılan yetkiler (RLS politikası yine her tabloda ayrıca yazılır).
ALTER DEFAULT PRIVILEGES IN SCHEMA kb GRANT SELECT, INSERT, UPDATE ON TABLES TO kb_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kvkk GRANT SELECT, INSERT, UPDATE ON TABLES TO kb_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kb, kvkk, audit GRANT USAGE ON SEQUENCES TO kb_app;
