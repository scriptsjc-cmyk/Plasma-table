// Make it yours: sanitise, local load/save, per-user keys, chrome classes, and reset.
import "../lib/env.mjs";
import { mod } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const P = await mod("prefs");
const t = new T("13_prefs");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const d = P.defaultPrefs();
ck("defaults are a complete, safe set", d.theme === "auto" && d.accent === "blue" && d.toolbar === "bottom" && d.buttons === "compact" && d.units === "mm" && d.mode === "beginner" && d.grid === true && d.gridSize === 0 && d.snap === true && d.canvas === "default");
ck("every accent has light and dark palettes", Object.values(P.ACCENTS).every((a) => a.light && a.dark && a.light.accent && a.dark.accent));

ck("junk input falls back to defaults", P.sanitizePrefs(null).theme === "auto" && P.sanitizePrefs("x").accent === "blue" && P.sanitizePrefs({ theme: "neon", accent: "pink", toolbar: "left", buttons: "tiny", units: "cm", mode: "admin", gridSize: 7, canvas: "neon" }).toolbar === "bottom");
const ok = P.sanitizePrefs({ theme: "dark", accent: "teal", toolbar: "top", buttons: "large", units: "inch", mode: "pro", grid: false, gridSize: 10, snap: false, canvas: "paper", extra: "nope" });
ck("accepted values are kept and extras are dropped", ok.theme === "dark" && ok.accent === "teal" && ok.toolbar === "top" && ok.buttons === "large" && ok.units === "inch" && ok.mode === "pro" && ok.grid === false && ok.gridSize === 10 && ok.snap === false && ok.canvas === "paper" && !("extra" in ok));

ck("prefsKey is the device key when no user is signed in", P.prefsKey("") === P.PREFS_KEY && P.prefsKey(null) === P.PREFS_KEY);
ck("prefsKey is per-user when an id is given", P.prefsKey("abc") === P.PREFS_KEY + ".abc" && P.prefsKey("abc") !== P.prefsKey("def"));

localStorage.clear();
const a = P.savePrefs({ theme: "dark", accent: "rust" }, "u1");
ck("savePrefs keeps a valid theme and accent", a.theme === "dark" && a.accent === "rust");
const b = P.loadPrefs("u2");
ck("a second user starts from defaults when they have no saved key", b.theme === "auto" && b.accent === "blue");
P.savePrefs({ theme: "light", accent: "green" }, "u2");
ck("users do not overwrite each other", P.loadPrefs("u1").accent === "rust" && P.loadPrefs("u2").accent === "green");
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

process.exit(t.done() ? 1 : 0);
