"use client";
// Günlük ekranlar işlemleri görünür tutar; ayrıntılı yardım yardım merkezindedir.
// K3: her ekranın başında tek satırlık kullanım amacı beyanı gösterilir.
import { usageStatement } from "../lib/screen-help";

export function ScreenHelpBox({ view }: { view: string }) {
  const text = usageStatement(view);
  return text ? <p className="usage-statement" data-usage-statement={view}>{text}</p> : null;
}
