// Service worker: the app works offline, and it can never serve a stale copy while you are online.
//  * PRECACHE is the app shell (page, styles, every script, config, icons). scripts/stamp-version.sh regenerates the list between
//    the markers from the files that are actually deployed, and the cache name carries the release id, so each release gets its own
//    cache that holds exactly that release's files.
//  * Install is all-or-nothing for the page, styles, scripts and config: every file is fetched past the browser's HTTP cache
//    ({cache: "reload"}), and if one fails the new worker does not install and the working one stays. Icons are best effort.
//  * Activate deletes every older plasma-cad-* cache, takes over open pages and tells them "new version" so they can show Reload.
//  * Fetch is network-first and skips the HTTP cache (GitHub Pages lets browsers keep files for 10 minutes), so while online
//    you always get the deployed file. The cache is used only when the network fails or is too slow, and only the cache of THIS release
//    is read, never an older one. Precached files are written once at install, never from later fetches, so the offline copy is always
//    one consistent release. version.json is always asked of the network (offline it falls back to the installed release's copy).
const CACHE = "plasma-cad-2026.11.11-9e0235b";
const PRECACHE = [
  /* precache:start */
  "./",
  "index.html",
  "style.css",
  "manifest.json",
  "version.json",
  "favicon-32.png",
  "favicon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "logo.svg",
  "config/cut_chart.json",
  "config/fluidnc-plasma.yaml",
  "config/grblhal_settings.txt",
  "config/machine.json",
  "js/account-ui.js",
  "js/account.js",
  "js/admin-machine.js",
  "js/app.js",
  "js/cam.js",
  "js/check.js",
  "js/config.js",
  "js/dialect.js",
  "js/duct.js",
  "js/dxf.js",
  "js/editable.js",
  "js/expr.js",
  "js/flow.js",
  "js/fluidnc.js",
  "js/geom.js",
  "js/grbl.js",
  "js/howto.js",
  "js/inspector-api.js",
  "js/inspector-ui.js",
  "js/job.js",
  "js/machine.js",
  "js/partsfolders.js",
  "js/r2ui.js",
  "js/safety.js",
  "js/settings.js",
  "js/setup.js",
  "js/shape-helpers.js",
  "js/shapes-fab.js",
  "js/shapes.js",
  "js/sim.js",
  "js/sketch.js",
  "js/svg.js",
  "js/sw-register.js",
  "js/timeline.js",
  "js/variants.js",
  "js/version.js",
  "js/whyoff.js",
  /* precache:end */
];
const PREFIX = "plasma-cad-";
const SLOW_MS = 6000;
const scopeUrl = (p) => new URL(p, self.registration.scope).href;
const isRequired = (p) => p === "./" || p === "index.html" || p === "style.css" || p === "manifest.json" || p === "version.json" || /^(js|config)\//.test(p);

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const failed = [];
    await Promise.all(PRECACHE.map(async (p) => {
      try {
        const res = await fetch(new Request(scopeUrl(p), { cache: "reload" }));
        if (!res.ok) throw new Error(p + " " + res.status);
        await c.put(scopeUrl(p), res);
      } catch (err) { failed.push(p); }
    }));
    const bad = failed.filter(isRequired);
    if (bad.length) { await caches.delete(CACHE); throw new Error("precache failed: " + bad.join(", ")); }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE);
    // also remove the pre-release-id caches this app used before ("plasma-cad-v1" style names share the prefix; nothing else is touched)
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (old.length) {
      const all = await self.clients.matchAll({ type: "window" });
      for (const c of all) c.postMessage({ type: "new-version", cache: CACHE });
    }
  })());
});

const fromNetwork = (req) => fetch(req, { cache: "no-cache" });
const fetchNet = fromNetwork;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // Supabase, the Pi bridge, the machine: never touched
  if (url.pathname.endsWith("/sw.js")) return;             // the browser checks the worker script itself
  if (url.pathname.endsWith("/bridge.json")) return;       // live Pi detection: always the network

  e.respondWith((async () => {
    // A newer release has deleted this release's cache while this worker was still answering: just pass through, never re-create it.
    if (!(await caches.has(CACHE))) return fetchNet(req);
    const cache = await caches.open(CACHE);
    const key = (url.pathname.endsWith("/version.json") ? scopeUrl("version.json") : null);
    const hit = async () => {
      if (key) return cache.match(key);
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === "navigate" ? (await cache.match(scopeUrl("index.html"))) || (await cache.match(scopeUrl("./"))) : undefined);
    };
    const cached = await hit();
    try {
      const timeout = cached ? new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), SLOW_MS)) : null;
      const res = await (timeout ? Promise.race([fromNetwork(req), timeout]) : fromNetwork(req));
      if (res && res.ok && !key) {
        const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length) || "./";
        // files outside the precache list (samples, docs) are kept as they are used; the shell is only ever written at install
        if (!PRECACHE.includes(rel) && !PRECACHE.includes(rel.replace(/^\//, ""))) cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
