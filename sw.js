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

/* Badge count survives the SW being torn down between pushes. iOS wants a NUMBER:
   setAppBadge() with no argument asks for a flag/dot, which iOS does not render. */
const BADGE_CACHE = "jbh-badge";
const BADGE_KEY = "/__jbh_badge_count";
async function badgeGet() {
  try { const c = await caches.open(BADGE_CACHE); const r = await c.match(BADGE_KEY);
        return r ? (Number(await r.text()) || 0) : 0; } catch (e) { return 0; }
}
async function badgeStore(n) {
  try { const c = await caches.open(BADGE_CACHE); await c.put(BADGE_KEY, new Response(String(n))); } catch (e) {}
}
async function badgePaint(n) {
  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      if (n > 0) await self.navigator.setAppBadge(n);
      else if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
    }
  } catch (e) {}
}

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    /* banner FIRST: iOS requires one per push, and nothing above it may block it */
    await self.registration.showNotification("JB Health", {
      body: "New submission waiting: a client log or intake form.",
      tag: "jbh-pending",
      badge: "icon-192.png",
      icon: "icon-192.png",
    });
    const n = (await badgeGet()) + 1;
    await badgeStore(n);
    await badgePaint(n);
  })());
});

/* The page tells the SW the live pending total whenever it changes, which keeps
   the SW's own tally honest. At zero, delivered notifications are closed too:
   a badge iOS set itself on delivery will not clear any other way. */
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "jbh-badge") return;
  e.waitUntil((async () => {
    const n = Math.max(0, Number(d.n) || 0);
    await badgeStore(n);
    await badgePaint(n);
    if (n === 0) {
      try { (await self.registration.getNotifications()).forEach((x) => x.close()); } catch (err) {}
    }
  })());
});
