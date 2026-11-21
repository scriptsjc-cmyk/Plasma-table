// r15 8.5: fold3d.js is split into geometry (fold3d-geom.js: the 3D builders and thickening), the models (fold3d-models.js:
// the registry of each preset's 3D, pipe-end flanges, foldModel), the renderer (fold3d-render.js: projection, shading, edges, sizes in 3D, thumbnails) and the viewer (fold3d-view.js: the
// small view, the lightbox, turning it with the mouse). fold3d.js re-exports exactly what it exported before, so nothing
// that imports it changes. Layers: geometry imports none of the others; models only geometry; the renderer not the viewer.
import fs from "node:fs";
import { T } from "../lib/t.mjs";

const t = new T("53_r15_fold3d_split");
const BEFORE = ["DEFAULT_CAM","FOLD_MODELS","addPipeFlanges3d","addTopFlanges","assemble","attach","dimLabels","displayThickness","drawFoldCanvas","face","foldAngle","foldBritches","foldC","foldCuboid","foldDisc","foldElbow","foldFishmouth","foldFrustum","foldHat","foldHopper","foldLiddedBox","foldLiddedCross","foldModel","foldOpenBox","foldOpenHem","foldPipeOnFlat","foldRectElbow","foldRedElbow","foldS2r","foldSaddleHole","foldScoop","foldTakeoff","foldTee","foldThumbSvg","foldTileSvg","foldTrayCross","foldTube","foldU","foldUSaddle","foldYBranch","foldZ","isFoldPart","modelDims","mountFoldView","rectElbowDims","redElbowDims","takeoffCollarH","thicken"];
const url = (f) => new URL(`../../js/make/${f}`, import.meta.url);
const F = await import("../../js/make/fold3d.js");
const now = Object.keys(F).sort();
t.check(`fold3d.js exports the same ${BEFORE.length} names as before the split`, JSON.stringify(now) === JSON.stringify(BEFORE),
  `added: ${now.filter((k) => !BEFORE.includes(k)).join(", ")} missing: ${BEFORE.filter((k) => !now.includes(k)).join(", ")}`);
for (const f of ["fold3d-geom.js", "fold3d-models.js", "fold3d-render.js", "fold3d-view.js"]) {
  const ok = fs.existsSync(url(f)), n = ok ? fs.readFileSync(url(f), "utf8").split("\n").length : 0;
  t.check(`${f} exists and is under 1,000 lines`, ok && n < 1000, `${n} lines`);
}
const src = (f) => (fs.existsSync(url(f)) ? fs.readFileSync(url(f), "utf8") : "");
const imports = (f) => [...src(f).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
t.check("fold3d.js is only the re-exports (under 40 lines)", src("fold3d.js").split("\n").length < 40, `${src("fold3d.js").split("\n").length} lines`);
t.check("geometry imports none of the other fold3d modules", !imports("fold3d-geom.js").some((m) => /fold3d/.test(m)), imports("fold3d-geom.js").join(", "));
t.check("the models import only geometry", !imports("fold3d-models.js").some((m) => /fold3d-(render|view)/.test(m)), imports("fold3d-models.js").join(", "));
t.check("the renderer does not import the viewer", !imports("fold3d-render.js").some((m) => /fold3d-view/.test(m)), imports("fold3d-render.js").join(", "));
process.exit(t.done() ? 1 : 0);
