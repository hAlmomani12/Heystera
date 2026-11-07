/* مطعم هستيريا — service worker.
   - Pages, scripts, styles and menu data: network first (always fresh when online), cached copy when offline.
   - Images, icons, fonts: cache first (they never change once published).
   - /api/* and anything to OpenAI: never cached — orders, bookings and calls must be live. */
const VERSION = "hysteria-v1";
const SHELL = [
  "/", "/css/site.css", "/js/app.js", "/js/voice.js", "/data/restaurant.js", "/manifest.webmanifest",
  "/brand/logo-wordmark@sm.png", "/brand/logo-wordmark.png", "/brand/icon-192.png", "/brand/favicon-64.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("hysteria-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isAsset = url => /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname) || url.hostname.endsWith("gstatic.com");

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;                       // always live
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  const menuPhoto = url.hostname.endsWith("cloudfront.net");
  if (!sameOrigin && !fonts && !menuPhoto) return;

  if (isAsset(url) || menuPhoto) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // pages, css, js, data: network first, fall back to cache (and to the home page for navigations)
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req.mode === "navigate" ? "/" : req, res.clone());
      return res;
    } catch {
      return (await c.match(req.mode === "navigate" ? "/" : req, { ignoreSearch: req.mode === "navigate" }))
        || (await c.match("/")) || Response.error();
    }
  })());
});
