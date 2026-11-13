import { mod, readJs, allJsText, jsPath } from "../lib/site.mjs";
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
import { pathToFileURL } from "node:url";
const A = await load();
const t = new T("09_ux2");
const dialect = await mod("dialect");
const adv = await mod("admin-machine");
const src = "G21 G90\n$32=0\nG0 X10 Y10\nG4 P0.4\nM3\nG1 X20 F1000\nM5\n";

const mach = dialect.convertGcode(src, "mach3");
t.check("Mach3 export wraps with %", mach.trim().startsWith("%") && mach.trim().endsWith("%"));
t.check("Mach3 export drops $ commands", !/\$/.test(mach.replace(/%/g, "")));
t.check("Mach3 keeps M3 and M5", /\bM3\b/.test(mach) && /\bM5\b/.test(mach));
t.check("Mach3 G4 P stays in seconds", /G4 P0\.4/.test(mach));
t.check("Mach3 file extension is .tap", dialect.dialectExtension("mach3") === ".tap");
t.check("Mach3 adds M30", /\bM30\b/.test(mach));

const fl = dialect.convertGcode(src, "fluidnc");
t.check("FluidNC export drops $ commands", !/^\$/m.test(fl));
t.check("FluidNC keeps M3", /\bM3\b/.test(fl));

const numbered = dialect.convertGcode("G0 X1\nG1 X2\n", "grbl", { lineNumbers: true });
t.check("optional line numbers look like N10 / N20", /N10 /.test(numbered) && /N20 /.test(numbered));

const blocked = adv.filterConsoleCommand("M3");
t.check("M3 is not allowed without confirm", blocked.ok === false && blocked.needsTorchConfirm === true);
const allowed = adv.filterConsoleCommand("M3", { allowTorch: true });
t.check("M3 is allowed after confirm (rebuilt tokens)", allowed.ok === true && allowed.send === "M3");
t.check("M7 still blocked", adv.filterConsoleCommand("M7").ok === false);
t.check("$RST still blocked", adv.filterConsoleCommand("$RST=*").ok === false);
t.check("plain $$ still allowed", adv.filterConsoleCommand("$$").ok === true);

const sk = A.newSketch();
sk.add("rect", true);
const it = sk.items[0]; it.p.w = 100; it.p.h = 60; it.x = 10; it.y = 20; sk.pick([it.id]);
sk.rotateBy(90);
t.check("Turn 90 keeps bottom-left", Math.abs(sk.items[0].x - 10) < 0.05 && Math.abs(sk.items[0].y - 20) < 0.05, `now ${sk.items[0].x},${sk.items[0].y}`);
t.check("Turn 90 swaps W/H", Math.abs(sk.items[0].p.w - 60) < 0.05 && Math.abs(sk.items[0].p.h - 100) < 0.05, `now ${sk.items[0].p.w}x${sk.items[0].p.h}`);

const empty = A.newSketch();
t.check("new sketch has no default rectangle", empty.items.length === 0, `${empty.items.length} items`);
process.exit(t.done() ? 1 : 0);
