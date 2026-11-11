import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs"; import { verifyDesign } from "../lib/verify.mjs";
const A = await load(); const t = new T("02_shapes_gcode");
for (const sh of A.SHAPES) {
  const sk = A.newSketch(); sk.add(sh.id, true);
  const it = sk.items[0]; it.x = 25; it.y = 40;
  const cs = sk.contours();
  t.check(`${sh.id}: produces contours`, cs.length > 0, "", "SHAPE-EMPTY");
  t.check(`${sh.id}: all contours closed flag + >=3 pts`, cs.every((c) => c.closed !== false && c.pts.length >= 3), "", "PATH-OPEN");
  verifyDesign(A, t, `shape ${sh.id}`, cs);
  // with a different kerf / lead-in
  verifyDesign(A, t, `shape ${sh.id} kerf2.5 lead6`, cs, { kerf: 2.5, leadIn: 6 });
}
process.exit(t.done() ? 1 : 0);
