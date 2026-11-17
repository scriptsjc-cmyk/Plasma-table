// Floating-head / probe debounce, conservative start block, G38.2 pre-check and tiny-travel abort.
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const t = new T("29_probe_filter");
const F = await mod("probefilter");
const G = await mod("grbl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeTransport() {
  const tx = [];
  return {
    needsHandshake: false,
    write(x) { tx.push(typeof x === "string" ? x : `U${x[0]}`); },
    async close() {},
    tx,
  };
}

// ------------------------------------------------------------------ debounce
{
  const f = F.createProbeFilter({ stableReports: 3 });
  t.check("starts off", !f.displayOn() && !f.blocksAction());
  f.noteRaw(true);
  t.check("one on-sample: lamp stays off", !f.displayOn(), JSON.stringify(f.state()));
  t.check("one on-sample: safety still blocks", f.blocksAction() && f.blocksAction(true) && f.blocksAction(false), JSON.stringify(f.state()));
  f.noteRaw(false);
  t.check("noise pulse then off: lamp stays off", !f.displayOn(), JSON.stringify(f.state()));
  t.check("after pulse clears, no current raw: start is allowed", !f.blocksAction() && !f.blocksAction(false), JSON.stringify(f.state()));
  t.check("passing a live raw-on still blocks even if lamp is off", f.blocksAction(true));
}

{
  const f = F.createProbeFilter({ stableReports: 3 });
  for (const v of [true, false, true, false, true, false]) f.noteRaw(v);
  t.check("flicker never turns the lamp on", !f.displayOn(), JSON.stringify(f.state()));
}

{
  const f = F.createProbeFilter({ stableReports: 3 });
  f.noteRaw(true); f.noteRaw(true);
  t.check("two on-samples: lamp still off", !f.displayOn());
  f.noteRaw(true);
  t.check("three steady on-samples: lamp turns on", f.displayOn(), JSON.stringify(f.state()));
  t.check("steady on blocks", f.blocksAction() && f.blocksAction(false));
  f.noteRaw(false); f.noteRaw(false);
  t.check("two off-samples: lamp stays on (don't hide a real trigger yet)", f.displayOn(), JSON.stringify(f.state()));
  t.check("lamp still on: start stays blocked", f.blocksAction(false));
  f.noteRaw(false);
  t.check("three steady off-samples: lamp turns off", !f.displayOn(), JSON.stringify(f.state()));
  t.check("now clear: start is allowed", !f.blocksAction(false));
}

{
  const f = F.createProbeFilter({ stableReports: 3, falseTripMm: 1 });
  t.check("no start Z: a trip is not called false", !f.tripLooksFalse(0));
  f.markProbeStart(10);
  t.check("tiny travel is a false trip", f.tripLooksFalse(10.05) && f.tripLooksFalse(9.2));
  t.check("real travel is not a false trip", !f.tripLooksFalse(0) && !f.tripLooksFalse(8.9));
  f.clearProbeStart();
  t.check("cleared start Z is not a false trip", !f.tripLooksFalse(10));
}

t.check("isProbeMove sees G38.2", F.isProbeMove("G38.2 Z-50 F300") && F.isProbeMove("G91 G38.2 Z-40 F200"));
t.check("isProbeMove ignores other lines", !F.isProbeMove("G0 Z10") && !F.isProbeMove("G38.3 Z-1") && !F.isProbeMove("M3 S1"));
t.check("parseProbeTripZ reads a success", F.parseProbeTripZ("[PRB:1.000,2.000,-8.500:1]") === -8.5);
t.check("parseProbeTripZ ignores a failed probe", F.parseProbeTripZ("[PRB:0,0,-1:0]") === null);

// ------------------------------------------------------------------ GrblLink: pre-G38.2 gate and tiny-travel abort
F.resetProbeFilter();
const links = [];
function link() {
  const tr = fakeTransport();
  const ev = [];
  const g = new G.GrblLink(tr, 127, (k, d) => ev.push([k, d]));
  links.push(g);
  return { g, tr, ev };
}

