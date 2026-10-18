// Kurulum profili (ADR-001): Cloudflare üzerinde çalışan bu sürüm "bulut demo/pilot" profilidir ve yalnız kurgusal
// (sentetik) veriyle kullanılır. Gerçek hasta ile ilişkili her kayıt Türkiye çekirdeğinde (core/, PostgreSQL;
// hastane içi veya Türkiye'deki veri merkezi) işlenir. Bu ayrım SBYS md.16(3), KVKK m.9 ve Genelge 2019/12 gereği
// Faz 0 araştırmasında alınan ürün kararıdır.
export const CLOUD_PROFILE = {
  key: "bulut-demo",
  label: "Bulut demo ortamı",
  realPatientData: false,
  notice: "Bu ortam bulut demo ortamıdır: yalnız kurgusal veri girin. Gerçek hasta verisi Türkiye'deki çekirdek kurulumda işlenir.",
} as const;
