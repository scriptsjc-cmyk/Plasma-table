// r15 6.1 (plan 7.7): small holes are cut slower. A hole under 25 mm gets about 60 % of the chart speed (Hypertherm
// guidance): rounder holes, less taper. It's a cut-chart setting, on by default; the part's outline keeps 100 %.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("42_small_hole_speed");
const circ = (cx, cy, r, n = 72) => ({ pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]), closed: true, circle: { cx, cy, r } });
const rect = (x, y, w, h) => ({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
const plate = (holes) => [rect(0, 0, 120, 80), ...holes];
const SH = { under: 25, pct: 60 };
const cut = A.cutFor("Mild steel", 3), feed = Number(cut.feed_mm_min);
const fOf = (lines) => lines.filter((l) => /^G1 F/.test(l)).map((l) => Number(l.slice(4)));
// the feed set right after each pierce
const pierceFeeds = (job) => job.cutIndex.map((c) => { for (let i = c.line; i < job.lines.length; i++) if (/^G1 F/.test(job.lines[i])) return Number(job.lines[i].slice(4)); return null; });

// ---- the chart setting
const sh = A.chart.small_holes;
t.check("the cut chart has a small-holes setting, on by default (under 25 mm at 60 %)", !!sh && sh.on === true && Number(sh.under_mm) === 25 && Number(sh.speed_pct) === 60, JSON.stringify(sh));
t.check("the setting says where the numbers come from", !!sh && /hypertherm/i.test(String(sh.source || "")), JSON.stringify(sh && sh.source));

// ---- CAM marks the small holes only
{
  const cs = plate([circ(30, 40, 5), circ(85, 40, 15)]);           // Ø10 and Ø30
  const g = A.designToGcode(cs, { kerf: 1.5, leadIn: 3, name: "p", smallHoles: SH });
  const tags = g.gcode.split("\n").filter((l) => /PORTA-SLOW/.test(l));
  t.check("a Ø10 hole is marked to cut at 60 %; a Ø30 hole and the outline are not", tags.length === 1 && /PORTA-SLOW 60/.test(tags[0]), JSON.stringify(tags));
  const info = g.cutInfo.map((c) => [c.hole, c.slow || 0]);
  t.check("cutInfo says which cuts are slowed", JSON.stringify(info.filter(([h, s]) => s).length) === "1" && info.some(([h, s]) => h && s === 60) && info.every(([h, s]) => h || !s), JSON.stringify(info));
  const plain = A.designToGcode(cs, { kerf: 1.5, leadIn: 3, name: "p" });
  t.check("without the setting nothing is marked", !/PORTA-SLOW/.test(plain.gcode));
  t.check("the mark is a comment: the moves are the same with or without it", g.gcode.split("\n").filter((l) => !/PORTA-SLOW/.test(l)).join("\n") === plain.gcode);

  // ---- the job builder sets the feed at each pierce
  const job = A.prepareJob(g.gcode, cut, A.machine, false);
  const pf = pierceFeeds(job), slowAt = g.cutInfo.findIndex((c) => c.slow);
  t.check("the small hole's pierce is followed by 60 % of the chart feed", pf[slowAt] === Math.round(feed * 0.6 * 1000) / 1000, JSON.stringify({ pf, feed }));
  t.check("every other cut gets the full feed (the outline keeps 100 %)", pf.every((f, i) => i === slowAt || f === feed), JSON.stringify(pf));
  const jobPlain = A.prepareJob(plain.gcode, cut, A.machine, false);
  t.check("the job takes longer with the slow-down (time estimate follows the feed)", job.stats.estimated_seconds > jobPlain.stats.estimated_seconds, JSON.stringify([job.stats.estimated_seconds, jobPlain.stats.estimated_seconds]));
  t.check("no feed is ever above the chart feed", fOf(job.lines).every((f) => f <= feed));
  const dry = A.prepareJob(g.gcode, cut, A.machine, true);
  t.check("a practice run slows the same hole", pierceFeeds(dry)[slowAt] === Math.round(feed * 0.6 * 1000) / 1000, JSON.stringify(pierceFeeds(dry)));
  // ---- continue from cut N keeps the right feed
  const slowN = slowAt + 1, fastN = g.cutInfo.findIndex((c, i) => i !== slowAt) + 1;
  const safe = (n) => { try { return A.restartLines(job, n); } catch (e) { return { body: [] }; } };
  const rs = safe(slowN), rf = safe(fastN);
  t.check("Continue from the small hole's cut starts at 60 %", fOf(rs.body)[0] === Math.round(feed * 0.6 * 1000) / 1000, JSON.stringify(fOf(rs.body).slice(0, 2)));
  t.check("Continue from another cut starts at full feed", fOf(rf.body)[0] === feed, JSON.stringify(fOf(rf.body).slice(0, 2)));
}
// ---- non-round holes: the largest size counts
{
  const g = A.designToGcode(plate([rect(20, 20, 12, 8), rect(60, 30, 40, 8)]), { kerf: 1.5, leadIn: 3, name: "p", smallHoles: SH });
  const n = g.gcode.split("\n").filter((l) => /PORTA-SLOW/.test(l)).length;
  t.check("a 12 × 8 cut-out is slowed; a 40 × 8 slot is not", n === 1, String(n));
}
// ---- a hole that is cut in several runs (tabs are only on outlines, so this is one run) and imported G-code
{
  const ext = "G21 G90\n(PORTA-SLOW 60)\nG0 X10 Y10\nM3\nG1 X20 Y10\nM5\nG0 X30 Y30\nM3\nG1 X40 Y30\nM5\nM30\n";
  const job = A.prepareJob(ext, cut, A.machine, false);
  t.check("the slow-down applies to the next pierce only", JSON.stringify(pierceFeeds(job)) === JSON.stringify([Math.round(feed * 0.6 * 1000) / 1000, feed]), JSON.stringify(pierceFeeds(job)));
  const odd = A.prepareJob("G21 G90\n(PORTA-SLOW 5)\nG0 X1 Y1\nM3\nG1 X9 Y1\nM5\nM30\n", cut, A.machine, false);
  t.check("a silly percentage is held to 20 %–100 %", pierceFeeds(odd)[0] === Math.round(feed * 0.2 * 1000) / 1000, JSON.stringify(pierceFeeds(odd)));
}
t.done();
