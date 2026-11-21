// r15 Round 8 (code tidy) safety net: a refactor must not change what any screen looks like.
//   node tools/visual-snap.mjs snap <dir>              screenshots of fixed scenes at laptop and phone sizes
//   node tools/visual-snap.mjs compare <dirA> <dirB>   pixel compare (in the browser, no extra packages); diff PNGs in <dirB>/diff
// Animations, transitions and the caret are switched off so two runs of the same code match exactly.
import fs from "node:fs";
import path from "node:path";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { PROFILES, SCENES, prepare } from "./scenes.mjs";

async function snap(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const srv = await startServer(), br = await launch();
  let n = 0;
  for (const prof of PROFILES) for (const [name, run] of Object.entries(SCENES)) {
    const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
    try {
      await prepare(page, run);
      await page.screenshot({ path: path.join(dir, `${prof}--${name}.png`) }); n++;
    } catch (e) { console.log(`  ! ${prof} ${name}: ${e.message.split("\n")[0]}`); }
    await page.context().close();
  }
  await br.close(); srv.close();
  console.log(`${n} screenshots in ${dir}`);
}

async function compare(a, b) {
  const files = fs.readdirSync(a).filter((f) => f.endsWith(".png")).sort();
  const br = await launch(), page = await (await br.newContext()).newPage();
  await page.setContent("<canvas></canvas>");
  const diffDir = path.join(b, "diff"); fs.mkdirSync(diffDir, { recursive: true });
  let bad = 0;
  for (const f of files) {
    if (!fs.existsSync(path.join(b, f))) { console.log(`MISSING ${f}`); bad++; continue; }
    const A = fs.readFileSync(path.join(a, f)).toString("base64"), B = fs.readFileSync(path.join(b, f)).toString("base64");
    if (A === B) continue;
    const r = await page.evaluate(async ([A, B]) => {
      const img = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + s; });
      const [ia, ib] = [await img(A), await img(B)];
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: true };
      const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height; const x = c.getContext("2d");
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height);
      x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height);
      const out = x.createImageData(c.width, c.height); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
        const p = i / 4, px = p % c.width, py = (p / c.width) | 0;
        if (d > 24) { n++; out.data[i] = 255; out.data[i + 3] = 255; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
        else { const g = (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 3; out.data[i] = out.data[i + 1] = out.data[i + 2] = 200 + g / 5; out.data[i + 3] = 255; }
      }
      x.putImageData(out, 0, 0);
      return { n, box: n ? [x0, y0, x1, y1] : null, png: n ? c.toDataURL("image/png").split(",")[1] : null };
    }, [A, B]);
    if (r.size) { console.log(`SIZE ${f}`); bad++; continue; }
    if (r.n && r.n <= 10) { console.log(`noise ${f}: ${r.n} px in [${r.box.join(", ")}]`); continue; }
    if (r.n) { bad++; console.log(`DIFF ${f}: ${r.n} px in [${r.box.join(", ")}]`); fs.writeFileSync(path.join(diffDir, f), Buffer.from(r.png, "base64")); }
  }
  await br.close();
  console.log(bad ? `${bad} of ${files.length} differ` : `all ${files.length} identical`);
  process.exit(bad ? 1 : 0);
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === "snap" && x) await snap(x);
else if (cmd === "compare" && x && y) await compare(x, y);
else { console.log("usage: visual-snap.mjs snap <dir> | compare <dirA> <dirB>"); process.exit(2); }
