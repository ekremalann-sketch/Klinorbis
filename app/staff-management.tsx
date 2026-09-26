"use client";
// Personel ve Yetki ekranının çalışan kısmı: "Benim işim", personel yönetimi (yalnız
// operasyon yöneticisi) ve gerçek vardiya devri. Tüm kurallar sunucuda uygulanır;
// bu bileşen yalnız sunucunun izin verdiği işlemleri gösterir.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ROLE_MAP, type RoleKey } from "../lib/role-map";

type Unit = { code: string; name: string; assignedRole: string };
type Member = { unitCode: string; unitRole: string };
type Staff = { email: string; displayLabel: string; systemRole: RoleKey; active: boolean; lastSeenAt: string | null; memberships: Member[] };
type StaffData = { me: { email: string; role: RoleKey; unitCodes: string[] }; units: Unit[]; staff: Staff[] };
type Handoff = { id: number; unitCode: string; fromEmail: string; toEmail: string; note: string; status: "pending" | "accepted" | "declined" | "cancelled"; openTickets: number; openTasks: number; movedTickets: number; movedTasks: number; createdAt: string; decidedAt: string | null };
type ShiftData = { me: { email: string; role: RoleKey; canHandoff: boolean }; handoffs: Handoff[]; colleagues: { email: string; unitCode: string; label: string; role: RoleKey }[]; openWork: { unitCode: string; tickets: string[]; tasks: string[] }[] };

const UNIT_ROLES: RoleKey[] = ["unit_manager", "clinician", "call_agent"];
const STATUS: Record<Handoff["status"], string> = { pending: "Bekliyor", accepted: "Kabul edildi", declined: "Reddedildi", cancelled: "İptal edildi" };
const time = (v: string | number | null) => (v ? new Date(v).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}

