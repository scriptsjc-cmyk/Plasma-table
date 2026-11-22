// r15 Round 9 (before selling), the data side, written before the code:
//   9.6 cut history (date, part, material, thickness, time, finished or stopped) and the last job's log and alarms
//   9.5 consumables: tip and electrode pierces, each with its own reset; practice runs never count
//   9.3 the problem report: version, settings, last job log and alarms, and never a password, key or sign-in token
//   9.4 machine settings backup / restore: checked as a whole, refused if any part is bad (nothing half-restored)
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const t = new T("62_r15_round9");
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m }; };
const H = await mod("cuthistory");

// ---------------------------------------------------------------- 9.6 entries
{
  const e = H.makeEntry({ at: new Date("2026-11-22T10:00:00Z"), part: "Bracket\u0007 <b>", material: "Mild steel", thickness: 3, seconds: 125.6, result: "done", practice: false });
  t.check("9.6 an entry has the date, part, material, thickness, time and 'finished'", e.at === "2026-11-22T10:00:00.000Z" && e.part === "Bracket <b>" && e.material === "Mild steel" && e.thickness === 3 && e.seconds === 126 && e.result === "finished" && e.practice === false, JSON.stringify(e));
  const s = H.makeEntry({ at: new Date(), part: "", result: "stopped" }), a = H.makeEntry({ at: new Date(), result: "alarm" }), r = H.makeEntry({ at: new Date(), result: "error" });
  t.check("9.6 stopped / alarm / error are all 'stopped', with why", s.result === "stopped" && s.why === "stop" && a.result === "stopped" && a.why === "alarm" && r.result === "stopped" && r.why === "error", JSON.stringify([s, a, r]));
  t.check("9.6 a part with no name is 'Untitled part'", s.part === "Untitled part", s.part);
  t.check("9.6 a running or unknown result is not an entry", H.makeEntry({ result: null }) === null && H.makeEntry({ result: "weird" }) === null);
  const st = mem();
  for (let i = 0; i < 230; i++) H.addEntry(st, H.makeEntry({ at: new Date(2026, 0, 1, 0, i), part: "P" + i, result: "done" }));
  const list = H.readHistory(st);
  t.check(`9.6 the history keeps the newest ${H.MAX_HISTORY}, newest first`, list.length === H.MAX_HISTORY && list[0].part === "P229" && list[list.length - 1].part === "P" + (230 - H.MAX_HISTORY), JSON.stringify([list.length, list[0].part, list[list.length - 1].part]));
  st.setItem(H.HISTORY_KEY, JSON.stringify([{ at: "x" }, 5, null, { at: "2026-11-22T10:00:00.000Z", part: "ok", result: "finished", seconds: 3 }]));
  t.check("9.6 a damaged stored history keeps only good rows", H.readHistory(st).length === 1 && H.readHistory(st)[0].part === "ok", JSON.stringify(H.readHistory(st)));
  st.setItem(H.HISTORY_KEY, "{not json");
  t.check("9.6 an unreadable history is empty, not an error", Array.isArray(H.readHistory(st)) && H.readHistory(st).length === 0);
  H.clearHistory(st);
  t.check("9.6 Clear empties the history", H.readHistory(st).length === 0);
}
// ---------------------------------------------------------------- 9.6 / 9.3 the recorder: one entry per job, its log and alarms kept
{
  const st = mem();
  const rec = new H.JobRecorder(st, () => ({ part: "Plate", material: "Mild steel", thickness: 2, practice: true }));
  rec.onLog("before the job");                           // not part of the job
  rec.onJob({ running: true, result: null, elapsed: 0 });
  for (let i = 0; i < 400; i++) rec.onLog("G1 X" + i);
  rec.onAlarm(2, "Soft limit");
  rec.onJob({ running: true, result: null, elapsed: 3 });
  rec.onJob({ running: false, result: "alarm", elapsed: 42, message: "Job stopped by alarm 2" });
  rec.onJob({ running: false, result: "alarm", elapsed: 42 });     // job events repeat: still one entry
  const list = H.readHistory(st), last = H.readLastJob(st), al = H.readAlarms(st);
  t.check("9.6 the recorder writes one entry when the job ends", list.length === 1 && list[0].result === "stopped" && list[0].why === "alarm" && list[0].seconds === 42 && list[0].part === "Plate" && list[0].practice === true, JSON.stringify(list));
  t.check("9.3 the last job's log is kept (the newest lines, capped) without lines from before it", last && last.lines.length === H.MAX_LOG_LINES && last.lines[last.lines.length - 1] === "G1 X399" && !last.lines.includes("before the job") && last.result === "alarm", JSON.stringify(last && { n: last.lines.length, end: last.lines.slice(-1), r: last.result }));
  t.check("9.3 alarms are kept with their code and message", al.length === 1 && al[0].code === 2 && /Soft limit/.test(al[0].message) && last.alarms.length === 1, JSON.stringify([al, last && last.alarms]));
  rec.onJob({ running: true, result: null, elapsed: 0 });
  rec.onJob({ running: false, result: "done", elapsed: 10 });
  t.check("9.6 the next job is a new entry, newest first", H.readHistory(st).length === 2 && H.readHistory(st)[0].result === "finished", JSON.stringify(H.readHistory(st)));
  for (let i = 0; i < 40; i++) rec.onAlarm(i, "A" + i);
  t.check(`9.3 the alarm list keeps the last ${H.MAX_ALARMS}`, H.readAlarms(st).length === H.MAX_ALARMS && H.readAlarms(st)[0].code === 39, JSON.stringify(H.readAlarms(st).slice(0, 2)));
}
// ---------------------------------------------------------------- 9.5 consumables
{
  const { PierceCounter, PIERCE_KEY } = await mod("coupon");
  const st = mem();
  st.setItem(PIERCE_KEY, JSON.stringify({ lifetime: 500, since: 1 }));           // the old format: a lifetime total only
  const c = new PierceCounter(st);
  t.check("9.5 an old counter file loads (lifetime kept, tip and electrode start at 0)", c.lifetime === 500 && c.tip.n === 0 && c.electrode.n === 0, JSON.stringify(c.consumables()));
  const pierce = (demo) => { c.feed({ torch: false }, { running: true, demo, jobRef: 1 }); c.feed({ torch: true }, { running: true, demo, jobRef: 1 }); };
  for (let i = 0; i < 5; i++) pierce(false);
  t.check("9.5 each real pierce counts on the tip, the electrode and the lifetime", c.tip.n === 5 && c.electrode.n === 5 && c.lifetime === 505, JSON.stringify(c.consumables()));
  for (let i = 0; i < 3; i++) pierce(true);
  t.check("9.5 practice pierces never count on the tip or electrode", c.tip.n === 5 && c.electrode.n === 5 && c.lifetime === 505 && c.job === 8, JSON.stringify(c.consumables()));
  c.resetTip();
  t.check("9.5 New tip resets the tip only", c.tip.n === 0 && c.tip.since > 0 && c.electrode.n === 5 && c.lifetime === 505, JSON.stringify(c.consumables()));
  const other = new PierceCounter(st); other.resetElectrode();                     // e.g. reset from Settings while the cut screen's counter is live
  pierce(false);
  t.check("9.5 a reset made elsewhere is not undone by the next pierce", c.electrode.n === 1 && c.tip.n === 1 && new PierceCounter(st).electrode.n === 1, JSON.stringify([c.consumables(), new PierceCounter(st).consumables()]));
  st.setItem(PIERCE_KEY, JSON.stringify({ lifetime: -4, tip: { n: "x" }, electrode: { n: 1e12 } }));
  const bad = new PierceCounter(st);
  t.check("9.5 a damaged counter file loads as zeros, not NaN", bad.lifetime === 0 && bad.tip.n === 0 && bad.electrode.n === 0, JSON.stringify(bad.consumables()));
}
// ---------------------------------------------------------------- 9.3 the problem report never carries a secret
{
  const R = await mod("report");
  const st = mem();
  const SECRETS = ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlc2VjcmV0", "hunter2-password", "sb_secret_ABCDEF123456", "refresh-tok-998877"];
  st.setItem("sb-abcd-auth-token", JSON.stringify({ access_token: SECRETS[0], refresh_token: SECRETS[3] }));
  st.setItem("plasma.account", JSON.stringify({ email: "josh@example.com", password: SECRETS[1] }));
  st.setItem("plasma.settings.v1", JSON.stringify({ units: "mm", bed: { x: 1300, y: 800, z: 60 }, fluidnc: { host: "plasma.local", port: 81 }, apiKey: SECRETS[2], torch: { pierceHeight: 3.5, token: SECRETS[3] } }));
  st.setItem("plasma.limits", JSON.stringify({ limits: { x: [0, 1250], y: [0, 780], z: [-60, 0] } }));
  const hist = await mod("cuthistory");
  const rec = new hist.JobRecorder(st, () => ({ part: "Plate", material: "Mild steel", thickness: 2, practice: false }));
  rec.onJob({ running: true }); rec.onLog("G1 X10 Y10"); rec.onLog("Authorization: Bearer " + SECRETS[0]); rec.onAlarm(1, "Hard limit"); rec.onJob({ running: false, result: "alarm", elapsed: 9 });
  const rep = R.collectReport(st, { version: { id: "2026.11.22-abc1234", commit: "abc1234" }, env: { ua: "test", screen: "1280x600" }, connected: { kind: "usb", firmware: "grblHAL 1.1f" } });
  const text = R.reportText(rep);
  t.check("9.3 the report has the version, settings, edges, last job log, alarms and cut history", rep.version.id === "2026.11.22-abc1234" && rep.settings && rep.settings.bed.x === 1300 && rep.machine.limits && rep.lastJob.lines.includes("G1 X10 Y10") && rep.alarms.length === 1 && rep.history.length === 1, text.slice(0, 600));
  t.check("9.3 the report carries no password, key, sign-in token or account e-mail", SECRETS.every((s) => !text.includes(s)) && !text.includes("josh@example.com") && !/sb-abcd-auth-token|access_token|refresh_token/.test(text), text);
  t.check("9.3 no key in the report is named like a secret", !/"[^"]*(pass(word)?|secret|token|api_?key|service_?role|jwt|auth)[^"]*"\s*:/i.test(text), text.match(/"[^"]*(pass|secret|token|key|auth)[^"]*"\s*:/gi));
  t.check("9.3 the report is plain JSON a person can read", (() => { try { return JSON.parse(text).kind === "porta-plazma-problem-report"; } catch (e) { return false; } })());
}
// ---------------------------------------------------------------- 9.4 machine settings backup / restore
{
  const B = await mod("machinebackup");
  const st = mem();
  st.setItem("plasma.limits", JSON.stringify({ limits: { x: [0, 1250], y: [0, 780], z: [-60, 0] }, saved: "2026-11-20" }));
  st.setItem("plasma.speeds", JSON.stringify({ "Mild steel|3": 1900, "Aluminium|2": 2600 }));
  st.setItem("plasma.material", JSON.stringify({ m: "Mild steel", t: 3 }));
  st.setItem("plasma.slowHoles", "0");
  st.setItem("plasma.origins.v1", JSON.stringify([{ id: "a", name: "Left vice", x: 10, y: 20, savedAt: 5 }]));
  st.setItem("plasma.sheet", JSON.stringify({ w: 1250, h: 2500, clearance: 2 }));
  st.setItem("sb-abcd-auth-token", "SECRET-TOKEN");
  const file = B.makeBackup(st, { app: { units: "mm" }, presets: [], at: "2026-11-22T10:00:00Z" });
  const text = JSON.stringify(file);
  t.check("9.4 the backup holds the edges, saved speeds, material, small-hole choice, start points and sheet", file.kind === B.BACKUP_KIND && file.machine.limits.x[1] === 1250 && file.machine.speeds["Mild steel|3"] === 1900 && file.machine.material.t === 3 && file.machine.slowHoles === "0" && file.machine.origins.length === 1 && file.machine.sheet.w === 1250, text);
  t.check("9.4 the backup holds no sign-in token", !text.includes("SECRET-TOKEN"), text);
  const ok = B.checkBackup(JSON.parse(text));
  t.check("9.4 a good backup checks clean and lists what it will replace", ok.errors.length === 0 && ok.parts.includes("edges") && ok.parts.includes("saved speeds"), JSON.stringify(ok));
  const st2 = mem(); st2.setItem("plasma.limits", JSON.stringify({ limits: { x: [0, 999], y: [0, 999], z: [-10, 0] } }));
  B.applyBackup(st2, ok);
  t.check("9.4 restore writes every part back", JSON.parse(st2.getItem("plasma.limits")).limits.x[1] === 1250 && JSON.parse(st2.getItem("plasma.speeds"))["Aluminium|2"] === 2600 && st2.getItem("plasma.slowHoles") === "0" && JSON.parse(st2.getItem("plasma.origins.v1"))[0].name === "Left vice" && JSON.parse(st2.getItem("plasma.sheet")).h === 2500, JSON.stringify([...st2._m]));
  const evil = JSON.parse(text); evil.machine.limits = { x: [0, 1e9], y: [0, 780], z: [-60, 0] }; evil.machine.speeds["Mild steel|3"] = -5;
  const bad = B.checkBackup(evil);
  t.check("9.4 a backup with bad edges or a bad speed is refused, with the reason", bad.errors.length >= 2 && bad.errors.some((e) => /edge/i.test(e)) && bad.errors.some((e) => /speed/i.test(e)), JSON.stringify(bad.errors));
  t.check("9.4 refused means nothing is restored", (() => { const s3 = mem(); s3.setItem("plasma.limits", "{\"limits\":null}"); try { B.applyBackup(s3, bad); } catch (e) { /* refused */ } return s3.getItem("plasma.limits") === "{\"limits\":null}" && s3.getItem("plasma.speeds") === null; })());
  t.check("9.4 something that is not a machine backup is refused", B.checkBackup({ hello: 1 }).errors.length > 0 && B.checkBackup(null).errors.length > 0 && B.checkBackup({ kind: B.BACKUP_KIND, v: 99 }).errors.length > 0);
  const tiny = JSON.parse(text); tiny.machine.limits = { x: [0, 5], y: [0, 780], z: [-60, 0] };
  t.check("9.4 edges smaller than 20 mm are refused", B.checkBackup(tiny).errors.some((e) => /edge/i.test(e)));
}
process.exit(t.done() ? 1 : 0);
