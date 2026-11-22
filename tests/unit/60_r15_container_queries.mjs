// r15 8.1: the Setup step's three-column grid (.cutgrid) is a size container ("cutgrid"), and the rule that depends on how
// wide the columns are (Download G-code turns into an icon so it never overlaps Start cutting) asks the grid's own width
// with @container instead of a viewport-width range. The laptop conditions (hover, fine pointer, height, >= 1200 px) stay a
// media query: a container can't answer those. The grid spans the viewport, so the result is the same (style-diff 54/54).
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("60_r15_container_queries");
const css = fs.readFileSync(SITE + "css/screen-cut.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
t.check("the Setup step's .cutgrid is named as an inline-size container", /\[data-step="3"\] \.cutgrid \{[^}]*container: cutgrid \/ inline-size;/.test(css));
t.check("no viewport max-width range is left for the Download G-code icon", !/@media \(min-width: 1200px\) and \(max-width: 1439px\)/.test(css));
const at = css.indexOf("@container cutgrid (max-width: 1397px)");
t.check("the Download G-code icon rule is a @container cutgrid query", at >= 0 && /#btnExport3 \.dl-label \{ display: none; \}/.test(css.slice(at, at + 900)));
process.exit(t.done() ? 1 : 0);
