"use client";
// "Bu ekranda ne yapılır?" kutusu: her ekranın üstünde, katlanabilir. İlk ziyarette kapalı gelir; kapatılınca
// tarayıcı bunu hatırlar. İçerik lib/screen-help.ts'den gelir (kullanım kılavuzuyla aynı kaynak).
import { useState, useSyncExternalStore } from "react";
import { SCREEN_HELP } from "../lib/screen-help";

export function ScreenHelpBox({ view }: { view: string }) {
  const help = SCREEN_HELP[view];
  const key = `klinorbis-help-seen:${view}`;
  // Açık/kapalı ilk durum ilk çizimde belirlenir (efektle sonradan açılınca sayfa aşağı kayıyordu: CLS).
  // Sunucu çiziminde kapalı kabul edilir; tarayıcıda localStorage'dan okunur.
  const seen = useSyncExternalStore(noopSubscribe, () => readSeen(key), () => true);
  const [manual, setOpen] = useState<boolean | null>(null);
  const open = manual ?? false;
  if (!help) return null;
  return (
    <details className="screen-help" open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); if (!o) { try { localStorage.setItem(key, "1"); } catch { /* yoksay */ } } }}>
      <summary><span aria-hidden="true">?</span> Kısa kullanım kılavuzu</summary>
      <div className="screen-help-body">
        <p>{help.purpose}</p>
        <p className="screen-help-who"><b>Kimler kullanır:</b> {help.who}</p>
        <ol>{help.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {help.tip && <p className="screen-help-tip"><b>İpucu:</b> {help.tip}</p>}
      </div>
    </details>
  );
}

const noopSubscribe = () => () => undefined;
function readSeen(key: string) {
  try { return localStorage.getItem(key) === "1"; } catch { return true; /* gizli pencere: kutu kapalı başlar */ }
}
