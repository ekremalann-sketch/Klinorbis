import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import {
  approvals,
  automationEvents,
  callMessages,
  callSessions,
  integrationEvents,
  operationalTasks,
  ticketEvents,
  tickets,
  workflowJobs,
} from "../db/schema";
import { appendAudit } from "./audit";
import { findUnit } from "./hospital-units";

type Db = ReturnType<typeof getDb>;
type Speaker = "system" | "agent" | "caller" | "assistant" | "clinician";

type PilotScenario = {
  code: string;
  title: string;
  patientAlias: string;
  unitCode: string;
  priority: "Normal" | "Yüksek" | "Acil";
  requiresApproval: boolean;
  requestSubject: string;
  summary: string;
  messages: Array<{ speaker: Speaker; label: string; text: string }>;
};

const STEP_MS = 7_000;
const STEP_COUNT = 12;
const CYCLE_MS = STEP_MS * STEP_COUNT;

const SCENARIOS: PilotScenario[] = [
  {
    code: "KRD-RND",
    title: "Kardiyoloji kontrol randevusu",
    patientAlias: "HST-EĞİTİM-KRD",
    unitCode: "KRD",
    priority: "Normal",
    requiresApproval: false,
    requestSubject: "Kardiyoloji kontrol randevusu ve önceki tetkik evrakı hakkında bilgi",
    summary: "Arayan, daha önce planlanan kardiyoloji kontrolünün tarihini ve yanında getirmesi gereken idari evrakı soruyor. Klinik öneri üretilmeden Kardiyoloji kuyruğuna görev açıldı.",
    messages: [
      { speaker: "system", label: "Santral", text: "Kimliksiz pilot çağrı güvenli oturuma alındı; kişisel alanlar maskeleme filtresinden geçiriliyor." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "KLINORBIS Hasta İletişim Merkezine hoş geldiniz. Size randevu ve hastane süreçleri konusunda yardımcı olabilirim. Acil bir durum varsa lütfen 112’yi arayın." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Geçen ay kardiyoloji kontrolü denmişti. Tarihi netleştirmek ve eski EKO raporunu yanımda getirip getirmeyeceğimi öğrenmek istiyorum." },
      { speaker: "assistant", label: "Yönlendirme yardımcısı", text: "İdari konu belirlendi: kardiyoloji kontrol randevusu. Klinik karar yok; Kardiyoloji birim kuyruğu önerildi." },
      { speaker: "system", label: "Otomasyon", text: "KRD çalışma masasında randevu doğrulama görevi açıldı. SLA sayacı ve aktarım izi başlatıldı." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Talebinizi Kardiyoloji randevu masasına aktardım. Kaydınızın hangi birimde ve kimde olduğunu ekranda izliyorum." },
      { speaker: "clinician", label: "Kardiyoloji birim görevlisi (pilot)", text: "Görevi kabul ettim. HBYS bağlantısı olmadığı için kesin saat üretmiyorum; mevcut talebi doğrulama listesine aldım." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Teşekkür ederim. Uygun saat netleştiğinde aynı numaradan bilgilendirilmek istiyorum." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "İletişim tercihiniz kayıt politikasına göre işaretlendi. Kesinleşmeyen bir randevu varmış gibi bilgi vermeyeceğiz." },
      { speaker: "system", label: "Otomasyon", text: "Talep sonuç kodu: birim doğrulamasına iletildi. Görev, talep ve görüşme zaman çizelgesi eşitlendi." },
    ],
  },
  {
    code: "ORT-KNT",
    title: "Ortopedi ameliyat sonrası kontrol",
    patientAlias: "HST-EĞİTİM-ORT",
    unitCode: "ORT",
    priority: "Yüksek",
    requiresApproval: false,
    requestSubject: "Ortopedi ameliyat sonrası kontrol tarihi değişikliği",
    summary: "Kontrol tarihini değiştirmek isteyen arayan için Ortopedi birimine zaman hassasiyetli idari görev açıldı; tıbbi değerlendirme yapılmadı.",
    messages: [
      { speaker: "system", label: "Santral", text: "Pilot görüşme açıldı; arayan bilgisi takma adla işlendi." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Geçmiş olsun. Kontrol tarihi, bölüm aktarımı veya belge süreci konusunda yardımcı olabilirim; tıbbi değerlendirme yapamam." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Ortopedi ameliyatından sonraki kontrolüm yarın görünüyor ama şehir dışında kaldım. Tarihi değiştirmem gerekiyor." },
      { speaker: "assistant", label: "Yönlendirme yardımcısı", text: "Zaman hassasiyetli randevu değişikliği belirlendi. Ortopedi ve Travmatoloji görev kuyruğu önerildi." },
      { speaker: "system", label: "Otomasyon", text: "ORT kuyruğunda yüksek öncelikli kontrol değişikliği görevi oluşturuldu; hedef süre 25 dakika." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Talebiniz Ortopedi çalışma masasına düştü. Birim kabul ettiğinde durum bu görüşmede anında görünecek." },
      { speaker: "clinician", label: "Ortopedi birim görevlisi (pilot)", text: "Talebi kabul ettim. Mevcut kayıt ve uygunluk, gerçek HBYS bağlantısı geldiğinde doğrulanacak." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Tamamdır, iptal edilmiş sayılmasın; yeni tarih için dönüş bekleyeceğim." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Notunuzu görev kaydına ekledim. Kesin değişiklik yapılana kadar talep ‘doğrulama bekliyor’ durumunda kalacak." },
      { speaker: "system", label: "Otomasyon", text: "Görüşme sonuçlandırıldı; geri dönüş görevi ve denetim kaydı oluşturuldu." },
    ],
  },
  {
    code: "RAD-HZR",
    title: "MR hazırlık bilgilendirmesi",
    patientAlias: "HST-EĞİTİM-RAD",
    unitCode: "RAD",
    priority: "Normal",
    requiresApproval: true,
    requestSubject: "Radyoloji MR randevusu ön hazırlık bilgisinin doğrulanması",
    summary: "MR öncesi hazırlık sorusu Radyoloji birimine aktarıldı. Otomasyon yalnız idari taslak oluşturdu; kişiye özel hazırlık talimatı yetkili personel onayı bekliyor.",
    messages: [
      { speaker: "system", label: "Santral", text: "Kimliksiz pilot çağrı oturumu başlatıldı." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Radyoloji randevunuzun saati ve kurumun onaylı hazırlık talimatı konusunda yardımcı olabilirim." },
      { speaker: "caller", label: "Arayan (pilot)", text: "MR için aç gelmem gerektiği söylendi mi emin değilim. Mesajda hazırlık bilgisi görünmüyor." },
      { speaker: "assistant", label: "Güvenli yardımcısı", text: "Kişiye özel tıbbi hazırlık sorusu algılandı. Otomatik yanıt verme; Radyoloji personel onayına devret." },
      { speaker: "system", label: "Otomasyon", text: "RAD kuyruğunda görev ve insan onayı açıldı; standart mesaj gönderimi durduruldu." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Yanlış yönlendirmemek için hazırlık bilgisini yetkili Radyoloji görevlisine doğrulatıyorum. Onay gelmeden size varsayım sunmayacağım." },
      { speaker: "clinician", label: "Radyoloji birim görevlisi (pilot)", text: "Kaydı devraldım. İnceleme tamamlanana kadar yalnız randevu referansı üzerinden ilerleyeceğiz." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Anladım, doğrulanmış bilgi için bekliyorum." },
      { speaker: "system", label: "İnsan onayı", text: "Hazırlık talimatı kararı yetkili personel bekliyor; otomasyon bu noktada durdu." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Talep Radyoloji masasında ve onay bekliyor. Karar verildiğinde aynı kayıt üzerinden ilerleyecek." },
    ],
  },
  {
    code: "ONK-PLN",
    title: "Onkoloji tedavi günü lojistik koordinasyonu",
    patientAlias: "HST-EĞİTİM-ONK",
    unitCode: "ONK",
    priority: "Yüksek",
    requiresApproval: true,
    requestSubject: "Onkoloji tedavi günü ulaşım ve refakatçi planı",
    summary: "Tedavi günü ulaşım ve refakatçi planı için Onkoloji koordinasyon görevi açıldı. Klinik plan değişikliği yapılmadı; yetkili birim onayı zorunlu.",
    messages: [
      { speaker: "system", label: "Santral", text: "Pilot çağrı güvenli konuşma kaydına bağlandı." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Size ulaşım, refakatçi ve hastane içi koordinasyon konusunda yardımcı olabilirim; tedavi kararlarına müdahale edemem." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Tedavi günü yalnız geleceğim. Hastane içinde destek ve dönüş için araç ayarlanabiliyor mu öğrenmek istiyorum." },
      { speaker: "assistant", label: "Yönlendirme yardımcısı", text: "Onkoloji lojistik koordinasyon talebi belirlendi; Onkoloji ve Sosyal Hizmet görünürlüğü önerildi." },
      { speaker: "system", label: "Otomasyon", text: "ONK ana görevi açıldı; SHZ takipçisi eklendi ve insan onay kapısı etkinleştirildi." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Talebiniz Onkoloji koordinasyon masasına ulaştı. Sosyal Hizmet birimi de yalnız gerekli kapsamda takipçi olarak eklendi." },
      { speaker: "clinician", label: "Onkoloji koordinatörü (pilot)", text: "Görevi kabul ettim. Lojistik seçenekleri doğrulayıp onaylı planı kayıt üzerinden paylaşacağız." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Teşekkür ederim, tedavi saatim değişmeden ulaşım kısmının netleşmesi yeterli." },
      { speaker: "system", label: "İnsan onayı", text: "Lojistik plan taslağı hazır; birim sorumlusu kararı bekleniyor." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Plan henüz kesinleşmedi. Onay tamamlandığında bildirim kaydı bu görüşmeye eklenecek." },
    ],
  },
  {
    code: "EVS-ZYT",
    title: "Evde sağlık ziyaret talebi",
    patientAlias: "HST-EĞİTİM-EVS",
    unitCode: "EVS",
    priority: "Normal",
    requiresApproval: false,
    requestSubject: "Evde sağlık ziyaret günü hakkında geri arama talebi",
    summary: "Evde sağlık ziyaret günü için geri arama görevi açıldı ve Evde Sağlık çalışma masasına teslim edildi.",
    messages: [
      { speaker: "system", label: "Santral", text: "Kimliksiz pilot görüşme oturumu açıldı." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Evde sağlık başvurusu, ziyaret planı veya geri arama talebiniz için yardımcı olabilirim." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Geçen hafta evde sağlık için başvuru bırakmıştık. Ziyaret günü belli oldu mu kontrol etmek istiyorum." },
      { speaker: "assistant", label: "Yönlendirme yardımcısı", text: "Mevcut başvuru takibi ve geri arama talebi; Evde Sağlık birimi önerildi." },
      { speaker: "system", label: "Otomasyon", text: "EVS kuyruğuna kayıt takip görevi ve geri arama zamanlayıcısı eklendi." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Talebiniz Evde Sağlık masasında. Kesinleşmemiş bir gün söylemeyeceğim; birim doğrulamasını bekliyoruz." },
      { speaker: "clinician", label: "Evde Sağlık görevlisi (pilot)", text: "Görevi kabul ettim. Planlama kaydını kontrol edip geri arama görevini sahipleniyorum." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Tamam, öğleden sonra aranabiliriz." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Tercih edilen geri arama aralığı görev notuna eklendi." },
      { speaker: "system", label: "Otomasyon", text: "Geri arama görevi planlandı; görüşme denetim iziyle sonuçlandırıldı." },
    ],
  },
  {
    code: "TRF-YTK",
    title: "Kurumlar arası transfer ve yatak koordinasyonu",
    patientAlias: "HST-EĞİTİM-TRF",
    unitCode: "TRF",
    priority: "Yüksek",
    requiresApproval: true,
    requestSubject: "Kurumlar arası transfer ön kabul ve yatak doğrulama talebi",
    summary: "Transfer ön kabul kaydı açıldı. Kesin yatak veya kabul kararı üretilmeden Transfer Merkezi insan onayına devredildi.",
    messages: [
      { speaker: "system", label: "Kurum hattı", text: "Kimliksiz pilot kurum çağrısı transfer oturumuna alındı." },
      { speaker: "agent", label: "Transfer çağrı görevlisi", text: "Transfer ön kabul kaydını açabilirim. Kesin kabul, klinik uygunluk ve yatak bilgisi yetkili ekip onayı olmadan verilemez." },
      { speaker: "caller", label: "Sevk eden kurum (pilot)", text: "Yoğun bakım sonrası servise devri planlanan bir hasta için yatak ve kabul sürecini başlatmak istiyoruz." },
      { speaker: "assistant", label: "Yönlendirme yardımcısı", text: "Kurumlar arası transfer ön kabul talebi belirlendi; Transfer Merkezi ana görev, Yatak Yönetimi takipçisi önerildi." },
      { speaker: "system", label: "Otomasyon", text: "TRF çalışma masasında yüksek öncelikli ön kabul görevi açıldı; YTK görünürlüğü ve insan onayı eklendi." },
      { speaker: "agent", label: "Transfer çağrı görevlisi", text: "Başvurunuz Transfer Merkezi kuyruğunda. Yatak doğrulanmadan kabul edilmiş gibi bilgi vermeyeceğiz." },
      { speaker: "clinician", label: "Transfer koordinatörü (pilot)", text: "Görevi kabul ettim. Klinik evrak ve kapasite kontrollerini yetkili ekiplerle koordine ediyorum." },
      { speaker: "caller", label: "Sevk eden kurum (pilot)", text: "Anlaşıldı, transfer saatini onay gelmeden planlamayacağız." },
      { speaker: "system", label: "İnsan onayı", text: "Ön kabul ve yatak kararı yetkili koordinatör onayı bekliyor." },
      { speaker: "agent", label: "Transfer çağrı görevlisi", text: "Kayıt açık ve izleniyor. Onay kararı bu zaman çizelgesine eklenecek." },
    ],
  },
  {
    code: "CTM-ODA",
    title: "İzolasyon odası dönüş ve temizlik görevi",
    patientAlias: "ODA-EĞİTİM-CTM",
    unitCode: "CTM",
    priority: "Yüksek",
    requiresApproval: false,
    requestSubject: "İzolasyon odası dönüş temizliği ve yatak hazırlama görevi",
    summary: "Servis tarafından bildirilen oda dönüş işi Çevre ve Temizlik Hizmetleri kuyruğuna öncelikli görev olarak aktarıldı.",
    messages: [
      { speaker: "system", label: "Dahili hat", text: "Kimliksiz pilot servis çağrısı operasyon oturumuna alındı." },
      { speaker: "agent", label: "Operasyon görevlisi", text: "Oda dönüş, hasta transportu veya teknik destek görevini ilgili operasyon masasına aktarabilirim." },
      { speaker: "caller", label: "Servis sorumlusu (pilot)", text: "İzolasyon odası boşaldı. Yeni yatış öncesi protokole uygun dönüş temizliği gerekiyor." },
      { speaker: "assistant", label: "Operasyon yönlendirme", text: "Çevre ve Temizlik Hizmetleri görevi belirlendi; izolasyon protokolü etiketi ve yüksek öncelik önerildi." },
      { speaker: "system", label: "Otomasyon", text: "CTM kuyruğunda dönüş temizliği görevi açıldı; yatak hazırlık süreciyle ilişkilendirildi." },
      { speaker: "agent", label: "Operasyon görevlisi", text: "Görev Çevre Hizmetleri masasında ve hedef süresi başladı." },
      { speaker: "clinician", label: "Çevre hizmetleri sorumlusu (pilot)", text: "Görevi kabul ettim. Uygun ekip ve protokol kontrolüyle işleme alıyorum." },
      { speaker: "caller", label: "Servis sorumlusu (pilot)", text: "Tamam, oda hazır bildirimi gelmeden yeni yatışı başlatmayacağız." },
      { speaker: "agent", label: "Operasyon görevlisi", text: "Hazır durumu yalnız görev tamamlandığında servis ekranına düşecek." },
      { speaker: "system", label: "Otomasyon", text: "Dönüş temizliği pilot görevi tamamlandı; CTM, YTK ve servis zaman çizelgesi güncellendi." },
    ],
  },
  {
    code: "ACY-DVR",
    title: "Acil olasılık sinyali ve insan devri",
    patientAlias: "HST-EĞİTİM-ACY",
    unitCode: "ACY",
    priority: "Acil",
    requiresApproval: true,
    requestSubject: "Acil olasılık sinyali içeren çağrının yetkili sağlık personeline devri",
    summary: "Görüşmede acil olasılık ifadesi algılandı. Normal otomasyon durduruldu; 112 uyarısı ve yetkili insan devri açıldı.",
    messages: [
      { speaker: "system", label: "Santral", text: "Pilot görüşme güvenli oturuma alındı; acil ifade izlemi etkin." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "KLINORBIS Hasta İletişim Merkezine hoş geldiniz. Acil bir durum varsa beklemeden 112’yi arayın." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Şu anda göğsümde baskı var ve nefes almakta zorlanıyorum. Randevu almak için aradım." },
      { speaker: "assistant", label: "Acil güvenlik filtresi", text: "Acil olasılık sinyali algılandı. Randevu akışını durdur; klinik karar üretme; yetkili insana devir ve 112 uyarısı göster." },
      { speaker: "system", label: "Otomasyon", text: "Normal iş akışı durduruldu. ACY kuyruğunda acil görev ve insan onayı açıldı." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Bu görüşmeyi randevu olarak sürdürmüyorum. Lütfen beklemeden 112’yi arayın; aynı anda yetkili sağlık personeline devir açıyorum." },
      { speaker: "clinician", label: "Klinik triyaj rolü (pilot)", text: "Görüşmeyi devraldım. Otomasyon kapalı; insan tarafından güvenli yönlendirme süreci başladı." },
      { speaker: "caller", label: "Arayan (pilot)", text: "Tamam, yanımdaki kişi 112’yi arıyor." },
      { speaker: "system", label: "İnsan devri", text: "Devir teyidi bekleniyor; kayıt otomatik kapatılamaz." },
      { speaker: "agent", label: "Çağrı görevlisi", text: "Yetkili personel görüşmede. Kayıt yalnız insan kararıyla sonuçlandırılabilir." },
    ],
  },
];

export type PilotHeartbeat = {
  enabled: true;
  disclosure: "Kimliksiz eğitim/pilot verisi";
  runReference: string;
  callReference: string;
  ticketReference: string;
  scenarioCode: string;
  scenarioTitle: string;
  unitCode: string;
  step: number;
  totalSteps: number;
  stepLabel: string;
  nextStepAt: string;
  engine: "KLINORBIS Worker + D1";
};

const BASELINE_CASES = [
  { reference: "PLT-KVC-001", alias: "HST-EĞİTİM-101", subject: "Kalp ve Damar Cerrahisi kontrol evrakı doğrulama", unitCode: "KVC", priority: "Yüksek", status: "İşlemde", taskStatus: "in_progress" },
  { reference: "PLT-ORT-002", alias: "HST-EĞİTİM-102", subject: "Ortopedi kontrol tarihi değişikliği", unitCode: "ORT", priority: "Normal", status: "Kabul edildi", taskStatus: "accepted" },
  { reference: "PLT-RAD-003", alias: "HST-EĞİTİM-103", subject: "MR hazırlık bilgisinin yetkili birimce doğrulanması", unitCode: "RAD", priority: "Normal", status: "Yeni", taskStatus: "queued" },
  { reference: "PLT-LAB-004", alias: "HST-EĞİTİM-104", subject: "Laboratuvar sonuç erişim sorunu", unitCode: "LAB", priority: "Normal", status: "İşlemde", taskStatus: "in_progress" },
  { reference: "PLT-EVS-005", alias: "HST-EĞİTİM-105", subject: "Evde sağlık ziyaret günü geri arama talebi", unitCode: "EVS", priority: "Normal", status: "Kabul edildi", taskStatus: "accepted" },
  { reference: "PLT-TRF-006", alias: "HST-EĞİTİM-106", subject: "Kurumlar arası transfer ön kabul koordinasyonu", unitCode: "TRF", priority: "Yüksek", status: "Yeni", taskStatus: "queued" },
  { reference: "PLT-CTM-007", alias: "ODA-EĞİTİM-107", subject: "İzolasyon odası dönüş temizliği", unitCode: "CTM", priority: "Yüksek", status: "İşlemde", taskStatus: "in_progress" },
  { reference: "PLT-TBR-008", alias: "HST-EĞİTİM-108", subject: "Taburculuk ulaşım ve evrak engeli", unitCode: "TBR", priority: "Yüksek", status: "Kabul edildi", taskStatus: "accepted" },
  { reference: "PLT-IVF-009", alias: "HST-EĞİTİM-109", subject: "İnfertilite ön değerlendirme randevu talebi", unitCode: "IVF", priority: "Normal", status: "Yeni", taskStatus: "queued" },
  { reference: "PLT-HHK-010", alias: "HST-EĞİTİM-110", subject: "Hasta iletişim süreci hakkında geri bildirim", unitCode: "HHK", priority: "Normal", status: "İşlemde", taskStatus: "in_progress" },
] as const;

export async function ensurePilotBaseline(db: Db) {
  const now = Date.now();
  for (const [index, item] of BASELINE_CASES.entries()) {
    const unit = findUnit(item.unitCode);
    const createdAt = new Date(now - (BASELINE_CASES.length - index) * 3 * 60_000);
    const inserted = await db.insert(tickets).values({
      reference: item.reference,
      patientAlias: item.alias,
      subject: item.subject,
      maskedSubject: item.subject,
      detectedPii: "[]",
      urgencyLevel: item.priority === "Yüksek" ? 4 : 2,
      humanApprovalRequired: item.unitCode === "RAD",
      unit: unit.name,
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      acceptedBy: item.taskStatus === "queued" ? null : `${unit.assignedRole} · pilot rol`,
      acceptedAt: item.taskStatus === "queued" ? null : new Date(createdAt.getTime() + 60_000),
      priority: item.priority,
      status: item.status,
      channel: "Canlı Pilot",
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 2 * 60_000),
      slaDueAt: new Date(createdAt.getTime() + unit.slaMinutes * 60_000),
    }).onConflictDoNothing().returning({ reference: tickets.reference });
    if (!inserted.length) continue;
    await db.insert(operationalTasks).values({
      reference: `TSK-${item.reference}`,
      ticketReference: item.reference,
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      sourceType: "pilot_baseline",
      status: item.taskStatus,
      priority: item.priority,
      dueAt: new Date(createdAt.getTime() + unit.slaMinutes * 60_000),
      acceptedBy: item.taskStatus === "queued" ? null : `${unit.assignedRole} · pilot rol`,
      acceptedAt: item.taskStatus === "queued" ? null : new Date(createdAt.getTime() + 60_000),
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 2 * 60_000),
    }).onConflictDoNothing();
    await db.insert(ticketEvents).values({
      ticketReference: item.reference,
      eventType: "pilot_baseline",
      actor: "pilot-orchestrator",
      toUnitCode: unit.code,
      detail: `Kimliksiz pilot kayıt ${unit.name} çalışma masasına teslim edildi`,
      createdAt,
    });
    await db.insert(automationEvents).values({
      ticketReference: item.reference,
      rule: "Pilot başlangıç → birim kuyruğu",
      outcome: `${unit.name} çalışma masasında ${item.taskStatus} durumlu görev açıldı`,
      unitCode: unit.code,
      eventType: "pilot",
      actor: "pilot-orchestrator",
      createdAt,
    });
  }
}

export async function advancePilotAutomation(db: Db, at = new Date()): Promise<PilotHeartbeat> {
  const cycle = Math.floor(at.getTime() / CYCLE_MS);
  const cycleStartedAt = cycle * CYCLE_MS;
  const scenario = SCENARIOS[Math.abs(cycle) % SCENARIOS.length];
  const step = Math.min(STEP_COUNT - 1, Math.floor((at.getTime() - cycleStartedAt) / STEP_MS));
  const suffix = Math.abs(cycle).toString(36).toUpperCase().padStart(7, "0");
  const runReference = `PLT-${scenario.code}-${suffix}`;
  const callReference = `CAG-${suffix}`;
  const ticketReference = `TLP-${suffix}`;

  for (let index = 0; index <= step; index += 1) {
    await applyStep(db, scenario, {
      index,
      runReference,
      callReference,
      ticketReference,
      stepAt: new Date(cycleStartedAt + index * STEP_MS),
    });
  }

  return {
    enabled: true,
    disclosure: "Kimliksiz eğitim/pilot verisi",
    runReference,
    callReference,
    ticketReference,
    scenarioCode: scenario.code,
    scenarioTitle: scenario.title,
    unitCode: scenario.unitCode,
    step,
    totalSteps: STEP_COUNT,
    stepLabel: stepLabel(step, scenario),
    nextStepAt: new Date(cycleStartedAt + (step + 1) * STEP_MS).toISOString(),
    engine: "KLINORBIS Worker + D1",
  };
}

export function currentPilotHeartbeat(at = new Date()): PilotHeartbeat {
  const cycle = Math.floor(at.getTime() / CYCLE_MS);
  const cycleStartedAt = cycle * CYCLE_MS;
  const scenario = SCENARIOS[Math.abs(cycle) % SCENARIOS.length];
  const step = Math.min(STEP_COUNT - 1, Math.floor((at.getTime() - cycleStartedAt) / STEP_MS));
  const suffix = Math.abs(cycle).toString(36).toUpperCase().padStart(7, "0");
  return {
    enabled: true,
    disclosure: "Kimliksiz eğitim/pilot verisi",
    runReference: `PLT-${scenario.code}-${suffix}`,
    callReference: `CAG-${suffix}`,
    ticketReference: `TLP-${suffix}`,
    scenarioCode: scenario.code,
    scenarioTitle: scenario.title,
    unitCode: scenario.unitCode,
    step,
    totalSteps: STEP_COUNT,
    stepLabel: stepLabel(step, scenario),
    nextStepAt: new Date(cycleStartedAt + (step + 1) * STEP_MS).toISOString(),
    engine: "KLINORBIS Worker + D1",
  };
}

async function applyStep(
  db: Db,
  scenario: PilotScenario,
  state: { index: number; runReference: string; callReference: string; ticketReference: string; stepAt: Date },
) {
  const eventId = `${state.runReference}:step:${state.index}`;
  const claimed = await db.insert(integrationEvents).values({
    eventId,
    source: "klinorbis-pilot-orchestrator",
    eventType: `pilot.step.${state.index}`,
    payloadHash: `${scenario.code}:${state.index}`,
    status: "running",
    receivedAt: state.stepAt,
  }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
  if (!claimed.length) return;

  try {
    await executeStep(db, scenario, state);
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
  } catch (error) {
    await db.delete(integrationEvents).where(eq(integrationEvents.eventId, eventId));
    throw error;
  }
}

async function executeStep(
  db: Db,
  scenario: PilotScenario,
  state: { index: number; runReference: string; callReference: string; ticketReference: string; stepAt: Date },
) {
  const unit = findUnit(scenario.unitCode);
  const callTaskReference = `TSK-${state.callReference}`;
  const ticketTaskReference = `TSK-${state.ticketReference}`;
  const message = scenario.messages[Math.min(state.index, scenario.messages.length - 1)];

  if (state.index === 0) {
    await db.insert(callSessions).values({
      reference: state.callReference,
      patientAlias: scenario.patientAlias,
      source: "Canlı pilot senaryo",
      direction: "Gelen",
      status: "ringing",
      unitCode: "CAG",
      assignedRole: "Çağrı Merkezi Görevlisi",
      summary: scenario.summary,
      training: true,
      requiresHuman: scenario.requiresApproval,
      startedAt: state.stepAt,
      lastMessageAt: state.stepAt,
    }).onConflictDoNothing();
  }

  if (message) {
    await db.insert(callMessages).values({
      callReference: state.callReference,
      sequence: state.index + 1,
      speakerType: message.speaker,
      speakerLabel: message.label,
      message: message.text,
      redacted: true,
      createdAt: state.stepAt,
    }).onConflictDoNothing();
    await db.update(callSessions).set({ lastMessageAt: state.stepAt }).where(eq(callSessions.reference, state.callReference));
  }

  if (state.index === 1) {
    await db.update(callSessions).set({ status: "active", lastMessageAt: state.stepAt }).where(eq(callSessions.reference, state.callReference));
  }

  if (state.index === 3) {
    await db.update(callSessions).set({
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      status: scenario.requiresApproval ? "human_handoff" : "active",
      lastMessageAt: state.stepAt,
    }).where(eq(callSessions.reference, state.callReference));
    await db.insert(tickets).values({
      reference: state.ticketReference,
      patientAlias: scenario.patientAlias,
      subject: scenario.requestSubject,
      maskedSubject: scenario.requestSubject,
      detectedPii: "[]",
      urgencyLevel: scenario.priority === "Acil" ? 5 : scenario.priority === "Yüksek" ? 4 : 2,
      humanApprovalRequired: scenario.requiresApproval,
      unit: unit.name,
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      priority: scenario.priority,
      status: "Yeni",
      channel: "Canlı Pilot",
      createdAt: state.stepAt,
      updatedAt: state.stepAt,
      slaDueAt: new Date(state.stepAt.getTime() + unit.slaMinutes * 60_000),
    }).onConflictDoNothing();
    await db.insert(operationalTasks).values([
      {
        reference: callTaskReference,
        callReference: state.callReference,
        unitCode: unit.code,
        assignedRole: unit.assignedRole,
        sourceType: "pilot_call",
        status: "queued",
        priority: scenario.priority,
        dueAt: new Date(state.stepAt.getTime() + unit.slaMinutes * 60_000),
        createdAt: state.stepAt,
        updatedAt: state.stepAt,
      },
      {
        reference: ticketTaskReference,
        ticketReference: state.ticketReference,
        unitCode: unit.code,
        assignedRole: unit.assignedRole,
        sourceType: "pilot_ticket",
        status: "queued",
        priority: scenario.priority,
        dueAt: new Date(state.stepAt.getTime() + unit.slaMinutes * 60_000),
        createdAt: state.stepAt,
        updatedAt: state.stepAt,
      },
    ]).onConflictDoNothing();
    await db.insert(ticketEvents).values({
      ticketReference: state.ticketReference,
      eventType: "pilot_unit_assignment",
      actor: "pilot-orchestrator",
      fromUnitCode: "CAG",
      toUnitCode: unit.code,
      detail: `Kimliksiz pilot talep ${unit.name} kuyruğuna aktarıldı`,
      createdAt: state.stepAt,
    });
  }

  if (state.index === 5) {
    const acceptedBy = `${unit.assignedRole} · pilot rol`;
    await db.update(operationalTasks).set({ status: "accepted", acceptedBy, acceptedAt: state.stepAt, updatedAt: state.stepAt })
      .where(and(eq(operationalTasks.unitCode, unit.code), eq(operationalTasks.callReference, state.callReference)));
    await db.update(operationalTasks).set({ status: "accepted", acceptedBy, acceptedAt: state.stepAt, updatedAt: state.stepAt })
      .where(and(eq(operationalTasks.unitCode, unit.code), eq(operationalTasks.ticketReference, state.ticketReference)));
    await db.update(tickets).set({ status: "Kabul edildi", acceptedBy, acceptedAt: state.stepAt, updatedAt: state.stepAt })
      .where(eq(tickets.reference, state.ticketReference));
    await db.insert(ticketEvents).values({
      ticketReference: state.ticketReference,
      eventType: "pilot_task_accepted",
      actor: acceptedBy,
      toUnitCode: unit.code,
      detail: `${unit.name} pilot rolü görevi kabul etti`,
      createdAt: state.stepAt,
    });
  }

  if (state.index === 6) {
    await db.update(operationalTasks).set({ status: "in_progress", updatedAt: state.stepAt })
      .where(eq(operationalTasks.callReference, state.callReference));
    await db.update(operationalTasks).set({ status: "in_progress", updatedAt: state.stepAt })
      .where(eq(operationalTasks.ticketReference, state.ticketReference));
    await db.update(tickets).set({ status: "İşlemde", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
  }

  if (state.index === 8 && scenario.requiresApproval) {
    await db.insert(approvals).values({
      reference: `ONAY-${state.ticketReference}`,
      ticketReference: state.ticketReference,
      callReference: state.callReference,
      unitCode: unit.code,
      approvalType: scenario.priority === "Acil" ? "Acil insan devri teyidi" : "Yetkili birim doğrulaması",
      status: "pending",
      requestedBy: "pilot-orchestrator",
      createdAt: state.stepAt,
    }).onConflictDoNothing();
    await db.update(callSessions).set({ status: "human_handoff", requiresHuman: true, lastMessageAt: state.stepAt })
      .where(eq(callSessions.reference, state.callReference));
  }

  if (state.index === 9 && !scenario.requiresApproval) {
    await db.update(operationalTasks).set({ status: "completed", updatedAt: state.stepAt }).where(eq(operationalTasks.callReference, state.callReference));
    await db.update(operationalTasks).set({ status: "completed", updatedAt: state.stepAt }).where(eq(operationalTasks.ticketReference, state.ticketReference));
    await db.update(tickets).set({ status: "Çözüldü", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
    await db.update(callSessions).set({ status: "completed", endedAt: state.stepAt, lastMessageAt: state.stepAt }).where(eq(callSessions.reference, state.callReference));
    await db.insert(ticketEvents).values({
      ticketReference: state.ticketReference,
      eventType: "pilot_completed",
      actor: `${unit.assignedRole} · pilot rol`,
      toUnitCode: unit.code,
      detail: "Pilot görev sonuçlandırıldı; görüşme, talep ve görev eş zamanlı kapatıldı",
      createdAt: state.stepAt,
    });
  }

  const rule = ruleForStep(state.index, scenario);
  const outcome = outcomeForStep(state.index, scenario, unit.name, state.ticketReference);
  await db.insert(automationEvents).values({
    ticketReference: state.index < 3 ? state.callReference : state.ticketReference,
    rule,
    outcome,
    unitCode: state.index < 3 ? "CAG" : unit.code,
    eventType: "pilot",
    actor: "pilot-orchestrator",
    createdAt: state.stepAt,
  });
  await db.insert(workflowJobs).values({
    jobKey: `${state.runReference}:job:${state.index}`,
    ticketReference: state.index < 3 ? state.callReference : state.ticketReference,
    ruleCode: state.index === 3 ? "UNIT_ASSIGNMENT" : state.index === 8 && scenario.requiresApproval ? "HUMAN_APPROVAL" : "PILOT_STEP",
    payload: JSON.stringify({ unit: unit.name, unitCode: unit.code, step: state.index, pilot: true }),
    idempotencyKey: `${state.runReference}:job:${state.index}`,
    correlationId: state.runReference,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: state.stepAt,
    createdAt: state.stepAt,
  }).onConflictDoNothing();
  await appendAudit(db, {
    actor: "pilot-orchestrator",
    action: `pilot.${state.index}`,
    resource: state.runReference,
    detail: `${rule} · ${outcome}`,
  });
}

function stepLabel(index: number, scenario: PilotScenario) {
  const labels = [
    "Gelen çağrı güvenli oturuma alındı",
    "Çağrı görevlisi görüşmeyi karşıladı",
    "Arayanın talebi canlı konuşmaya eklendi",
    "Talep sınıflandırıldı ve hedef birim seçildi",
    "Birim görevi ile SLA sayacı açıldı",
    "İlgili birim görevi kabul etti",
    "Birim çalışması başladı",
    "Görüşme ve görev notu eşitlendi",
    scenario.requiresApproval ? "İnsan onayı kapısı açıldı" : "Sonuç hazırlığı tamamlandı",
    scenario.requiresApproval ? "Yetkili insan kararı bekleniyor" : "Görüşme ve görev sonuçlandı",
    scenario.requiresApproval ? "Otomasyon güvenli duraklamada" : "Kapanış denetim izi doğrulandı",
    "Yeni pilot olay döngüsü hazırlanıyor",
  ];
  return labels[index] || labels[labels.length - 1];
}

function ruleForStep(index: number, scenario: PilotScenario) {
  const rules = [
    "Santral olayı → güvenli oturum",
    "Çağrı → görevli karşılama",
    "Canlı konuşma → kalıcı mesaj",
    "Talep → sınıflandırma → birim aktarımı",
    "Birim aktarımı → görev + SLA",
    "Birim kuyruğu → sahiplenme",
    "Sahiplenme → işlem başlangıcı",
    "Konuşma → görev notu eşitleme",
    scenario.requiresApproval ? "Kritik adım → insan onayı" : "İşlem → sonuç hazırlığı",
    scenario.requiresApproval ? "Otomasyon → güvenli bekleme" : "Görev → sonuçlandırma",
    "Denetim zinciri → doğrulama",
    "Pilot döngü → sonraki olay",
  ];
  return rules[index] || "Pilot otomasyon adımı";
}

function outcomeForStep(index: number, scenario: PilotScenario, unitName: string, ticketReference: string) {
  const outcomes = [
    `${scenario.title} için kimliksiz görüşme açıldı`,
    "Çağrı görevlisi görüşmeyi canlı çalışma masasında karşıladı",
    "Arayanın ifadesi maskeleme denetiminden sonra konuşma kaydına eklendi",
    `${ticketReference} oluşturuldu ve ${unitName} kuyruğuna aktarıldı`,
    `${unitName} için görev ve SLA sayacı açıldı`,
    `${unitName} pilot rolü görevi kabul etti`,
    `${unitName} çalışma masasında işlem başladı`,
    "Görüşme, görev ve talep zaman çizelgesi eşitlendi",
    scenario.requiresApproval ? "Otomasyon durdu; yetkili insan onayı bekleniyor" : "Birim sonuç taslağını hazırladı",
    scenario.requiresApproval ? "Kayıt otomatik kapatılmadı" : "Görev, talep ve görüşme birlikte sonuçlandırıldı",
    "Hash zincirli denetim izi kaydedildi",
    "Sonraki kimliksiz pilot olay döngüsü hazır",
  ];
  return outcomes[index] || "Pilot adım tamamlandı";
}
