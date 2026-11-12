// Make it yours: sanitise, local load/save, per-user keys, chrome classes, and reset.
import "../lib/env.mjs";
import { mod } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const P = await mod("prefs");
const t = new T("13_prefs");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const d = P.defaultPrefs();
ck("defaults are a complete, safe set", d.theme === "auto" && d.accent === "blue" && d.toolbar === "bottom" && d.buttons === "compact" && d.units === "mm" && d.mode === "simple" && d.grid === true && d.gridSize === 0 && d.snap === true && d.canvas === "default");
ck("every accent has light and dark palettes", Object.values(P.ACCENTS).every((a) => a.light && a.dark && a.light.accent && a.dark.accent));

ck("a saved rust accent becomes navy", P.sanitizePrefs({ accent: "rust" }).accent === "navy");
ck("toolbar left is a valid position", P.sanitizePrefs({ toolbar: "left" }).toolbar === "left");
ck("hideHeader and sheet size are kept", P.sanitizePrefs({ hideHeader: true, sheetW: 1200, sheetH: 800 }).hideHeader === true && P.sanitizePrefs({ hideHeader: true, sheetW: 1200, sheetH: 800 }).sheetW === 1200);
ck("junk input falls back to defaults", P.sanitizePrefs(null).theme === "auto" && P.sanitizePrefs("x").accent === "blue" && P.sanitizePrefs({ theme: "neon", accent: "pink", toolbar: "sideways", buttons: "tiny", units: "cm", mode: "admin", gridSize: 7, canvas: "neon" }).toolbar === "bottom");
const ok = P.sanitizePrefs({ theme: "dark", accent: "teal", toolbar: "top", buttons: "large", units: "inch", mode: "pro", grid: false, gridSize: 10, snap: false, canvas: "paper", extra: "nope" });
ck("accepted values are kept and extras are dropped", ok.theme === "dark" && ok.accent === "teal" && ok.toolbar === "top" && ok.buttons === "large" && ok.units === "inch" && ok.mode === "advanced" && ok.grid === false && ok.gridSize === 10 && ok.snap === false && ok.canvas === "paper" && !("extra" in ok));

ck("prefsKey is the device key when no user is signed in", P.prefsKey("") === P.PREFS_KEY && P.prefsKey(null) === P.PREFS_KEY);
ck("prefsKey is per-user when an id is given", P.prefsKey("abc") === P.PREFS_KEY + ".abc" && P.prefsKey("abc") !== P.prefsKey("def"));

localStorage.clear();
const a = P.savePrefs({ theme: "dark", accent: "navy" }, "u1");
ck("savePrefs keeps a valid theme and accent", a.theme === "dark" && a.accent === "navy");
const b = P.loadPrefs("u2");
ck("a second user starts from defaults when they have no saved key", b.theme === "auto" && b.accent === "blue");
P.savePrefs({ theme: "light", accent: "green" }, "u2");
ck("users do not overwrite each other", P.loadPrefs("u1").accent === "navy" && P.loadPrefs("u2").accent === "green");
const r = P.resetPrefs("u1");
ck("reset-to-defaults restores the built-in set for that user", r.theme === "auto" && r.accent === "blue" && r.toolbar === "bottom" && P.loadPrefs("u2").accent === "green");

document.documentElement = {
  style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k] || ""; }, removeProperty(k) { delete this._p[k]; } },
  _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k]; },
};
document.body = {
  classList: {
    _s: new Set(),
    toggle(n, on) { if (on) this._s.add(n); else this._s.delete(n); },
    remove(...ns) { ns.forEach((n) => this._s.delete(n)); },
    add(n) { this._s.add(n); },
    contains(n) { return this._s.has(n); },
  },
};
document.querySelector = () => null;

P.applyChrome({ theme: "dark", accent: "teal", toolbar: "top", buttons: "large", canvas: "paper" });
ck("applyChrome sets data-theme and data-accent", document.documentElement.getAttribute("data-theme") === "dark" && document.documentElement.getAttribute("data-accent") === "teal");
ck("applyChrome writes an inline accent (tokens.css is left alone)", !!document.documentElement.style.getPropertyValue("--accent"));
ck("resolvedTheme honours an explicit choice", P.resolvedTheme("light") === "light" && P.resolvedTheme("dark") === "dark");
ck("toolbar and button classes land on the body", document.body.classList.contains("yours-toolbar-top") && document.body.classList.contains("yours-btns-large"));


