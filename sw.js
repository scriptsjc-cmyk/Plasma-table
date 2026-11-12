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
const CACHE = "plasma-cad-2026.11.12-84c901b";
const PRECACHE = [
  /* precache:start */
  "./",
  "index.html",
  "manifest.json",
  "version.json",
  "favicon-32.png",
  "favicon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "logo.svg",
  "css/base.css",
  "css/components.css",
  "css/layout.css",
  "css/screen-admin.css",
  "css/screen-cut.css",
  "css/screen-make.css",
  "css/screen-signin-menu.css",
  "css/tokens.css",
  "css/yours.css",
  "js/account/account-ui.js",
  "js/account/account.js",
  "js/account/accounthome.js",
  "js/account/acctbase.js",
  "js/account/acctcrypto.js",
  "js/account/acctstate.js",
  "js/account/adminapi.js",
  "js/account/adminview.js",
  "js/account/announce.js",
  "js/account/announceui.js",
  "js/account/auth.js",
  "js/account/authforms.js",
  "js/account/cloud.js",
  "js/account/config.js",
  "js/account/demostore.js",
  "js/account/jobevents.js",
  "js/account/machines.js",
  "js/account/parts.js",
  "js/account/partsfolders.js",
  "js/account/partslist.js",
  "js/account/savepart.js",
  "js/account/uibase.js",
  "js/app.js",
  "js/core/dom.js",
  "js/core/expr.js",
  "js/core/geom.js",
  "js/core/hooks.js",
  "js/core/prefs.js",
  "js/core/state.js",
  "js/cut/cam.js",
  "js/cut/camedit.js",
  "js/cut/check.js",
  "js/cut/checklist.js",
  "js/cut/coupon.js",
  "js/cut/cutfeatures-ui.js",
  "js/cut/cutlist.js",
  "js/cut/cutlive.js",
  "js/cut/export.js",
  "js/cut/job.js",
  "js/cut/material.js",
  "js/cut/nest.js",
  "js/cut/nestui.js",
  "js/cut/origins.js",
  "js/cut/pierce.js",
  "js/cut/playback.js",
  "js/cut/prepare.js",
  "js/cut/preview.js",
  "js/cut/previewnav.js",
  "js/cut/progress.js",
  "js/cut/restart.js",
  "js/cut/run.js",
  "js/cut/setup.js",
  "js/cut/timeline.js",
  "js/machine/access.js",
  "js/machine/admin-machine.js",
  "js/machine/connection.js",
  "js/machine/console.js",
  "js/machine/dialect.js",
  "js/machine/events.js",
  "js/machine/fluidnc.js",
  "js/machine/grbl.js",
  "js/machine/jog.js",
  "js/machine/machine.js",
  "js/machine/panels.js",
  "js/machine/safety.js",
  "js/machine/settings.js",
  "js/machine/sim.js",
  "js/machine/usbserial.js",
  "js/machine/wifi.js",
  "js/make/cad.js",
  "js/make/cutsummary.js",
  "js/make/dimedit.js",
  "js/make/duct.js",
  "js/make/dxf.js",
  "js/make/editable.js",
  "js/make/files.js",
  "js/make/fontdata.js",
  "js/make/library.js",
  "js/make/maketools.js",
  "js/make/picture.js",
  "js/make/protools.js",
  "js/make/quickbar.js",
  "js/make/shape-helpers.js",
  "js/make/shapeform.js",
  "js/make/shapes-fab.js",
  "js/make/shapes.js",
  "js/make/sizecheck.js",
  "js/make/sketch-edge.js",
  "js/make/sketch-edit.js",
  "js/make/sketch-geom.js",
  "js/make/sketch-input.js",
  "js/make/sketch-lock.js",
  "js/make/sketch-util.js",
  "js/make/sketch-view.js",
  "js/make/sketch.js",
  "js/make/straight.js",
  "js/make/svg.js",
  "js/make/textshape.js",
  "js/make/trace.js",
  "js/make/useshape.js",
  "js/make/variants.js",
  "js/sw-register.js",
  "js/ui/about.js",
  "js/ui/demo.js",
  "js/ui/dialogs.js",
  "js/ui/features.js",
  "js/ui/flow.js",
  "js/ui/gate.js",
  "js/ui/host.js",
  "js/ui/howto.js",
  "js/ui/icons.js",
  "js/ui/inspector-api.js",
  "js/ui/inspector-ui.js",
  "js/ui/labels.js",
  "js/ui/menu.js",
  "js/ui/mode.js",
  "js/ui/nav.js",
  "js/ui/refresh.js",
  "js/ui/scrollrow.js",
  "js/ui/viewport.js",
  "js/ui/whyoff.js",
  "js/ui/whytip.js",
  "js/ui/wifisetup.js",
  "js/ui/yours.js",
  "js/version.js",
  "config/cut_chart.json",
  "config/fluidnc-plasma.yaml",
  "config/grblhal_settings.txt",
  "config/machine.json",
  /* precache:end */
];
const PREFIX = "plasma-cad-";
const SLOW_MS = 6000;
const scopeUrl = (p) => new URL(p, self.registration.scope).href;
const isRequired = (p) => p === "./" || p === "index.html" || p === "manifest.json" || p === "version.json" || /^(js|css|config)\//.test(p);

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
