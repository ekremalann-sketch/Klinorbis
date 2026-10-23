"use client";
// Günlük iş ekranlarının (İşlerim, Birimim, Operasyon) ortak parçaları:
//  - api(): sunucu çağrısı; ağ kesilirse yazma sonucunu "bilinmiyor" olarak bildirir (körlemesine tekrar gönderme yok)
//  - useLive(): veri + durum (yükleniyor / hazır / yetki yok / hata) + bağlantı koparsa "güncel değil" işareti
//  - FormDialog: tarayıcı prompt/alert yerine erişilebilir form penceresi (Esc ile kapanır, odak içeride kalır,
//    gönderim sürerken düğme kilitli, hata olursa yazılan içerik korunur)
//  - StateBox: boş / yükleniyor / erişim reddi / hata durumları ayrı ayrı
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

/** Yazma işlemi: ağ hatasında "sonuç bilinmiyor" (UNCERTAIN) döner; kullanıcıya önce listeyi yenilemesi söylenir. */
export async function api<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
  } catch {
    if (body === undefined) throw new ApiError("Sunucuya ulaşılamadı.", "NETWORK", 0);
    throw new ApiError("Bağlantı kesildi; işlemin kaydedilip kaydedilmediği bilinmiyor. Tekrar göndermeden önce listeyi yenileyip kontrol edin.", "UNCERTAIN", 0);
  }
  let data: (T & { error?: string; code?: string }) | null = null;
  try { data = await response.json() as T & { error?: string; code?: string }; } catch { /* boş gövde */ }
  if (!response.ok) throw new ApiError(data?.error || "İşlem tamamlanamadı.", data?.code || "ERROR", response.status);
  return data as T;
}

export type LiveState<T> = { data: T | null; status: "loading" | "ready" | "denied" | "error"; error: string; stale: boolean; updatedAt: number | null; reload: () => Promise<void> };

/** Veriyi alır ve aralıklarla tazeler. Bağlantı koparsa son veri "güncel değil" işaretiyle kalır. */
export function useLive<T>(url: string | null, everyMs = 20_000): LiveState<T> {
  // forUrl: verinin hangi adrese ait olduğu. Adres değişince (ör. başka birim seçildi) eski veri gösterilmez.
  const [state, setState] = useState<Omit<LiveState<T>, "reload"> & { forUrl: string | null }>({ data: null, status: "loading", error: "", stale: false, updatedAt: null, forUrl: null });
  const inFlight = useRef<string | null>(null);
  const reload = useCallback(async () => {
    if (!url || inFlight.current === url) return;
    inFlight.current = url;
    try {
      const data = await api<T>(url);
      setState({ data, status: "ready", error: "", stale: false, updatedAt: Date.now(), forUrl: url });
    } catch (error) {
      const e = error as ApiError;
      setState((prev) => e.status === 401 || e.status === 403
        ? { data: null, status: "denied", error: e.message, stale: false, updatedAt: prev.updatedAt, forUrl: url }
        : prev.data && prev.forUrl === url ? { ...prev, stale: true, error: e.message } : { data: null, status: "error", error: e.message, stale: false, updatedAt: null, forUrl: url });
    } finally { if (inFlight.current === url) inFlight.current = null; }
  }, [url]);
  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, everyMs);
    const onRefresh = () => void reload();
    window.addEventListener("klinorbis:refresh", onRefresh);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("klinorbis:refresh", onRefresh); };
  }, [reload, everyMs]);
  if (state.forUrl !== url) return { data: null, status: "loading", error: "", stale: false, updatedAt: null, reload };
  const { forUrl: _ignored, ...rest } = state;
  void _ignored;
  return { ...rest, reload };
}

export function StaleBanner({ live }: { live: LiveState<unknown> }) {
  if (!live.stale) return null;
  const at = live.updatedAt ? new Date(live.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—";
  return <div className="wk-stale" role="alert"><b>Bağlantı kesildi.</b> Gösterilen bilgiler {at} itibarıyla; güncel olmayabilir. <button type="button" onClick={() => void live.reload()}>Yeniden dene</button></div>;
}

export function StateBox({ live, children, empty, emptyText }: { live: LiveState<unknown>; children: ReactNode; empty?: boolean; emptyText?: string }) {
  if (live.status === "loading") return <div className="wk-state" role="status" aria-live="polite"><span className="wk-spin" aria-hidden="true" />Yükleniyor…</div>;
  if (live.status === "denied") return <div className="wk-state wk-denied" role="alert"><b>Bu ekrana erişiminiz yok.</b><span>{live.error}</span></div>;
  if (live.status === "error") return <div className="wk-state wk-error" role="alert"><b>Bilgiler alınamadı.</b><span>{live.error}</span><button type="button" onClick={() => void live.reload()}>Tekrar dene</button></div>;
  if (empty) return <div className="wk-state wk-empty"><span>{emptyText ?? "Şu an bekleyen iş yok."}</span></div>;
  return <>{children}</>;
}

/** Erişilebilir form penceresi. onSubmit hata fırlatırsa pencere açık kalır ve içerik korunur. */
export function FormDialog({ open, title, description, submitLabel, danger, onClose, onSubmit, children, submitDisabled }: {
  open: boolean; title: string; description?: ReactNode; submitLabel: string; danger?: boolean; submitDisabled?: boolean;
  onClose: () => void; onSubmit: () => Promise<void>; children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setError(""); d.showModal(); window.setTimeout(() => (d.querySelector("input:not([type=hidden]),select,textarea,button[data-autofocus]") as HTMLElement | null)?.focus(), 0); }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="wk-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      <form method="dialog" onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try { await onSubmit(); } catch (err) { setError(err instanceof Error ? err.message : "İşlem tamamlanamadı."); } finally { setBusy(false); }
      }}>
        <h2 id={titleId}>{title}</h2>
        {description && <div className="wk-dialog-desc">{description}</div>}
        {children}
        {error && <p className="wk-form-error" role="alert">{error}</p>}
        <div className="wk-dialog-actions">
          <button type="button" className="wk-secondary" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="submit" className={danger ? "wk-danger" : "wk-primary"} disabled={busy || submitDisabled} aria-busy={busy}>{busy ? "Gönderiliyor…" : submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}

export function Req() { return <em className="wk-req">zorunlu</em>; }
export function Opt() { return <em className="wk-opt">isteğe bağlı</em>; }

export function dueText(minutesLeft: number | null, overdue: boolean) {
  if (minutesLeft === null) return null;
  const m = Math.abs(minutesLeft);
  const t = m >= 1440 ? `${Math.round(m / 1440)} gün` : m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60 ? `${m % 60} dk` : ""}`.trim() : `${m} dk`;
  return overdue ? `${t} gecikti` : `${t} kaldı`;
}

/** Başarılı işlemden sonra: ne değişti + sonraki adım. role=status ile ekran okuyucuya okunur. */
export function Receipt({ text, onClose }: { text: string; onClose: () => void }) {
  if (!text) return null;
  return <div className="wk-receipt" role="status"><span aria-hidden="true">✓</span><p>{text}</p><button type="button" onClick={onClose} aria-label="Bildirimi kapat">✕</button></div>;
}
