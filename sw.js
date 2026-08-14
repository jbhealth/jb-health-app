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
  e.waitUntil(
    self.registration.showNotification("JB Health", {
      body: "New submission waiting — a client log or intake form.",
      tag: "jbh-pending",
      badge: "icon-192.png",
      icon: "icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) return w.focus(); }
    return self.clients.openWindow("./");
  })());
});
