// Per-user "Make it yours" preferences: theme, accent, toolbar, buttons, grid, snap, canvas.
// Stored in localStorage only (the profiles table has no prefs column, so these are not synced to the cloud).
// Keyed by signed-in user id when one is known, so two accounts on this browser keep their own choices.

export const PREFS_KEY = "plasma.yours.v1";

export const ACCENTS = {
  blue:   { light: { accent: "#005A9E", weak: "#E8F3FB", on: "#FFFFFF", text: "#004578", sel: "#0078D4" },
            dark:  { accent: "#4f9cf0", weak: "#1e3a5f", on: "#0b1220", text: "#9CC7FF", sel: "#7aa2f0" } },
  teal:   { light: { accent: "#0B6E6E", weak: "#E3F4F4", on: "#FFFFFF", text: "#085656", sel: "#0E7C7C" },
            dark:  { accent: "#2EC4C4", weak: "#143838", on: "#062020", text: "#9EEAEA", sel: "#4FDDDD" } },
  green:  { light: { accent: "#0A6A32", weak: "#E8F6EE", on: "#FFFFFF", text: "#085427", sel: "#0C7A3A" },
            dark:  { accent: "#3DCF7A", weak: "#13301f", on: "#062010", text: "#86efac", sel: "#5EE09A" } },
  purple: { light: { accent: "#6B21A8", weak: "#F3E8FF", on: "#FFFFFF", text: "#561A86", sel: "#7C3AED" },
            dark:  { accent: "#C084FC", weak: "#3B1D5C", on: "#1A0B2B", text: "#E9D5FF", sel: "#D8B4FE" } },
  navy:   { light: { accent: "#0B1F33", weak: "#E6EEF5", on: "#FFFFFF", text: "#0B1F33", sel: "#1A3A5C" },
            dark:  { accent: "#8FB3D4", weak: "#1A2838", on: "#0B1220", text: "#C5D8EA", sel: "#A8C6E3" } },
  rust:   { light: { accent: "#9A3412", weak: "#FDE8DC", on: "#FFFFFF", text: "#7C2A0E", sel: "#C2410C" },
            dark:  { accent: "#FB923C", weak: "#4A2A10", on: "#1A0C04", text: "#FED7AA", sel: "#FDBA74" } },
};

export const CANVAS_BG = {
  default: null,
  white: "#FFFFFF",
  paper: "#F4F1EA",
  grey: "#E8EAED",
  dark: "#121920",
};

const THEMES = ["auto", "light", "dark"];
const TOOLBARS = ["bottom", "top"];
const BUTTONS = ["compact", "normal", "large"];
const MODES = ["beginner", "pro"];
const GRID_SIZES = [0, 1, 2, 5, 10, 20, 50];

export function defaultPrefs() {
  return {
    theme: "auto",
    accent: "blue",
    toolbar: "bottom",
    buttons: "compact",
    units: "mm",
    mode: "beginner",
    grid: true,
    gridSize: 0,
    snap: true,
    canvas: "default",
  };
}

const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

export function sanitizePrefs(raw) {
  const d = defaultPrefs(), src = isObj(raw) ? raw : {}, out = defaultPrefs();
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  if (ACCENTS[src.accent]) out.accent = src.accent;
  if (TOOLBARS.includes(src.toolbar)) out.toolbar = src.toolbar;
  if (BUTTONS.includes(src.buttons)) out.buttons = src.buttons;
  if (src.units === "mm" || src.units === "inch") out.units = src.units;
  if (MODES.includes(src.mode)) out.mode = src.mode;
  if (typeof src.grid === "boolean") out.grid = src.grid;
  if (GRID_SIZES.includes(Number(src.gridSize))) out.gridSize = Number(src.gridSize);
  if (typeof src.snap === "boolean") out.snap = src.snap;
  if (CANVAS_BG[src.canvas] !== undefined) out.canvas = src.canvas;
  return out;
}

export function prefsKey(userId) {
  const id = userId && String(userId);
  return id ? PREFS_KEY + "." + id : PREFS_KEY;
}

let current = defaultPrefs();
let currentKey = PREFS_KEY;

export function getPrefs() { return { ...current }; }

export function loadPrefs(userId) {
  currentKey = prefsKey(userId);
  try {
    const raw = JSON.parse(localStorage.getItem(currentKey) || "null");
    if (!raw && userId) {
      const fallback = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      current = sanitizePrefs(fallback);
    } else current = sanitizePrefs(raw);
  } catch (e) { current = defaultPrefs(); }
  return getPrefs();
}

export function savePrefs(partial, userId) {
  if (userId !== undefined) currentKey = prefsKey(userId);
  current = sanitizePrefs({ ...current, ...(isObj(partial) ? partial : {}) });
  try { localStorage.setItem(currentKey, JSON.stringify(current)); } catch (e) { /* ignore */ }
  return getPrefs();
}

export function resetPrefs(userId) {
  current = defaultPrefs();
  if (userId !== undefined) currentKey = prefsKey(userId);
  try { localStorage.setItem(currentKey, JSON.stringify(current)); } catch (e) { /* ignore */ }
  return getPrefs();
}

export function resolvedTheme(theme = current.theme) {
  if (theme === "light" || theme === "dark") return theme;
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  catch (e) { return "light"; }
}

export function applyChrome(p = current) {
  const prefs = sanitizePrefs(p);
  const theme = resolvedTheme(prefs.theme);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-accent", prefs.accent);
  const pal = (ACCENTS[prefs.accent] || ACCENTS.blue)[theme];
  if (pal) {
    root.style.setProperty("--accent", pal.accent);
    root.style.setProperty("--accent-weak", pal.weak);
    root.style.setProperty("--on-accent", pal.on);
    root.style.setProperty("--accent-text", pal.text);
    root.style.setProperty("--cad-sel", pal.sel);
    root.style.setProperty("--cad-dim", pal.sel);
    root.style.setProperty("--cad-guide", pal.sel);
  } else {
    ["--accent", "--accent-weak", "--on-accent", "--accent-text", "--cad-sel", "--cad-dim", "--cad-guide"].forEach((k) => root.style.removeProperty(k));
  }
  const bg = CANVAS_BG[prefs.canvas];
  if (bg) root.style.setProperty("--cad-canvas", bg);
  else root.style.removeProperty("--cad-canvas");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#18202a" : "#E8EAED");
  const body = document.body;
  if (body) {
    body.classList.toggle("yours-toolbar-top", prefs.toolbar === "top");
    body.classList.remove("yours-btns-compact", "yours-btns-normal", "yours-btns-large");
    body.classList.add("yours-btns-" + prefs.buttons);
  }
}

let mediaBound = false;
export function bindThemeMedia() {
  if (mediaBound || !window.matchMedia) return;
  mediaBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const on = () => { if (current.theme === "auto") applyChrome(current); };
  if (mq.addEventListener) mq.addEventListener("change", on);
  else if (mq.addListener) mq.addListener(on);
}
