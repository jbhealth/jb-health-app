/* JB Health service worker — build step 7½.
 *
 * TWO JOBS ONLY:
 *   1. Push: show a notification when the Worker taps this device.
 *   2. Fetch: NETWORK-FIRST for the page itself, so the app keeps its
 *      self-updating, never-reinstall property. Cache is a fallback for
 *      offline opens, never a source of staleness.
 * No precaching, no asset caching, no background sync.
 */

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request);
        const cache = await caches.open("jbh-page");
        cache.put(e.request, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        throw err;
      }
    })());
  }
  /* everything else: straight through, untouched */
});

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    /* dot on the icon even while the app is closed */
    try { if (self.navigator && "setAppBadge" in self.navigator) await self.navigator.setAppBadge(); } catch (err) {}
    await self.registration.showNotification("JB Health", {
      body: "New submission waiting: a client log or intake form.",
      tag: "jbh-pending",
      badge: "icon-192.png",
      icon: "icon-192.png",
    });
  })());
});

/* The page tells the SW the live pending total. Badge calls made from the SW
   repaint on iOS straight away; ones made from a foreground page often don't
   until the app is killed. At zero, delivered notifications are closed too. */
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "jbh-badge") return;
  e.waitUntil((async () => {
    const n = Number(d.n) || 0;
    try {
      if (self.navigator && "setAppBadge" in self.navigator) {
        if (n > 0) await self.navigator.setAppBadge();
        else if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
      }
    } catch (err) {}
    if (n === 0) {
      try { (await self.registration.getNotifications()).forEach((x) => x.close()); } catch (err) {}
    }
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) return w.focus(); }
    return self.clients.openWindow("./");
  })());
});
