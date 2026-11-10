// Site config for the accounts backend.
//
// When SUPABASE_URL is empty, or the page is opened with ?demo=1 (or ?test=1),
// the app runs in local demo mode: accounts and parts stay in this browser.
// See docs/ACCOUNTS-SETUP.md.
//
// Never put the service_role key in this file or anywhere in the client.

export const CONFIG = {
  SUPABASE_URL: "https://sjtjgumbsnakipkgskxt.supabase.co",

  // Publishable (anon) key — this is the public client key, not the service role.
  SUPABASE_ANON_KEY: "sb_publishable_MkOEVpApxkcC2BPdRhThPA_CECWfjAr",

  // Legacy JWT form of the same anon key. The REST Auth API still expects this
  // as the Auth HTTP header; the publishable key is preferred with supabase-js v2.
  SUPABASE_ANON_JWT: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdGpndW1ic25ha2lwa2dza3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDE3MDYsImV4cCI6MjEwOTg3NzcwNn0.hORPZjCkr_RlgDwUCr5rXKVSxUqvWkyi2PmWa9G2WRc",

  // Public site, used as the Auth redirect target (magic link + reset).
  SITE_URL: "https://scriptsjc-cmyk.github.io/Plasma-table/",

  // Gating: design, CAM preview and saving parts are always free.
  // Running, sending, jogging and connecting to a real machine need a
  // linked (claimed) table. Download of G-code is allowed without a
  // machine so people can still cut on another controller. Flip this
  // to false if you want export locked until a table is claimed.
  ALLOW_GCODE_EXPORT_WITHOUT_MACHINE: true,

  // Demo claim code (local demo mode only). Typed on the Link machine dialog.
  DEMO_CLAIM_CODE: "DEMO-0000",
  DEMO_SERIAL: "DEMO-TABLE-1",
};

// The key sent to Auth / PostgREST as the Auth HTTP header.
export function anonKey() {
  const k = CONFIG.SUPABASE_ANON_KEY || "";
  const jwt = CONFIG.SUPABASE_ANON_JWT || "";
  // sb_publishable_… is for supabase-js v2; the REST endpoints want the JWT form.
  if (jwt && (!k || k.startsWith("sb_"))) return jwt;
  return k || jwt;
}
