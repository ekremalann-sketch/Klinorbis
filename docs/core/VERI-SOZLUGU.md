# Klinorbis Türkiye çekirdeği · veri sözlüğü

Bu dosya `npm run docs:dictionary` ile migrasyonlardan üretilir; elle düzenlemeyin.

## audit.access_log

Hasta belirtecine kim, hangi amaçla, ne zaman eriştiği (ilgili kişi başvurusunda erişim listesi hazırlanır).

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| actor | text | hayır |
| patient_token | text | hayır |
| purpose | text | hayır |
| resource | text | hayır |
| at | timestamp with time zone | hayır |

## audit.chain_heads

Kurum başına zincirin son halkası (eşzamanlı yazımda sıralamayı garanti eder).

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| last_id | bigint | hayır |
| last_hash | text | hayır |

## audit.checkpoints

Zincir başının dönemsel imzası (HMAC/HSM). Dış ortama kopyalanarak geriye dönük değişiklik tespit edilir.

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| last_event_id | bigint | hayır |
| last_hash | text | hayır |
| signature | text | hayır |
| key_ref | text | hayır |
| created_at | timestamp with time zone | hayır |

## audit.events

Denetim izi: her satır bir öncekinin karmasını içerir (kurum başına zincir). Ay bazında bölümlenebilir; satır değiştirilemez veya silinemez.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| at | timestamp with time zone | hayır |
| actor | text | hayır |
| action | text | hayır |
| resource | text | hayır |
| result | text | hayır |
| detail | text | evet |
| prev_hash | text | hayır |
| hash | text | hayır |

## audit.row_history

Zamansal geçmiş: önemli tablolarda her değişikliğin eski ve yeni hâli (kim, ne zaman).

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | evet |
| table_name | text | hayır |
| row_id | text | hayır |
| op | text | hayır |
| old_row | jsonb | evet |
| new_row | jsonb | evet |
| actor | text | hayır |
| at | timestamp with time zone | hayır |

## audit.security_events