export function StaffManagement() {
  const [staff, setStaff] = useState<StaffData | null>(null);
  const [shifts, setShifts] = useState<ShiftData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Sunucudan okuma; durum yalnız istek dönünce (geri çağrıda) güncellenir.
  const fetchAll = useCallback(() => Promise.all([call<StaffData>("/api/staff"), call<ShiftData>("/api/shifts")]), []);
  const load = useCallback(async () => {
    try { const [a, b] = await fetchAll(); setStaff(a); setShifts(b); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Bilgiler alınamadı."); }
  }, [fetchAll]);
  useEffect(() => {
    let alive = true;
    fetchAll().then(([a, b]) => { if (alive) { setStaff(a); setShifts(b); } })
      .catch((cause) => { if (alive) setMessage(cause instanceof Error ? cause.message : "Bilgiler alınamadı."); });
    return () => { alive = false; };
  }, [fetchAll]);

  async function run(url: string, body: unknown, done: string) {
    setBusy(true); setMessage("");
    try { await call(url, body); setMessage(done); await load(); return true; }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); return false; }
    finally { setBusy(false); }
  }

  if (!staff) return <section className="panel sm-panel"><p role="status">{message || "Personel bilgileri yükleniyor…"}</p></section>;
  const role = ROLE_MAP[staff.me.role];
  const unitName = (code: string) => staff.units.find((u) => u.code === code)?.name || code;

  return (
    <div className="sm-stack">
      <p className="sm-message" role="status" aria-live="polite">{message}</p>

      <section className="panel sm-panel" aria-labelledby="sm-me">
        <div className="panel-head"><div><h3 id="sm-me">Benim işim</h3><p>{role.title} · {staff.me.unitCodes.length ? staff.me.unitCodes.map(unitName).join(", ") : "Tüm birimler"}</p></div>
          <a className="sm-button" href={role.homePath}>Çalışma alanıma git →</a></div>
        <div className="sm-columns">
          <div><h4>Yapabildiklerim</h4><ul>{role.does.map((d) => <li key={d}>{d}</li>)}</ul></div>
          <div><h4>Sınırlar</h4><ul>{role.cannot.map((d) => <li key={d}>{d}</li>)}</ul></div>
        </div>
      </section>

      {shifts && <HandoffPanel data={shifts} unitName={unitName} busy={busy} run={run} />}

      {staff.me.role === "operations_manager" && <StaffAdmin data={staff} busy={busy} run={run} unitName={unitName} />}

      <section className="panel sm-panel" aria-labelledby="sm-map">
        <div className="panel-head"><div><h3 id="sm-map">Rol haritası: kim nerede çalışır</h3><p>Yetki sunucuda uygulanır; tarayıcıdan rol seçilemez.</p></div></div>
        <div className="sm-role-grid">
          {(Object.keys(ROLE_MAP) as RoleKey[]).map((key) => (
            <article key={key} className={key === staff.me.role ? "mine" : ""}>
              <b>{ROLE_MAP[key].title}</b>
              <small>Çalışma yeri: {ROLE_MAP[key].home}</small>
              <ul>{ROLE_MAP[key].does.map((d) => <li key={d}>{d}</li>)}</ul>
              <p><em>Yapamaz:</em> {ROLE_MAP[key].cannot.join(" ")}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HandoffPanel({ data, unitName, busy, run }: { data: ShiftData; unitName: (c: string) => string; busy: boolean; run: (u: string, b: unknown, d: string) => Promise<boolean> }) {
  const [unitCode, setUnitCode] = useState(data.openWork[0]?.unitCode || "");
  const [toEmail, setToEmail] = useState("");
  const [note, setNote] = useState("");
  const candidates = useMemo(() => data.colleagues.filter((c) => c.unitCode === unitCode), [data, unitCode]);
  const work = data.openWork.find((w) => w.unitCode === unitCode);
  const incoming = data.handoffs.filter((h) => h.status === "pending" && h.toEmail === data.me.email);
  const outgoing = data.handoffs.filter((h) => h.status === "pending" && h.fromEmail === data.me.email);
  const managerView = data.me.role === "operations_manager";

  async function start(event: FormEvent) {
    event.preventDefault();
    if (await run("/api/shifts", { action: "start", unitCode, toEmail, note }, "Devir başlatıldı; devralan kişi kabul edince işler ona geçer.")) { setNote(""); setToEmail(""); }
  }

  return (
    <section className="panel sm-panel" aria-labelledby="sm-handoff">
      <div className="panel-head"><div><h3 id="sm-handoff">Vardiya devri</h3><p>Giden görevli başlatır, gelen görevli kabul eder. Kabulde açık talep ve görevler devralana geçer; her adım denetim izine yazılır.</p></div></div>

      {incoming.map((h) => (
        <div key={h.id} className="sm-incoming" role="group" aria-label={`Size gelen devir ${h.id}`}>
          <p><b>Size devir var:</b> {h.fromEmail} · {unitName(h.unitCode)} · {h.openTickets} açık talep, {h.openTasks} görev</p>
          {h.note && <p className="sm-note">Not: {h.note}</p>}
          <div className="sm-actions">
            <button disabled={busy} onClick={() => void run("/api/shifts", { action: "accept", id: h.id }, "Devri aldınız; işler artık sizde.")}>Devri al</button>
            <button className="secondary" disabled={busy} onClick={() => void run("/api/shifts", { action: "decline", id: h.id }, "Devir reddedildi.")}>Reddet</button>
          </div>
        </div>
      ))}

      {data.me.canHandoff && data.openWork.length > 0 && (
        <form className="sm-form" onSubmit={start}>
          <label>Birim
            <select value={unitCode} onChange={(e) => { setUnitCode(e.target.value); setToEmail(""); }}>
              {data.openWork.map((w) => <option key={w.unitCode} value={w.unitCode}>{unitName(w.unitCode)}</option>)}
            </select>
          </label>
          <label>Devralacak görevli
            <select value={toEmail} onChange={(e) => setToEmail(e.target.value)} required>
              <option value="">Seçin</option>
              {candidates.map((c) => <option key={c.email} value={c.email}>{c.label} · {ROLE_MAP[c.role]?.title || c.role}</option>)}
            </select>
          </label>
          <label className="sm-wide">Devir notu <small>(hasta kimliği yazmayın; TCKN, telefon ve e-posta otomatik maskelenir)</small>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </label>
          <p className="sm-wide">Devredilecek: <b>{work?.tickets.length ?? 0}</b> açık talep, <b>{work?.tasks.length ?? 0}</b> görev.</p>
          {!candidates.length && <p className="sm-wide sm-warn">Bu birimde devralabilecek başka etkin görevli yok. Operasyon yöneticisinden birim ataması isteyin.</p>}
          <button className="sm-wide-button" disabled={busy || !toEmail}>Devri başlat</button>
        </form>
      )}
      {!data.me.canHandoff && !managerView && <p className="sm-muted">Rolünüz gözetim rolüdür; devir yapmaz, devir kayıtlarını denetim izinden izler.</p>}

      {outgoing.map((h) => (
        <div key={h.id} className="sm-outgoing"><span>Bekleyen devriniz: {h.toEmail} · {unitName(h.unitCode)}</span>
          <button className="secondary" disabled={busy} onClick={() => void run("/api/shifts", { action: "cancel", id: h.id }, "Devir iptal edildi.")}>İptal et</button></div>
      ))}

      <div className="sm-table" role="table" aria-label="Devir geçmişi">
        <div role="row" className="head"><span role="columnheader">Birim</span><span role="columnheader">Giden → Devralan</span><span role="columnheader">Durum</span><span role="columnheader">İş</span><span role="columnheader">Zaman</span>{managerView && <span role="columnheader">İşlem</span>}</div>
        {data.handoffs.map((h) => (
          <div role="row" key={h.id}>
            <span role="cell">{unitName(h.unitCode)}</span>
            <span role="cell">{h.fromEmail} → {h.toEmail}</span>
            <span role="cell"><em className={`sm-state ${h.status}`}>{STATUS[h.status]}</em></span>
            <span role="cell">{h.status === "accepted" ? `${h.movedTickets} talep, ${h.movedTasks} görev taşındı` : `${h.openTickets} talep, ${h.openTasks} görev`}</span>
            <span role="cell">{time(h.decidedAt || h.createdAt)}</span>
            {managerView && <span role="cell">{h.status === "pending" && <button className="secondary" disabled={busy} onClick={() => void run("/api/shifts", { action: "cancel", id: h.id }, "Devir iptal edildi.")}>İptal et</button>}</span>}
          </div>
        ))}
        {!data.handoffs.length && <div role="row"><span role="cell" className="sm-muted">Henüz devir kaydı yok.</span></div>}
      </div>
    </section>
  );
}

function StaffAdmin({ data, busy, run, unitName }: { data: StaffData; busy: boolean; run: (u: string, b: unknown, d: string) => Promise<boolean>; unitName: (c: string) => string }) {
  const empty = { email: "", displayLabel: "", systemRole: "call_agent" as RoleKey, units: [] as string[] };
  const [form, setForm] = useState(empty);
  const needsUnit = UNIT_ROLES.includes(form.systemRole);
  const editing = data.staff.some((s) => s.email === form.email.trim().toLowerCase());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run("/api/staff", {
      action: "save", email: form.email, displayLabel: form.displayLabel, systemRole: form.systemRole,
      memberships: needsUnit ? form.units.map((unitCode) => ({ unitCode })) : [],
    }, editing ? "Personel güncellendi." : "Personel eklendi. Kişi platform hesabıyla girdiğinde bu rolle çalışır.");
    if (ok) setForm(empty);
  }
  function edit(s: Staff) { setForm({ email: s.email, displayLabel: s.displayLabel, systemRole: s.systemRole, units: s.memberships.map((m) => m.unitCode) }); }
  const toggle = (code: string) => setForm((f) => ({ ...f, units: f.units.includes(code) ? f.units.filter((u) => u !== code) : [...f.units, code] }));

  return (
    <section className="panel sm-panel" aria-labelledby="sm-admin">
      <div className="panel-head"><div><h3 id="sm-admin">Personel ekle ve yetkilendir</h3><p>Parola yok: kişi Sites&apos;a kendi hesabıyla girer; burada yalnız rolü ve birimleri belirlenir. Siteye erişim ayrıca Sites paylaşım ayarından verilmelidir.</p></div></div>
      <form className="sm-form" onSubmit={submit}>
        <label>İş e-postası<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
        <label>Görünen ad / ekip etiketi<input required minLength={2} maxLength={80} value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} /></label>
        <label>Rol
          <select value={form.systemRole} onChange={(e) => setForm({ ...form, systemRole: e.target.value as RoleKey })}>
            {(Object.keys(ROLE_MAP) as RoleKey[]).map((key) => <option key={key} value={key}>{ROLE_MAP[key].title}</option>)}
          </select>
        </label>
        <p className="sm-hint">{ROLE_MAP[form.systemRole].home} · {needsUnit ? "En az bir birim seçin." : "Tüm birimleri kapsar; birim seçilmez."}</p>
        {needsUnit && (
          <fieldset className="sm-wide sm-units"><legend>Birimler</legend>
            {data.units.map((u) => <label key={u.code} className="sm-check"><input type="checkbox" checked={form.units.includes(u.code)} onChange={() => toggle(u.code)} />{u.name}</label>)}
          </fieldset>
        )}
        <div className="sm-wide sm-actions">
          <button disabled={busy || (needsUnit && !form.units.length)}>{editing ? "Değişiklikleri kaydet" : "Personeli ekle"}</button>
          {form.email && <button type="button" className="secondary" onClick={() => setForm(empty)}>Formu temizle</button>}
        </div>
      </form>
      <div className="sm-table" role="table" aria-label="Personel listesi">
        <div role="row" className="head"><span role="columnheader">Personel</span><span role="columnheader">Rol</span><span role="columnheader">Birimler</span><span role="columnheader">Durum</span><span role="columnheader">İşlem</span></div>
        {data.staff.map((s) => (
          <div role="row" key={s.email} className={s.active ? "" : "inactive"}>
            <span role="cell"><b>{s.displayLabel}</b><small>{s.email}</small></span>
            <span role="cell">{ROLE_MAP[s.systemRole]?.title || s.systemRole}</span>
            <span role="cell">{s.memberships.length ? s.memberships.map((m) => unitName(m.unitCode)).join(", ") : "Tüm ağ"}</span>
            <span role="cell"><em className={`sm-state ${s.active ? "accepted" : "cancelled"}`}>{s.active ? "Etkin" : "Pasif"}</em></span>
            <span role="cell" className="sm-actions">
              <button className="secondary" onClick={() => edit(s)}>Düzenle</button>
              {s.active && s.email !== data.me.email && <button className="secondary" disabled={busy} onClick={() => void run("/api/staff", { action: "deactivate", email: s.email }, "Personel pasife alındı; erişimi hemen kapandı.")}>Pasife al</button>}
            </span>
          </div>
        ))}
        {!data.staff.length && <div role="row"><span role="cell" className="sm-muted">Henüz personel eklenmedi. Şu an sisteme yalnız site sahibi girebilir.</span></div>}
      </div>
    </section>
  );
}
