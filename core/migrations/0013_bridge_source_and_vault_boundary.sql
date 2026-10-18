-- Existing migrations remain immutable. Source order and emergency vault access fail closed.
ALTER TABLE kb.encounters ADD COLUMN source_message_at timestamptz;
COMMENT ON COLUMN kb.encounters.source_message_at IS 'Last applied source event time; older events must not overwrite current occupancy.';
CREATE OR REPLACE FUNCTION kb.reidentify(p_token text, p_reason text, p_break_glass uuid DEFAULT NULL)
RETURNS TABLE (identity_ciphertext bytea, key_version integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, kb, vault AS $$
BEGIN
 IF kb.current_tenant() IS NULL THEN RAISE EXCEPTION 'Kurum bağlamı yok' USING ERRCODE='insufficient_privilege'; END IF;
 IF length(coalesce(p_reason,''))<15 THEN RAISE EXCEPTION 'Gerekçe en az 15 karakter olmalı' USING ERRCODE='check_violation'; END IF;
 IF coalesce(current_setting('app.can_reidentify',true),'')<>'on' THEN
  RAISE EXCEPTION 'Kimliğe geri dönüş yetkisi yok; acil erişim arayüzü henüz kapalı' USING ERRCODE='insufficient_privilege';
 END IF;
 INSERT INTO vault.reidentification_log(tenant_id,token,actor,reason,break_glass_id) VALUES(kb.current_tenant(),p_token,kb.current_actor(),p_reason,NULL);
 RETURN QUERY SELECT i.identity_ciphertext,i.key_version FROM vault.identities i WHERE i.token=p_token AND i.tenant_id=kb.current_tenant() AND i.anonymized_at IS NULL;
END $$;
GRANT SELECT, INSERT, UPDATE ON kb.idempotency_keys TO kb_bridge;