Güvenlik olayları (SIEM'e aktarılabilir). Kimlik ve IP yalnız tuzlu karma; içerikte kişisel veri yok.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | evet |
| kind | text | hayır |
| severity | text | hayır |
| actor_hash | text | evet |
| ip_hash | text | evet |
| detail | text | evet |
| at | timestamp with time zone | hayır |

## kb.access_review_items

Gözden geçirmede her kişi için karar.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| review_id | uuid | hayır |
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| decision | text | evet |
| decided_by | text | evet |
| decided_at | timestamp with time zone | evet |

## kb.access_reviews

Dönemsel (90 günlük) erişim gözden geçirme turu.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| period_start | date | hayır |
| period_end | date | hayır |
| status | text | hayır |
| completed_by | text | evet |
| completed_at | timestamp with time zone | evet |

## kb.action_items

Düzeltici/önleyici faaliyetler (DÖF): kök neden, denetim, gösterge, şikâyet, tatbikat ve ihlal kaynaklı.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| origin | text | hayır |
| origin_id | uuid | hayır |
| description | text | hayır |
| owner | text | hayır |
| due_at | date | hayır |
| status | text | hayır |
| done_at | timestamp with time zone | evet |

## kb.api_clients

Makine istemcileri (hastane köprüsü vb.). Gizli anahtarın yalnız karması tutulur; rotasyon tarihi izlenir.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| name | text | hayır |
| kind | text | hayır |
| key_id | text | hayır |
| secret_hash | text | hayır |
| allowed_cidrs | ARRAY | hayır |
| active | boolean | hayır |
| rotated_at | timestamp with time zone | hayır |
| created_at | timestamp with time zone | hayır |

## kb.assets

Varlık/cihaz envanteri. ÜTS numarası yalnız kayıt amaçlıdır; ÜTS sistemine bağlanılmaz.

Kısıt (CHECK): 6

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| category | text | hayır |
| model | text | evet |
| uts_number | text | evet |
| unit_id | uuid | evet |
| criticality | text | hayır |
| status | text | hayır |
| installed_at | date | evet |
| retired_at | date | evet |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.bed_transitions

Yatak durumunun izin verilen geçişleri (ör. occupied → cleaning; occupied → available doğrudan yasak).

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| from_status | text | hayır |
| to_status | text | hayır |

## kb.beds

Yatak ve anlık durumu. Durum geçişleri kb.bed_transitions tablosuyla sınırlandırılır.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| room_id | uuid | hayır |
| unit_id | uuid | hayır |
| code | text | hayır |
| status | text | hayır |
| status_since | timestamp with time zone | hayır |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.break_glass_sessions

Acil erişim: gerekçe zorunlu, en fazla 4 saat; sonradan yönetici incelemesi yapılır.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| unit_id | uuid | evet |
| reason | text | hayır |
| started_at | timestamp with time zone | hayır |
| expires_at | timestamp with time zone | hayır |
| reviewed_by | text | evet |
| reviewed_at | timestamp with time zone | evet |
| review_outcome | text | evet |

## kb.buildings

Bina. Yabancı anahtar kurum kimliğini de içerir; başka kurumun yerleşkesine bağlanamaz.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| campus_id | uuid | hayır |
| code | text | hayır |
| name | text | hayır |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.campuses

Yerleşke (kampüs). Bir kurumun birden çok yerleşkesi olabilir.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| name | text | hayır |
| city | text | evet |
| active | boolean | hayır |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.cleaning_jobs

Oda/yatak temizlik işi; yatak başına tek açık iş.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| bed_id | uuid | hayır |
| kind | text | hayır |
| status | text | hayır |
| checklist | jsonb | hayır |
| created_at | timestamp with time zone | hayır |
| done_at | timestamp with time zone | evet |
| done_by | text | evet |

## kb.cold_chain_readings

Sıcaklık sensörü okumaları; zamana göre bölümlenmiş (partition) yüksek hacimli tablo.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| sensor_code | text | hayır |
| celsius | numeric | hayır |
| measured_at | timestamp with time zone | hayır |

## kb.complaints

Şikâyet iç takibi. SABİM/CİMER gibi resmî kanalların yerine geçmez; resmî referans numarası yalnız not edilir.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| channel | text | hayır |
| official_ref | text | evet |
| summary | text | hayır |
| received_at | timestamp with time zone | hayır |
| first_response_due | timestamp with time zone | hayır |
| responded_at | timestamp with time zone | evet |
| status | text | hayır |

## kb.contact_preferences

İletişim tercihi. İletişim bilgisi doğrudan tutulmaz; contact_ref kasadaki şifreli kayda işaret eder. Hukuki sebep ayrı alan.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| patient_token | text | hayır |
| channel | text | hayır |
| contact_ref | text | hayır |
| legal_basis | text | hayır |
| consent_id | uuid | evet |
| opted_out_at | timestamp with time zone | evet |
| updated_at | timestamp with time zone | hayır |

## kb.device_failures

Cihaz arıza kaydı; duruş süresi otomatik hesaplanır.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| asset_id | uuid | hayır |
| reported_by | text | hayır |
| reported_at | timestamp with time zone | hayır |
| severity | text | hayır |
| status | text | hayır |
| run_id | uuid | evet |
| resolved_at | timestamp with time zone | evet |
| downtime_minutes | integer | evet |

## kb.discharge_plans

Taburcu planı ve idari engeller (epikriz yazılmadı, provizyon yok…). Klinik içerik değil, yalnız engel adı tutulur.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| encounter_id | uuid | hayır |
| planned_at | timestamp with time zone | hayır |
| blockers | ARRAY | hayır |
| ready | boolean | evet |
| updated_by | text | hayır |
| updated_at | timestamp with time zone | hayır |

## kb.drills

Tatbikat planı ve sonucu (yedekten dönüş tatbikatında ölçülen RTO/RPO dahil).

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| scenario | text | hayır |
| planned_at | timestamp with time zone | hayır |
| performed_at | timestamp with time zone | evet |
| findings | text | evet |
| rto_minutes_measured | integer | evet |
| rpo_minutes_measured | integer | evet |

## kb.encounter_moves

Yatak hareketleri (yatış, nakil, taburcu) — HL7 ADT A01/A02/A03 ile beslenir.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| encounter_id | uuid | hayır |
| from_bed_id | uuid | evet |
| to_bed_id | uuid | evet |
| reason | text | hayır |
| source_message_id | uuid | evet |
| at | timestamp with time zone | hayır |

## kb.encounters

Yatış dönemi (takma adlı). HBYS protokol/ziyaret numarası yalnız anahtarlı karma olarak tutulur; tanı, ilaç ve klinik not tutulmaz.

Kısıt (CHECK): 6

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| patient_token | text | hayır |
| external_visit_hash | text | hayır |
| unit_id | uuid | hayır |
| bed_id | uuid | evet |
| status | text | hayır |
| admitted_at | timestamp with time zone | evet |
| expected_discharge_at | timestamp with time zone | evet |
| discharged_at | timestamp with time zone | evet |
| source | text | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.facility_alarms

Bina yönetim sisteminden gelen kritik alarm; aynı olay iki kez kaydedilmez.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| system | text | hayır |
| campus_id | uuid | evet |
| raised_at | timestamp with time zone | hayır |
| cleared_at | timestamp with time zone | evet |
| source_event_id | text | hayır |
| run_id | uuid | evet |

## kb.facility_requests

Tesis/teknik bakım talebi.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| room_id | uuid | evet |
| category | text | hayır |
| status | text | hayır |
| created_at | timestamp with time zone | hayır |
| done_at | timestamp with time zone | evet |

## kb.floors

Kat.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| building_id | uuid | hayır |
| level | integer | hayır |
| label | text | hayır |

## kb.idempotency_keys

Aynı isteğin iki kez uygulanmasını önleyen anahtarlar (süreli).

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| key | text | hayır |
| request_hash | text | hayır |
| response_status | smallint | evet |
| created_at | timestamp with time zone | hayır |
| expires_at | timestamp with time zone | hayır |

## kb.inbound_messages

Köprüden gelen mesajların izi. Ham mesaj (kimlik içerir) saklanmaz; yalnız karma ve kontrol numarası. Aynı kontrol numarası ikinci kez işlenmez.

Kısıt (CHECK): 5

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| endpoint_id | uuid | evet |
| message_type | text | hayır |
| control_id | text | hayır |
| payload_sha256 | text | hayır |
| status | text | hayır |
| attempts | smallint | hayır |
| error_code | text | evet |
| received_at | timestamp with time zone | hayır |
| processed_at | timestamp with time zone | evet |

## kb.indicator_measurements

Gösterge ölçümleri (dönem bazında). Küçük örneklemler raporda bastırılır.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| indicator_id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | evet |
| period | date | hayır |
| value | numeric | hayır |
| sample_size | integer | hayır |

## kb.integration_endpoints

Entegrasyon uç noktaları. HBYS'ye yazan uç nokta tanımlanamaz (writes_to_his her zaman false; kapsam dışı).

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| kind | text | hayır |
| name | text | hayır |
| direction | text | hayır |
| writes_to_his | boolean | hayır |
| api_client_id | uuid | evet |
| active | boolean | hayır |
| last_success_at | timestamp with time zone | evet |
| last_error_at | timestamp with time zone | evet |

## kb.internal_audits

İç denetim kaydı (kalite/bilgi güvenliği).

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| scope | text | hayır |
| standard_ref | text | evet |
| planned_at | date | hayır |
| performed_at | date | evet |
| auditor | text | hayır |
| result | text | evet |

## kb.maintenance_plans

Periyodik bakım ve kalibrasyon takvimi.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| asset_id | uuid | hayır |
| kind | text | hayır |
| interval_days | integer | hayır |
| next_due | date | hayır |
| vendor | text | evet |

## kb.maintenance_records

Yapılan bakım/kalibrasyon kayıtları ve sonuç.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| asset_id | uuid | hayır |
| plan_id | uuid | evet |
| kind | text | hayır |
| result | text | hayır |
| performed_at | timestamp with time zone | hayır |
| performed_by | text | hayır |
| certificate_ref | text | evet |

## kb.message_templates

Mesaj şablonları. Ticari (tanıtım) şablon etkinleştirilemez (6563/İYS doğrulaması tamamlanana kadar kapalı); bilgilendirme şablonu onaylanmadan kullanılmaz.

Kısıt (CHECK): 6

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| purpose | text | hayır |
| channel | text | hayır |
| body | text | hayır |
| version | integer | hayır |
| approved_by | text | evet |
| active | boolean | hayır |

## kb.mfa_credentials

Çok faktörlü doğrulama: passkey (WebAuthn açık anahtarı) veya TOTP (gizli anahtar yalnız şifreli).

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| kind | text | hayır |
| credential_id | text | evet |
| public_key | text | evet |
| secret_ciphertext | bytea | evet |
| label | text | hayır |
| sign_count | bigint | hayır |
| created_at | timestamp with time zone | hayır |
| last_used_at | timestamp with time zone | evet |
| revoked_at | timestamp with time zone | evet |

## kb.notification_preferences

Bildirim kanalı tercihleri ve sessiz saat.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| channel | text | hayır |
| enabled | boolean | hayır |
| quiet_from | time without time zone | evet |
| quiet_to | time without time zone | evet |

## kb.notifications

Kişisel bildirim. Metinde hasta belirteci veya kimliği yer almaz; bağlantı yalnız uygulama içi yoldur.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| kind | text | hayır |
| title | text | hayır |
| detail | text | hayır |
| link | text | hayır |
| dedupe_key | text | hayır |
| created_at | timestamp with time zone | hayır |
| read_at | timestamp with time zone | evet |

## kb.outbound_messages

Giden mesaj kuyruğu: sessiz saatte bekletilir, en fazla 5 deneme; başarısızlıkta çağrı merkezine görev (fallback_task).

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| patient_token | text | hayır |
| template_id | uuid | hayır |
| status | text | hayır |
| send_after | timestamp with time zone | hayır |
| attempts | smallint | hayır |
| provider_ref | text | evet |
| last_error | text | evet |
| created_by | text | hayır |
| created_at | timestamp with time zone | hayır |
| idempotency_key | text | hayır |

## kb.permissions

İnce taneli yetki kataloğu (RBAC+ABAC).

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| code | text | hayır |
| label | text | hayır |
| sensitive | boolean | hayır |

## kb.playbook_versions

Akış sürümü: taslağı yazan kişi onaylayamaz (görevler ayrılığı); onaylı sürüm değiştirilemez.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| playbook_id | uuid | hayır |
| version | integer | hayır |
| status | text | hayır |
| definition | jsonb | hayır |
| authored_by | text | hayır |
| approved_by | text | evet |
| approved_at | timestamp with time zone | evet |
| created_at | timestamp with time zone | hayır |

## kb.playbooks

Operasyon akışı (kurum kendi akışını tanımlayabilir). Klinik karar adımı yalnız "yetkili personel karar verir" onayı olarak tanımlanır.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| title | text | hayır |
| category | text | hayır |
| current_version | integer | evet |
| active | boolean | hayır |

## kb.quality_indicators

Kalite göstergesi tanımı (ör. yatak hazırlama süresi, ilk vaka gecikmesi).

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| name | text | hayır |
| unit_of_measure | text | hayır |
| direction | text | hayır |
| target | numeric | evet |
| threshold | numeric | evet |

## kb.rca_cases

Kök neden analizi.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| incident_id | uuid | hayır |
| method | text | hayır |
| findings | text | evet |
| owner | text | hayır |
| due_at | date | hayır |
| closed_at | timestamp with time zone | evet |

## kb.role_permissions

Rol → yetki eşlemesi.

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| role_code | text | hayır |
| permission_code | text | hayır |

## kb.roles

Sistem rolleri. Gözetim rolleri (KVKK, güvenlik) operasyon kaydını değiştiremez.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| code | text | hayır |
| label | text | hayır |
| oversight | boolean | hayır |
| requires_mfa | boolean | hayır |

## kb.rooms

Oda.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| floor_id | uuid | evet |
| code | text | hayır |
| isolation_capable | boolean | hayır |

## kb.runs

Akış çalıştırması. Hasta yalnız takma ad belirteciyle (P-…) bağlanır; ad, TCKN veya tanı tutulmaz. Aynı olay ve aynı bağlı akış iki kez açılamaz.

Kısıt (CHECK): 9

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| reference | text | hayır |
| playbook_id | uuid | hayır |
| playbook_version | integer | hayır |
| status | text | hayır |
| current_step | integer | hayır |
| step_count | integer | hayır |
| parent_run_id | uuid | evet |
| trigger_event | text | evet |
| campus_id | uuid | evet |
| location_code | text | evet |
| asset_id | uuid | evet |
| patient_token | text | evet |
| chain_choices | ARRAY | hayır |
| started_by | text | hayır |
| started_at | timestamp with time zone | hayır |
| closed_at | timestamp with time zone | evet |
| cancel_reason | text | evet |
| idempotency_key | text | evet |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.safety_incidents

Hasta güvenliği olay bildirimi (iç kalite süreci). Anonim bildirimde bildiren tutulmaz. Özet maskelenmiş serbest metindir; hasta kimliği yazılmaz.

Kısıt (CHECK): 6

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| category | text | hayır |
| harm_level | text | hayır |
| anonymous | boolean | hayır |
| reported_by | text | evet |
| summary | text | hayır |
| occurred_at | timestamp with time zone | hayır |
| reported_at | timestamp with time zone | hayır |
| status | text | hayır |

## kb.sessions

Oturumlar: yalnız belirteç karması tutulur; en fazla 12 saat; uzaktan kapatılabilir.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| token_hash | text | hayır |
| mfa_level | text | hayır |
| ip_hash | text | evet |
| user_agent_hash | text | evet |
| created_at | timestamp with time zone | hayır |
| last_activity_at | timestamp with time zone | hayır |
| expires_at | timestamp with time zone | hayır |
| revoked_at | timestamp with time zone | evet |
| revoked_reason | text | evet |

## kb.shift_handoffs

Vardiya devri; kişi başına birimde tek bekleyen devir.

Kısıt (CHECK): 5

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| from_staff_id | uuid | hayır |
| to_staff_id | uuid | hayır |
| status | text | hayır |
| open_tasks | integer | hayır |
| note | text | evet |
| created_at | timestamp with time zone | hayır |
| decided_at | timestamp with time zone | evet |

## kb.shifts

Vardiya planı.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| staff_id | uuid | hayır |
| starts_at | timestamp with time zone | hayır |
| ends_at | timestamp with time zone | hayır |
| status | text | hayır |

## kb.staff

Personel hesabı. Kimlik hastanenin kimlik sağlayıcısından (OIDC/SAML subject) gelir; e-posta yalnız karma olarak tutulur.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| external_subject | text | hayır |
| display_label | text | hayır |
| email_hash | text | evet |
| active | boolean | hayır |
| deactivated_at | timestamp with time zone | evet |
| last_seen_at | timestamp with time zone | evet |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.staff_roles

Personel rolleri; süreli rol verilebilir.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| role_code | text | hayır |
| granted_by | text | hayır |
| granted_at | timestamp with time zone | hayır |
| expires_at | timestamp with time zone | evet |

## kb.stock_alerts

Stok ve soğuk zincir UYARISI (stok muhasebesi değildir).

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| item_code | text | hayır |
| kind | text | hayır |
| level_value | numeric | evet |
| threshold | numeric | evet |
| status | text | hayır |
| raised_at | timestamp with time zone | hayır |
| resolved_at | timestamp with time zone | evet |

## kb.target_policies

Birim ve iş türüne göre hedef süre ve yükseltme eşikleri (dakika). Kod sabiti değil, kurum ayarıdır.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| unit_id | uuid | hayır |
| source | text | hayır |
| target_minutes | integer | hayır |
| first_escalation_after | integer | hayır |
| second_escalation_after | integer | hayır |

## kb.task_events

Görev geçmişi (kim, ne zaman, ne değişti). Not alanı maskelenmiş kısa metindir.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| task_id | uuid | hayır |
| kind | text | hayır |
| from_status | text | evet |
| to_status | text | evet |
| actor | text | hayır |
| note | text | evet |
| at | timestamp with time zone | hayır |

## kb.task_transitions

Görev durumunun izin verilen geçişleri; tamamlanan veya iptal edilen görev yeniden açılamaz.

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| from_status | text | hayır |
| to_status | text | hayır |

## kb.tasks

Birim iş kutusundaki görev. "kritik" öncelik kuralla üretilemez; yalnız personel veya HBYS verir (ADR-003). Durum geçişleri kb.task_transitions ile sınırlı.

Kısıt (CHECK): 13

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| reference | text | hayır |
| unit_id | uuid | hayır |
| run_id | uuid | evet |
| step_index | integer | evet |
| source | text | hayır |
| title | text | hayır |
| status | text | hayır |
| priority | text | hayır |
| priority_source | text | hayır |
| requires_approval | boolean | hayır |
| clinical_approval | boolean | hayır |
| assigned_staff_id | uuid | evet |
| activate_at | timestamp with time zone | evet |
| due_at | timestamp with time zone | evet |
| escalation_level | smallint | hayır |
| completed_by | text | evet |
| completed_at | timestamp with time zone | evet |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.tenants

Kurum (hastane veya hastane grubu). Her kayıt bir kuruma aittir; veri yerleşimi her zaman TR.

Kısıt (CHECK): 6

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| code | text | hayır |
| name | text | hayır |
| kind | text | hayır |
| parent_id | uuid | evet |
| deployment | text | hayır |
| data_residency | text | hayır |
| active | boolean | hayır |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kb.transport_requests

Hasta transportu talebi ve süreleri.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| encounter_id | uuid | evet |
| from_unit_id | uuid | hayır |
| to_unit_id | uuid | hayır |
| mode | text | hayır |
| status | text | hayır |
| requested_at | timestamp with time zone | hayır |
| assigned_staff_id | uuid | evet |
| delivered_at | timestamp with time zone | evet |

## kb.unit_memberships

Personelin çalıştığı birimler; kayıt kapsamı (RLS) bu listeden kurulur.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| tenant_id | uuid | hayır |
| staff_id | uuid | hayır |
| unit_id | uuid | hayır |
| unit_role | text | hayır |
| active | boolean | hayır |
| since | timestamp with time zone | hayır |

## kb.units

Birim. sensitive=true birimlerde (ör. psikiyatri, onkoloji) birim adı bile sağlık bilgisi ele verebilir; raporlarda ek maskeleme uygulanır.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| campus_id | uuid | hayır |
| code | text | hayır |
| name | text | hayır |
| kind | text | hayır |
| target_minutes | integer | hayır |
| sensitive | boolean | hayır |
| active | boolean | hayır |
| created_at | timestamp with time zone | hayır |
| updated_at | timestamp with time zone | hayır |
| version | integer | hayır |

## kvkk.breach_events

İhlal zaman çizelgesi (kanıt).

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| breach_id | uuid | hayır |
| tenant_id | uuid | hayır |
| kind | text | hayır |
| note | text | hayır |
| actor | text | hayır |
| at | timestamp with time zone | hayır |

## kvkk.breach_incidents

Kişisel veri ihlali: Kurula bildirim için 72 saatlik son an öğrenme zamanından otomatik hesaplanır. Veri işleyen olarak veri sorumlusuna (hastaneye) bildirim ve 7545 kapsamında siber olay bildirimi ayrı alanlardır. Sistem kendiliğinden bildirim göndermez.

Kısıt (CHECK): 7

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| reference | text | hayır |
| detected_at | timestamp with time zone | hayır |
| learned_at | timestamp with time zone | hayır |
| board_deadline | timestamp with time zone | hayır |
| description | text | hayır |
| data_categories | ARRAY | hayır |
| affected_estimate | integer | evet |
| special_category | boolean | hayır |
| status | text | hayır |
| board_notified_at | timestamp with time zone | evet |
| subjects_notified_at | timestamp with time zone | evet |
| controller_notified_at | timestamp with time zone | evet |
| cyber_reported_at | timestamp with time zone | evet |
| not_reportable_reason | text | evet |

## kvkk.consents

Açık rıza kaydı: belirli amaç, bilgilendirilmiş, özgür; geri alınabilir. Başka hukuki sebep varken rıza istenmez.

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| subject_ref | text | hayır |
| purpose | text | hayır |
| text_sha256 | text | hayır |
| given_at | timestamp with time zone | hayır |
| withdrawn_at | timestamp with time zone | evet |
| channel | text | hayır |

## kvkk.cross_border_transfers

Yurt dışı aktarım kaydı. Sağlık verisi aktarımı kaydedilemez (ürün kuralı); standart sözleşmede Kurula 5 iş günü içindeki bildirim tarihi zorunlu.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| processor_id | uuid | hayır |
| data_categories | ARRAY | hayır |
| mechanism | text | hayır |
| contains_personal_data | boolean | hayır |
| contains_health_data | boolean | hayır |
| board_notified_at | date | evet |

## kvkk.data_subject_requests

İlgili kişi başvurusu (KVKK m.11, m.13): son gün başvuru tarihinden 30 gündür ve değiştirilemez; kimlik doğrulama beklemesi süreyi durdurmaz.

Kısıt (CHECK): 7

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| reference | text | hayır |
| kind | text | hayır |
| channel | text | hayır |
| subject_ref | text | evet |
| received_at | timestamp with time zone | hayır |
| due_at | timestamp with time zone | hayır |
| identity_verified_at | timestamp with time zone | evet |
| status | text | hayır |
| decision_reason | text | evet |
| answered_at | timestamp with time zone | evet |
| answer_ref | text | evet |

## kvkk.disposal_runs

Periyodik imha çalıştırması ve tutanak karması (en az 3 yıl saklanır).

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| started_at | timestamp with time zone | hayır |
| finished_at | timestamp with time zone | evet |
| actor | text | hayır |
| summary | jsonb | hayır |
| report_sha256 | text | evet |

## kvkk.legal_bases

Hukuki sebep kataloğu (KVKK m.5 ve m.6). Metin hukukçu onayıyla güncellenir; sürüm değişikliği yeni satır olarak eklenir.

Kısıt (CHECK): 0

| Sütun | Tür | Boş olabilir |
|---|---|---|
| code | text | hayır |
| article | text | hayır |
| label | text | hayır |
| special_category | boolean | hayır |

## kvkk.legal_holds

Yasal saklama: dava, soruşturma veya başvuru süresince imha durdurulur.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| target | text | hayır |
| subject_ref | text | evet |
| reason | text | hayır |
| placed_by | text | hayır |
| placed_at | timestamp with time zone | hayır |
| released_at | timestamp with time zone | evet |

## kvkk.notice_deliveries

Hangi aydınlatma sürümünün kime, ne zaman gösterildiği. Gösterim rıza anlamına gelmez.

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| notice_id | uuid | hayır |
| subject_ref | text | hayır |
| channel | text | hayır |
| delivered_at | timestamp with time zone | hayır |

## kvkk.privacy_notices

Aydınlatma metni sürümleri; yayımlanan metin karmasıyla kanıtlanır.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| audience | text | hayır |
| version | integer | hayır |
| body_sha256 | text | hayır |
| body | text | hayır |
| published_at | timestamp with time zone | evet |
| approved_by | text | evet |

## kvkk.processing_activities

Kişisel veri işleme envanteri (VERBİS hazırlığı). Saklama yeri her zaman TR.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| code | text | hayır |
| purpose | text | hayır |
| data_categories | ARRAY | hayır |
| special_category | boolean | hayır |
| legal_basis | text | hayır |
| data_subjects | ARRAY | hayır |
| recipients | ARRAY | hayır |
| storage_location | text | hayır |
| retention_policy_id | uuid | evet |
| security_measures | ARRAY | hayır |
| role | text | hayır |
| reviewed_at | date | evet |

## kvkk.processors

Veri işleyen ve alt işleyenler. Sağlık verisi işleyen alt işleyen yalnız TR olabilir (SBYS md.16(3) ürün kararı).

Kısıt (CHECK): 2

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| name | text | hayır |
| service | text | hayır |
| country | text | hayır |
| contract_ref | text | evet |
| contract_signed_at | date | evet |
| sub_processor_of | uuid | evet |
| handles_special_category | boolean | hayır |

## kvkk.retention_policies

Saklama-imha politikası. Yalnız beyaz listedeki tablolar imha edilebilir; politika onaylanmadan etkinleşmez. Süreler hastanenin hukukçusu tarafından belirlenir.

Kısıt (CHECK): 4

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | uuid | hayır |
| tenant_id | uuid | hayır |
| data_category | text | hayır |
| target | text | hayır |
| retention_days | integer | hayır |
| action | text | hayır |
| legal_reference | text | hayır |
| approved_by | text | evet |
| active | boolean | hayır |

## vault.identities

Takma ad ↔ kimlik eşlemesi. Kimlik yalnız AES-256-GCM ile şifreli; arama için anahtarlı kör indeks (HMAC). Anonimleştirmede şifreli alan silinir.

Kısıt (CHECK): 3

| Sütun | Tür | Boş olabilir |
|---|---|---|
| token | text | hayır |
| tenant_id | uuid | hayır |
| national_id_bidx | text | hayır |
| identity_ciphertext | bytea | hayır |
| key_version | integer | hayır |
| source | text | hayır |
| created_at | timestamp with time zone | hayır |
| anonymized_at | timestamp with time zone | evet |

## vault.key_versions

Zarf şifreleme: veri anahtarı (DEK) ana anahtarla (KEK, KMS/HSM) sarılı tutulur; amaç başına tek etkin anahtar; rotasyonda eski anahtar yalnız çözme modunda kalır.

Kısıt (CHECK): 5

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | integer | hayır |
| tenant_id | uuid | hayır |
| purpose | text | hayır |
| wrapped_dek | bytea | hayır |
| kek_ref | text | hayır |
| algorithm | text | hayır |
| status | text | hayır |
| created_at | timestamp with time zone | hayır |
| destroyed_at | timestamp with time zone | evet |

## vault.reidentification_log

Kimliğe her geri dönüşün gerekçeli kaydı (KVKK m.12, Kişisel Sağlık Verileri Yön. erişim kaydı).

Kısıt (CHECK): 1

| Sütun | Tür | Boş olabilir |
|---|---|---|
| id | bigint | hayır |
| tenant_id | uuid | hayır |
| token | text | hayır |
| actor | text | hayır |
| reason | text | hayır |
| break_glass_id | uuid | evet |
| at | timestamp with time zone | hayır |

