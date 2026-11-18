// K8: Klinorbis telefon bildirimi servis çalışanı.
// Push sinyali içerik taşımaz. Başlık, oturumla /api/notifications'tan okunur; okunamazsa genel metin gösterilir.
// Kilit ekranında yalnız kısa başlık görünür (hasta kimliği bildirim metinlerinde zaten bulunmaz).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "Klinorbis: yeni bildirim", path = "/inbox";
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const first = (data.items || []).find((item) => !item.readAt);
        if (first) { title = String(first.title).slice(0, 120); if (typeof first.path === "string" && first.path.startsWith("/") && !first.path.startsWith("//")) path = first.path; }
        if (data.unread > 1) title += ` (+${data.unread - 1})`;
      }
    } catch { /* ağ yoksa genel metin */ }
    await self.registration.showNotification(title, { body: "Açmak için dokunun.", tag: "klinorbis", renotify: true, icon: "/favicon.svg", data: { path } });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.path;
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/inbox";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) { if ("focus" in client) { await client.navigate(path).catch(() => undefined); return client.focus(); } }
    return self.clients.openWindow(path);
  })());
});