{
  const { g, tr, ev } = link();
  g._line("<Idle|MPos:0.000,0.000,10.000|FS:0,0>");
  t.check("clear status: lamp off, start allowed", !F.probeDisplayOn() && !F.probeBlocks(false));
  g.startJob(["G38.2 Z-50 F300", "G91", "G0 Z10", "G90"]);
  const sent = tr.tx.join("");
  t.check("clear probe: G38.2 is sent", /G38\.2 Z-50 F300/.test(sent), sent.slice(-80));
  g._line("[PRB:0.000,0.000,0.000:1]");
  const job = ev.filter(([k]) => k === "job").pop()?.[1];
  t.check("real travel does not abort the job", !job || job.running || job.result !== "error", JSON.stringify(job));
}

{
  const { g, tr, ev } = link();
  F.resetProbeFilter();
  g._line("<Idle|MPos:0.000,0.000,10.000|FS:0,0>");
  g.startJob(["G38.2 Z-50 F300", "G0 Z10"]);
  g._line("[PRB:0.000,0.000,9.400:1]");
  const jobs = ev.filter(([k]) => k === "job").map(([, d]) => d);
  const last = jobs[jobs.length - 1];
  const logs = ev.filter(([k]) => k === "log").map(([, d]) => d.text).join("\n");
  t.check("tiny travel aborts the job", last && last.result === "error" && !last.running, JSON.stringify(last));
  t.check("tiny-travel message mentions noise / height not trusted", /not trusted|false-trigger|flicker|10k/i.test(logs), logs);
  t.check("abort sends a feed hold", tr.tx.includes("!"), tr.tx.join("|"));
}

{
  const { g, tr, ev } = link();
  F.resetProbeFilter();
  g._line("<Idle|MPos:0.000,0.000,10.000|Pn:P|FS:0,0>");
  t.check("raw on: lamp not yet on after one report", !F.probeDisplayOn());
  t.check("raw on: start/touch-off still blocked", F.probeBlocks(true));
  const before = tr.tx.filter((x) => typeof x === "string" && /G38/.test(x)).length;
  g.startJob(["G38.2 Z-50 F300"]);
  const mid = tr.tx.filter((x) => typeof x === "string" && /G38/.test(x)).length;
  t.check("G38.2 is held while the probe bit is on", mid === before, tr.tx.join("|"));
  await sleep(450);
  const jobs = ev.filter(([k]) => k === "job").map(([, d]) => d);
  const last = jobs[jobs.length - 1];
  const logs = ev.filter(([k]) => k === "log").map(([, d]) => d.text).join("\n");
  const after = tr.tx.filter((x) => typeof x === "string" && /G38/.test(x)).length;
  t.check("stuck probe: G38.2 is never sent", after === before, tr.tx.join("|"));
  t.check("stuck probe: job aborts and tells the user", last && last.result === "error" && /already triggered|flicker|10k/i.test(last.message || logs), JSON.stringify({ last, logs: logs.slice(0, 300) }));
}

{
  const { g, tr } = link();
  F.resetProbeFilter();
  g._line("<Idle|MPos:0.000,0.000,10.000|Pn:P|FS:0,0>");
  g.startJob(["G38.2 Z-50 F300"]);
  t.check("held at first: no G38.2 yet", !tr.tx.some((x) => typeof x === "string" && /G38/.test(x)), tr.tx.join("|"));
  g._line("<Idle|MPos:0.000,0.000,10.000|FS:0,0>");
  t.check("probe cleared before the wait timed out: G38.2 is sent", tr.tx.some((x) => typeof x === "string" && /G38\.2/.test(x)), tr.tx.join("|"));
}

for (const g of links) {
  try { await g.close(); } catch (e) { /* ignore */ }
  clearInterval(g.poll);
}
F.resetProbeFilter();

process.exit(t.done() ? 1 : 0);
