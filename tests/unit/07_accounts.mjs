import { mod, readJs, allJsText, jsPath } from "../lib/site.mjs";
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const A = await load();
const t = new T("07_accounts");
const accMod = await mod("account");
const cfg = await mod("config");

function wipe() {
  A.store.clear();
}

async function user(email, mode = "beginner") {
  await accMod.signUp({ email, pin: "letmein1", display_name: "Test " + email.split("@")[0], mode });
  return accMod.currentUser();
}

// config / gating constant
t.check("config has the live project URL", cfg.CONFIG.SUPABASE_URL === "https://sjtjgumbsnakipkgskxt.supabase.co");
t.check("demo mode is forced in unit tests (and by ?demo=1 / ?test=1 in the browser)", accMod.isDemoMode() === true && accMod.isCloud() === false);
t.check("export helper prefers the JWT form of the anon key for REST", typeof cfg.anonKey === "function" && String(cfg.anonKey() || "").startsWith("eyJ"));
t.check("G-code export is allowed without a machine (flip CONFIG.ALLOW_GCODE_EXPORT_WITHOUT_MACHINE to change)", accMod.allowExportWithoutMachine() === true, "", "GATE-EXPORT");
const roleRe = new RegExp("service[_-]?role\\s*[:=]\\s*[\"\']..", "i");
t.check("no service_role key assigned in shipped JS", !allJsText().some(([, txt]) => roleRe.test(txt)));

await accMod.initAccount();

// sign up / in / mode
wipe();
await accMod.initAccount();
t.check("signed out by default", !accMod.isSignedIn() && !accMod.hasLinkedMachine());
{
  let err = "";
  try { await accMod.signUp({ email: "bad", pin: "letmein1", mode: "beginner" }); } catch (e) { err = e.message; }
  t.check("sign up rejects a bad email", /email/i.test(err));
  err = "";
  try { await accMod.signUp({ email: "a@b.co", pin: "short", mode: "beginner" }); } catch (e) { err = e.message; }
  t.check("sign up rejects a short password", /at least 6/i.test(err));
}
const u1 = await user("one@example.com", "beginner");
t.check("sign up beginner: signed in", !!(u1 && u1.email === "one@example.com"));
t.check("sign up beginner: mode is beginner", accMod.accountMode() === "beginner" && u1.mode === "beginner");
t.check("new account has no linked machine", accMod.hasLinkedMachine() === false);
await accMod.setMode("pro");
t.check("mode switch to Pro", accMod.accountMode() === "pro");
await accMod.setMode("beginner");
t.check("mode switch back to Beginner", accMod.accountMode() === "beginner");
await accMod.setDisplayName("Alex");
t.check("display name saved", accMod.currentUser().display_name === "Alex");
await accMod.signOut();
t.check("sign out", !accMod.isSignedIn());
let err = "";
try { await accMod.signIn({ email: "one@example.com", pin: "wrong-phrase" }); } catch (e) { err = e.message; }
t.check("sign in rejects a wrong phrase", /not right|not recognised|wrong/i.test(err) || err.length > 0);
await accMod.signIn({ email: "one@example.com", pin: "letmein1" });
t.check("sign in with the right phrase", accMod.isSignedIn() && accMod.currentUser().display_name === "Alex");

// parts save / load / rename / delete
const part = await accMod.savePart({ name: "Flange 80", data: { items: [{ id: 1, type: "flange", p: { d: 80 } }] } });
t.check("save part returns id and timestamp", !!(part && part.id && part.updated_at), JSON.stringify(part));
const listed = await accMod.listParts();
t.check("list parts includes the saved one", listed.some((p) => p.id === part.id && p.name === "Flange 80"));
const loaded = await accMod.loadPart(part.id);
t.check("load part returns the drawing", loaded.data.items[0].type === "flange" && loaded.data.items[0].p.d === 80);
const renamed = await accMod.renamePart(part.id, "Flange 80 v2");
t.check("rename part", renamed.name === "Flange 80 v2");
await accMod.deletePart(part.id);
t.check("delete part", (await accMod.listParts()).every((p) => p.id !== part.id));

// conflict: last-write-wins + keep both
const a = await accMod.savePart({ name: "Bracket", data: { items: [{ id: 1, type: "bracket", p: { w: 40 } }] } });
// simulate a newer remote copy by writing directly then saving with the old timestamp
{
  const raw = JSON.parse(A.store.get("plasma.account.demo"));
  const row = raw.parts.find((p) => p.id === a.id);
  row.data = { items: [{ id: 1, type: "bracket", p: { w: 99 } }] };
  row.updated_at = new Date(Date.now() + 60_000).toISOString();
  A.store.set("plasma.account.demo", JSON.stringify(raw));
  let conflict = null;
  try {
    await accMod.savePart({ id: a.id, name: "Bracket", data: { items: [{ id: 1, type: "bracket", p: { w: 40 } }] }, updated_at: a.updated_at });
  } catch (e) { conflict = e.conflict; }
  t.check("conflicting save surfaces a conflict (newer copy in the account)", !!(conflict && conflict.remote), conflict ? "no remote" : "no conflict");
  const both = await accMod.savePart({ id: a.id, name: "Bracket", data: { items: [{ id: 1, type: "bracket", p: { w: 40 } }] }, updated_at: a.updated_at, keepBoth: true });
  t.check("keep both: device copy saved under a new id", both.id !== a.id && /device/i.test(both.name), both.name);
  const names = (await accMod.listParts()).map((p) => p.name).sort();
  t.check("keep both: two parts remain", names.filter((n) => /Bracket/.test(n)).length >= 2, names.join(", "));
}

