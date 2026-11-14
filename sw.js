// Toured service worker: makes the site installable and lets the app shell open on a weak
// connection. Listings, reviews and sign-in always come from the network (never cached here).
const CACHE = "toured-shell-v1";
const SHELL = ["/", "/css/styles.css", "/js/app.js", "/assets/brand/toured-icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // maps, fonts, photos, Google sign-in
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return; // live data
  if (url.pathname.startsWith("/sitemap") || url.pathname === "/robots.txt") return;

  // Rarely-changing files: use the saved copy, refresh it in the background.
  if (url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Pages, scripts and styles: always try the network first so updates show up right away;
  // fall back to the saved copy when offline.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? (await caches.match("/")) : undefined) || Response.error()));
});
