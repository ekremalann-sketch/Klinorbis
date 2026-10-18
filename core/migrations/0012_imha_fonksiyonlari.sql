-- 0012 · Kasa imhası: uygulama rolü kasaya yazamaz; süresi dolan kimlikler yalnız bu fonksiyonla anonimleştirilir.
-- Şifreli kimlik silinir, kör indeks rastgele değerle değiştirilir; belirteç operasyon kayıtlarında kalır ama
-- artık hiçbir kişiye çözülemez. Yasal saklama altındaki belirteçlere dokunulmaz.
CREATE OR REPLACE FUNCTION kvkk.dispose_identities(p_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, kb, vault, kvkk AS $$
DECLARE n integer;
BEGIN
  IF kb.current_tenant() IS NULL THEN RAISE EXCEPTION 'Kurum bağlamı yok' USING ERRCODE = 'insufficient_privilege'; END IF;
  UPDATE vault.identities i
     SET identity_ciphertext = '\x00'::bytea, national_id_bidx = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), anonymized_at = now()
   WHERE i.tenant_id = kb.current_tenant() AND i.anonymized_at IS NULL AND i.created_at < p_before
     AND NOT EXISTS (SELECT 1 FROM kvkk.legal_holds h WHERE h.tenant_id = i.tenant_id AND h.released_at IS NULL AND (h.target = 'vault.identities' AND (h.subject_ref IS NULL OR h.subject_ref = i.token)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION kvkk.dispose_identities(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kvkk.dispose_identities(timestamptz) TO kb_app;
GRANT DELETE ON kb.task_events, kb.inbound_messages, kb.outbound_messages, kb.cold_chain_readings TO kb_app;

-- Köprü yatak temizliği işini de açabilir.
GRANT SELECT, INSERT ON kb.cleaning_jobs TO kb_bridge;
GRANT UPDATE (status, attempts, error_code, processed_at) ON kb.inbound_messages TO kb_bridge;
-- Durum geçişi tetikleyicileri çağıranın yetkisiyle çalışır: köprü geçiş tablolarını okuyabilmeli ve görev olayı yazabilmeli.
GRANT SELECT ON kb.bed_transitions, kb.task_transitions TO kb_bridge;
GRANT INSERT ON kb.task_events TO kb_bridge;
