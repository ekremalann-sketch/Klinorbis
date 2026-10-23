"use client";
// "Operasyon": operasyon yöneticisinin ilk bakışı — yalnız müdahale gerektirenler. Ayrıntılı pano istenince açılır.
// Entegrasyon ve sistem ayarları burada yer almaz (Diğer ekranlar altında).
import { StaleBanner, StateBox, useLive } from "./work-ui";

type Item = { reference: string; kind: "engel" | "yukselme" | "yardim" | "sahipsiz"; title: string; unitName: string; location: string | null; reason: string; lateMinutes: number; owner: string; next: string; link: string };
type Data = {
  items: Item[]; counts: Record<string, number>; unassignedTotal: number;
  waiting: { reference: string; title: string; waitingAt: string; task: string; lateMinutes: number; next: string }[];
  beds: { total: number; occupied: number; reserved: number; blocked: number; cleaning: number; available: number; reasons: { label: string; value: number }[]; source: string };
};
const KIND: Record<Item["kind"], string> = { engel: "Engel", yukselme: "Yönetime yükseldi", yardim: "Yardım istendi", sahipsiz: "Sahipsiz · gecikmiş" };
const late = (m: number) => (m <= 0 ? "" : m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk gecikme` : `${m} dk gecikme`);
const go = (path: string) => window.dispatchEvent(new CustomEvent("klinorbis:go", { detail: path }));

export function OpsFocus({ showDetail, detailOpen }: { showDetail: () => void; detailOpen: boolean }) {
  const live = useLive<Data>("/api/operations-focus");
  const d = live.data;
  return (
    <section className="wk" aria-labelledby="of-title">
      <div className="wk-head">
        <div>
          <h2 id="of-title">Müdahale gerektirenler</h2>
          <p>Yalnız sizin karar vermeniz gereken konular. Rutin işler birimlerde ilerliyor.</p>
        </div>
        <button type="button" className="wk-secondary" aria-expanded={detailOpen} onClick={showDetail}>{detailOpen ? "Ayrıntılı panoyu gizle" : "Ayrıntılı panoyu göster"}</button>
      </div>
      <StaleBanner live={live} />
      <StateBox live={live}>
        {d && <>
          <nav className="wk-summary" aria-label="Özet">
            <a href="#of-items" className={d.items.length ? "" : "wk-zero"}><b>{d.items.length}</b><span>Müdahale bekleyen</span></a>
            <a href="#of-waiting" className={d.waiting.length ? "" : "wk-zero"}><b>{d.waiting.length}</b><span>Birimler arası bekleyen</span></a>
            <a href="#of-beds"><b>{d.beds.available}</b><span>Kullanılabilir yatak</span></a>
            <button type="button" onClick={() => go("/birimim")} className={d.unassignedTotal ? "" : "wk-zero"}><b>{d.unassignedTotal}</b><span>Sahipsiz iş (tümü)</span></button>
          </nav>
          <div className="wk-group" id="of-items">
            <h3>Müdahale bekleyen işler <span className="wk-count">{d.items.length}</span></h3>
            {d.items.length === 0 ? <p className="wk-empty-line">Şu an yönetim müdahalesi gerektiren iş yok.</p> :
              d.items.map((i) => <article key={i.reference} className="wk-card">
                <header><b>{i.title}</b><span className="wk-tag">{KIND[i.kind]}</span></header>
                <dl className="wk-facts">
                  <div><dt>Nerede</dt><dd>{i.location ? `${i.location} · ` : ""}{i.unitName}</dd></div>
                  <div><dt>Kimde</dt><dd>{i.owner}</dd></div>
                  {i.lateMinutes > 0 && <div><dt>Durum</dt><dd className="wk-overdue">⚠ {late(i.lateMinutes)}</dd></div>}
                </dl>
                <p className="wk-meta">{i.reason}</p>
                <p className="wk-next"><span>Önerilen:</span> {i.next}</p>
                <div className="wk-actions"><button type="button" className="wk-primary" onClick={() => go(i.link)}>Birimde aç</button></div>
              </article>)}
          </div>
          <div className="wk-group" id="of-waiting">
            <h3>Birimler arası bekleyen akışlar <span className="wk-count">{d.waiting.length}</span></h3>
            {d.waiting.length === 0 ? <p className="wk-empty-line">Hedef süresini aşan akış adımı yok.</p> :
              <ul className="wk-list">{d.waiting.map((w) => <li key={w.reference}><b>{w.title}</b> — <span>{w.waitingAt}</span> birimindeki “{w.task}” adımı {late(w.lateMinutes)}; sonra: {w.next}. <button type="button" className="wk-link" onClick={() => go("/playbooks")}>Akışı aç</button></li>)}</ul>}
          </div>
          <div className="wk-group" id="of-beds">
            <h3>Yatak kullanılabilirliği</h3>
            <p className="wk-beds"><b>{d.beds.available}</b> / {d.beds.total} yatak şu an kullanılabilir.</p>
            {d.beds.reasons.length > 0 && <>
              <p className="wk-note">Kullanılamayan yatakların nedeni:</p>
              <ul className="wk-bars">{d.beds.reasons.map((r) => <li key={r.label}><span>{r.label}</span><b>{r.value}</b><i style={{ width: `${d.beds.total ? Math.max(2, (r.value / d.beds.total) * 100) : 0}%` }} aria-hidden="true" /></li>)}</ul>
            </>}
            <p className="wk-hint">Kaynak: {d.beds.source}. Gerçek zamanlı yatak durumu HBYS bağlantısı kurulduğunda Türkiye çekirdeğinden gelir; bu ekran HBYS’ye bağlıymış gibi davranmaz.</p>
            <button type="button" className="wk-secondary" onClick={() => go("/capacity")}>Kapasite ayrıntısı</button>
          </div>
        </>}
      </StateBox>
    </section>
  );
}
