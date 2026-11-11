// Service worker: keeps the app usable offline WITHOUT ever serving a stale copy while online.
//  * The cache name carries the release id (scripts/stamp-version.sh), so every release starts a fresh cache and the
//    old one is deleted when the new worker activates.
//  * Network-first for everything (index.html, js/, css, config): the request skips the browser's own HTTP cache
//    (GitHub Pages lets browsers keep files for 10 minutes), and the cached copy is used only when the network fails.
//  * When a new worker takes over, open pages are told so they can show "New version available. Reload".
const CACHE = "plasma-cad-2026.11.11-e8cbc3d";
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.add(new Request("index.html", { cache: "reload" })); } catch (err) { /* offline install: fine */ }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.some((k) => k.startsWith("plasma-") && k !== CACHE);
    await Promise.all(keys.filter((k) => k.startsWith("plasma-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (hadOld) {
      const all = await self.clients.matchAll({ type: "window" });
      for (const c of all) c.postMessage({ type: "new-version", cache: CACHE });
    }
  })());
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request, { cache: "no-cache" });
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (url.pathname === "/" || url.pathname.endsWith("/index.html") || e.request.mode === "navigate") {
        return (await caches.match("index.html")) || (await caches.match("/index.html")) || (await caches.match("./index.html"));
      }
      return caches.match("index.html");
    }
  })());
});
