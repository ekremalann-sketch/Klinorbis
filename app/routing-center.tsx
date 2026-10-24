"use client";
// Birimler ve Yönlendirme: "Hangi talep hangi birime gider, orada işi kim dağıtır?" sorusunun tek cevabı.
//  - Talep yönlendirme: her talep türü tek birime gider; bilgi işlem / operasyon yöneticisi buradan değiştirir.
//  - Birim rehberi: birimler 6 sade grupta; her birimin hizmetleri (ör. Radyoloji: röntgen, BT, MR), sorumlusu, ekibi ve açık işleri.
// Yetki sunucuda denetlenir (lib/routing.ts); düzenleme hakkı olmayan kişi yalnız görür.
import { useMemo, useState } from "react";
import { api, Receipt, StaleBanner, StateBox, useLive } from "./work-ui";

type TypeRow = { code: string; label: string; hint: string; clinicalNote: string | null; unit: { code: string; name: string }; defaultUnit: { code: string; name: string }; overridden: boolean; dispatchers: string[] };
type UnitRow = { code: string; name: string; scope: string; services: string[]; dispatchers: string[]; members: number; open: number; unassigned: number; receives: string[] };
type Data = {
  canEdit: boolean;
  typeGroups: { group: string; types: TypeRow[] }[];
  directory: { key: string; label: string; hint: string; units: UnitRow[] }[];
  unitOptions: { code: string; name: string; group: string }[];
};

export function RoutingCenter() {
  const live = useLive<Data>("/api/routing", 60_000);
  const [tab, setTab] = useState<"routes" | "units">("routes");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [openGroup, setOpenGroup] = useState<string>("");
  const d = live.data;
  const term = q.toLocaleLowerCase("tr-TR").trim();
  const match = (...xs: (string | undefined)[]) => !term || xs.some((x) => x?.toLocaleLowerCase("tr-TR").includes(term));
  const dir = useMemo(() => (d?.directory ?? []).map((g) => ({ ...g, units: g.units.filter((u) => match(u.name, u.scope, ...u.services, ...u.receives)) })), [d, term]); // eslint-disable-line react-hooks/exhaustive-deps

  async function change(t: TypeRow, unitCode: string) {
    if (busy) return;
    setBusy(t.code); setError("");
    try {
      const r = await api<{ unit: { name: string } }>("/api/routing", unitCode === t.defaultUnit.code ? { action: "reset", code: t.code } : { action: "set", code: t.code, unitCode });
      setReceipt(`“${t.label}” talepleri artık ${r.unit.name} birimine gidecek. Açık işler yerinde kalır; yalnız yeni talepler etkilenir.`);
      await live.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Değiştirilemedi."); }
    finally { setBusy(""); }
  }

  return (
    <section className="wk wk-wide" aria-labelledby="rc-title">
      <div className="wk-head">
        <div>
          <h2 id="rc-title">Birimler ve Yönlendirme</h2>
          <p>Her talep tek bir birime gider; orada işi <b>birim sorumlusu</b> dağıtır ya da ekipten biri kabul eder. Tetkik, görüntüleme, kan ürünü ve ilaç <b>istemleri</b> HBYS’de hekim tarafından yapılır; burada yalnız lojistik ve koordinasyon yönlendirilir.</p>
        </div>
        <label className="wk-field wk-inline"><span>Ara</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. MR, kan alma, yazıcı" /></label>
      </div>
      <div className="wk-tabs" role="tablist" aria-label="Görünüm">
        <button type="button" role="tab" aria-selected={tab === "routes"} className={tab === "routes" ? "on" : ""} onClick={() => setTab("routes")}>Talep yönlendirme</button>
        <button type="button" role="tab" aria-selected={tab === "units"} className={tab === "units" ? "on" : ""} onClick={() => setTab("units")}>Birim rehberi</button>
      </div>
      <StaleBanner live={live} />
      <Receipt text={receipt} onClose={() => setReceipt("")} />
      {error && <div className="wk-alert" role="alert"><b>Değişiklik yapılmadı.</b> {error}</div>}
      <StateBox live={live}>
        {d && tab === "routes" && <>
          {!d.canEdit && <p className="wk-note">Yönlendirmeyi operasyon yöneticisi, bilgi güvenliği yetkilisi veya Bilgi Teknolojileri birim sorumlusu değiştirir. Siz görüntülüyorsunuz.</p>}
          {d.typeGroups.map((g) => {
            const rows = g.types.filter((t) => match(t.label, t.hint, t.unit.name));
            if (!rows.length) return null;
            return <div key={g.group} className="wk-group">
              <h3>{g.group}</h3>
              <div className="rc-table" role="table" aria-label={g.group}>
                <div className="rc-row rc-headrow" role="row"><span role="columnheader">Talep</span><span role="columnheader">Gideceği birim</span><span role="columnheader">İşi dağıtan</span></div>
                {rows.map((t) => <div key={t.code} className="rc-row" role="row">
                  <span role="cell"><b>{t.label}</b><small>{t.hint}</small></span>
                  <span role="cell">
                    {d.canEdit ? <select aria-label={`${t.label} için birim`} value={t.unit.code} disabled={busy === t.code} onChange={(e) => void change(t, e.target.value)}>
                      {d.unitOptions.map((u) => <option key={u.code} value={u.code}>{u.name}{u.code === t.defaultUnit.code ? " (varsayılan)" : ""}</option>)}
                    </select> : <b>{t.unit.name}</b>}
                    {t.overridden && <small className="rc-changed">Kurum değiştirdi · varsayılan: {t.defaultUnit.name}</small>}
                  </span>
                  <span role="cell">{t.dispatchers.length ? t.dispatchers.join(", ") : <em className="rc-warn">Sorumlu yok — operasyon yöneticisi dağıtır</em>}</span>
                </div>)}
              </div>
            </div>;
          })}
        </>}
        {d && tab === "units" && <>
          <nav className="wk-summary" aria-label="Birim grupları">
            {dir.map((g) => <a key={g.key} href={`#rc-${g.key}`} onClick={() => setOpenGroup(g.key)}><b>{g.units.length}</b><span>{g.label}</span></a>)}
          </nav>
          {dir.map((g) => g.units.length > 0 && <details key={g.key} id={`rc-${g.key}`} className="rc-group" open={!!term || openGroup === g.key || g.key === "tani"}>
            <summary><b>{g.label}</b> <span className="wk-count">{g.units.length}</span><small>{g.hint}</small></summary>
            <div className="rc-units">
              {g.units.map((u) => <article key={u.code} className="wk-card wk-card-compact">
                <header><b>{u.name}</b>{u.unassigned > 0 && <span className="wk-tag">{u.unassigned} sahipsiz</span>}</header>
                <p className="wk-meta">{u.scope}</p>
                {u.services.length > 0 && <ul className="rc-chips" aria-label="Hizmetler">{u.services.map((s) => <li key={s}>{s}</li>)}</ul>}
                <dl className="wk-facts">
                  <div><dt>İşi dağıtan</dt><dd>{u.dispatchers.length ? u.dispatchers.join(", ") : "Sorumlu tanımlı değil"}</dd></div>
                  <div><dt>Ekip</dt><dd>{u.members} kişi</dd></div>
                  <div><dt>Açık iş</dt><dd>{u.open}</dd></div>
                </dl>
                {u.receives.length > 0 && <p className="wk-next"><span>Gelen talepler:</span> {u.receives.join(", ")}</p>}
              </article>)}
            </div>
          </details>)}
        </>}
      </StateBox>
    </section>
  );
}
