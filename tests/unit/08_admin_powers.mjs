import { mod, readJs, allJsText, jsPath } from "../lib/site.mjs";
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
import { pathToFileURL } from "node:url";
const A = await load();
const t = new T("08_admin_powers");
const accMod = await mod("account");
const geom = await mod("geom");
const adv = await mod("admin-machine");

function wipe() { A.store.clear(); }

wipe();
await accMod.initAccount();
t.check("canGrantDemoAdmin is true in node/unit tests", accMod.canGrantDemoAdmin() === true);
await accMod.signUp({ email: "josh-demo@example.com", pin: "letmein1", display_name: "Josh", mode: "pro" });
t.check("new demo user is not admin", accMod.isAdmin() === false);
await accMod.grantDemoAdmin();
t.check("grantDemoAdmin still works in unit tests", accMod.isAdmin() === true);

const users = await accMod.adminListUsers("");
t.check("adminListUsers returns the demo account", users.some((u) => u.email === "josh-demo@example.com"));
await accMod.adminCreateAnnouncement({ title: "Hello", body: "Body only text", severity: "info" });
const anns = await accMod.listAnnouncements();
t.check("admin can create and list an announcement", anns.length >= 1 && anns[0].title === "Hello" && anns[0].body === "Body only text");
const ev = await accMod.logJobEvent({ status: "started", serial: "DEMO-1", partCount: 2, cutLengthMm: 120 });
t.check("logJobEvent started returns an id", ev && ev.ok && ev.id);
await accMod.logJobEvent({ status: "finished", eventId: ev.id, durationS: 12, cutLengthMm: 120, partCount: 2, serial: "DEMO-1" });
const stats = await accMod.adminUsageStats();
t.check("usage stats count the finished job", stats.jobs_finished >= 1 && stats.cut_length_mm >= 120, JSON.stringify(stats));

await accMod.adminUpsertCutPreset({ material: "Mild steel", thickness_mm: 3, pierce_delay_s: 0.4, pierce_height_mm: 2, cut_speed_mm_min: 2400 });
const presets = await accMod.listCutPresets();
t.check("cut preset is saved", presets.some((p) => p.material === "Mild steel" && Number(p.thickness_mm) === 3));

// console filter
t.check("$$ is allowed", adv.filterConsoleCommand("$$").ok);
t.check("$100=80 is allowed", adv.filterConsoleCommand("$100=80").ok && adv.filterConsoleCommand("$100=80").send === "$100=80");
t.check("laser mode is blocked", !adv.filterConsoleCommand("$32=1").ok);
t.check("$RST is blocked", !adv.filterConsoleCommand("$RST=*").ok);
t.check("M3 is blocked", !adv.filterConsoleCommand("M3 S1000").ok);
t.check("STOP is allowed", adv.filterConsoleCommand("!").ok);
t.check("long console jog is blocked", !adv.filterConsoleCommand("G91 G0 X999").ok);
t.check("short jog is allowed", adv.filterConsoleCommand("G91 G0 X10").ok);

// expandContour / bulge
const straight = geom.expandContour({ pts: [[0, 0], [10, 0], [10, 10]], closed: true, bulges: [0, 0, 0] });
t.check("expandContour leaves a straight triangle alone", straight.pts.length === 3);
const arc = geom.expandContour({ pts: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true, bulges: [0.5, 0, 0, 0] });
t.check("expandContour tessellates a bulged edge into more than 2 points", arc.pts.length > 4, String(arc.pts.length));
const mid = geom.bulgeMidpoint([0, 0], [10, 0], 1);
t.check("semicircle bulge midpoint sits 5 mm off the chord", Math.abs(mid[1]) > 4 && Math.abs(mid[0] - 5) < 0.2, JSON.stringify(mid));
process.exit(t.done() ? 1 : 0);