ck("inherited Object keys are not accepted as an accent or canvas", P.sanitizePrefs({ accent: "constructor", canvas: "toString" }).accent === "blue" && P.sanitizePrefs({ accent: "constructor", canvas: "toString" }).canvas === "default");
ck("wheelZoom defaults to off and is kept when set", P.defaultPrefs().wheelZoom === false && P.sanitizePrefs({ wheelZoom: true }).wheelZoom === true);

localStorage.clear();
P.savePrefs({ theme: "dark", mode: "pro" }, "");
const fresh = P.loadPrefs("new-user");
ck("a new signed-in account does not inherit the signed-out Make it yours choices", fresh.theme === "auto" && fresh.mode === "simple");

ck("formatLen uses millimetres by default", /mm$/.test(P.formatLen(100, 0)) && P.formatLen(100, 0).startsWith("100"));
P.savePrefs({ units: "inch" }, "u-inch");
ck("formatLen converts to inches when that display unit is chosen", P.formatLen(25.4, 0) === "1 in" || P.formatLen(25.4, 2).startsWith("1"), P.formatLen(25.4, 2));

ck("a saved Beginner mode becomes Simple", P.sanitizePrefs({ mode: "beginner" }).mode === "simple");
ck("a saved Pro mode becomes Advanced", P.sanitizePrefs({ mode: "pro" }).mode === "advanced");
ck("an unknown mode falls back to Simple", P.sanitizePrefs({ mode: "nope" }).mode === "simple");


ck("tools defaults to unset (the default toolbar)", P.defaultPrefs().tools === null);
ck("a tools list is kept unique and trimmed", JSON.stringify(P.sanitizePrefs({ tools: ["rect", "rect", "nope-id-is-ok-as-string", "disc"] }).tools) === JSON.stringify(["rect", "nope-id-is-ok-as-string", "disc"]));
ck("junk tools fall back to unset", P.sanitizePrefs({ tools: "all" }).tools === null && P.sanitizePrefs({ tools: null }).tools === null);
ck("resetting tools returns to unset", P.sanitizePrefs({ ...P.defaultPrefs(), tools: ["rect"] }).tools[0] === "rect" && P.sanitizePrefs({ tools: null }).tools === null);

const lay = { s3: { order: ["main", "bed", "side"], w: { main: 360 } }, s4: { order: ["run", "bed"], w: {} } };
ck("cutLayout is kept (same path as the toolbar)", JSON.stringify(P.sanitizePrefs({ cutLayout: lay }).cutLayout.s3.order) === JSON.stringify(["main", "bed", "side"]) && P.sanitizePrefs({ cutLayout: lay }).cutLayout.s3.w.main === 360);
ck("junk cutLayout falls back to unset", P.sanitizePrefs({ cutLayout: "wide" }).cutLayout === null && P.defaultPrefs().cutLayout === null);
P.savePrefs({ cutLayout: lay }, "u-lay");
ck("cutLayout is stored per account in plasma.yours.v1", JSON.stringify(P.loadPrefs("u-lay").cutLayout.s3.order) === JSON.stringify(["main", "bed", "side"]) && P.loadPrefs("u2").cutLayout === null);

ck("updatedAt is dropped when junk, kept when it is a time", P.sanitizePrefs({ updatedAt: "nope" }).updatedAt === 0 && P.sanitizePrefs({ updatedAt: 1_700_000_000_000 }).updatedAt === 1_700_000_000_000);
const before = Date.now();
const saved = P.savePrefs({ theme: "dark" }, "u-time");
ck("savePrefs stamps updatedAt", saved.updatedAt >= before && saved.updatedAt <= Date.now() && P.loadPrefs("u-time").updatedAt === saved.updatedAt);

process.exit(t.done() ? 1 : 0);