// migrate local drawing
const mig = await accMod.migrateLocalParts([{ id: 1, type: "rect", p: { w: 20, h: 10 } }], "From this device");
t.check("migrate local parts into the account", !!(mig && mig.id && mig.name === "From this device"));

// claim DEMO-0000
err = "";
try { await accMod.claimMachine("NOPE-0000"); } catch (e) { err = e.message; }
t.check("bad claim code is refused", /not recognised/i.test(err));
t.check("still unlinked after a bad code", accMod.hasLinkedMachine() === false);
const claimed = await accMod.claimMachine(cfg.CONFIG.DEMO_CLAIM_CODE);
t.check("DEMO-0000 claims the practice table", claimed && claimed.ok && claimed.serial === cfg.CONFIG.DEMO_SERIAL);
t.check("hasLinkedMachine is true after a claim", accMod.hasLinkedMachine() === true);
t.check("linked serials lists the practice table", accMod.linkedSerials().includes(cfg.CONFIG.DEMO_SERIAL));
err = "";
try { await accMod.claimMachine(cfg.CONFIG.DEMO_CLAIM_CODE); } catch (e) { err = e.message; }
// Round 2: DEMO-0000 is a practice code that works for every demo account, so claiming it again is a harmless "already linked" success
t.check("claiming the practice table again is harmless (already linked)", err === "" && accMod.hasLinkedMachine() === true);

// second account cannot steal it
await accMod.signOut();
await user("two@example.com", "pro");
t.check("second account starts as Pro", accMod.accountMode() === "pro");
err = "";
try { await accMod.claimMachine(cfg.CONFIG.DEMO_CLAIM_CODE); } catch (e) { err = e.message; }
t.check("second demo account can also use DEMO-0000 (gets its own practice table, not the first one's)", err === "" && accMod.hasLinkedMachine() === true && !accMod.linkedSerials().some((x) => x === cfg.CONFIG.DEMO_SERIAL));

// rate limit: 8 tries / 15 min
wipe();
await accMod.initAccount();
await user("rate@example.com");
let last = "";
for (let i = 0; i < 9; i++) {
  try { await accMod.claimMachine("ZZZZ-9999"); } catch (e) { last = e.message; }
}
t.check("claim attempts are rate limited after 8 failures", /too many tries/i.test(last), last);

// admin add / unlink / transfer
wipe();
await accMod.initAccount();
await user("admin@example.com", "pro");
err = "";
try { await accMod.adminAddMachine("TABLE-1", "ABCD-EFGH"); } catch (e) { err = e.message; }
t.check("non-admin cannot add a serial", /admin only/i.test(err));
await accMod.grantDemoAdmin();
t.check("demo grant makes the account admin", accMod.isAdmin() === true);
const added = await accMod.adminAddMachine("TABLE-1", "ABCD-EFGH", "bay 1");
t.check("admin can add a serial", added.ok && added.serial === "TABLE-1");
const list = await accMod.adminListMachines();
t.check("admin list includes TABLE-1 and the demo table", list.some((m) => m.serial === "TABLE-1") && list.some((m) => m.serial === cfg.CONFIG.DEMO_SERIAL));
await accMod.claimMachine("ABCD-EFGH");
t.check("new serial can be claimed", accMod.hasLinkedMachine() && accMod.linkedSerials().includes("TABLE-1"));
await accMod.signOut();
await user("buyer@example.com");
await accMod.signOut();
await accMod.signIn({ email: "admin@example.com", pin: "letmein1" });
await accMod.adminTransferMachine("TABLE-1", "buyer@example.com");
const after = await accMod.adminListMachines();
const row = after.find((m) => m.serial === "TABLE-1");
t.check("admin can transfer a table to another email", row && row.owner_email === "buyer@example.com", JSON.stringify(row));
await accMod.adminUnlinkMachine("TABLE-1");
const gone = (await accMod.adminListMachines()).find((m) => m.serial === "TABLE-1");
t.check("admin can unlink a table", gone && !gone.owner, JSON.stringify(gone));

// hash matches openssl-style hex of the uppercase code
{
  const h = await accMod.sha256hex("DEMO-0000");
  t.check("claim code hash is 64 hex chars", /^[0-9a-f]{64}$/.test(h), h);
  const again = await accMod.sha256hex("DEMO-0000");
  t.check("hash is stable", h === again);
}

t.check("makeClaimCode format XXXX-XXXX (no 0/O/1/I)", Array.from({ length: 8 }, () => accMod.makeClaimCode()).every((c) => /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(c)));

process.exit(t.done() ? 1 : 0);
