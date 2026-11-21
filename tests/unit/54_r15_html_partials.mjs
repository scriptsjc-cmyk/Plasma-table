// r15 8.4: the screen markup lives in the html/ partials, and index.html is
// just the shell (head, header + STOP, safety banners, the shared preview, the
// safety prompt). The page built at start-up must have exactly the same
// elements, in the same order, as before the move.
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";
import { assemblePage, idsIn, partialList } from "../lib/partials.mjs";

const t = new T("54_r15_html_partials");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i).slice(0, 400) : ""));
const read = (f) => fs.readFileSync(SITE + f, "utf8");
const index = read("index.html");
const parts = partialList();
const partHtml = parts.map(read).join("\n");

ck("index.html is a shell of at most 420 lines", index.split("\n").length <= 420, index.split("\n").length + " lines");

const { html, problems } = assemblePage();
ck("every slot in index.html is filled exactly once and every partial template has a slot", problems.length === 0, problems);

// Same elements, same order, nothing lost or doubled (snapshot taken before the move, r15 8.4).
const want = JSON.parse(read("tests/data/r15-page-ids.json"));
const got = idsIn(html);
const firstDiff = got.findIndex((id, i) => id !== want[i]);
ck("the page built at start-up has the same element ids in the same order", got.length === want.length && firstDiff === -1,
  { got: got.length, want: want.length, at: firstDiff, gotId: got[firstDiff], wantId: want[firstDiff] });
ck("no element id appears twice", new Set(got).size === got.length, got.filter((x, i) => got.indexOf(x) !== i));

const MOVED = ["jogTpl", "verPop", "numPad", "cadDialog", "toolBar", "accountDlg", "claimDlg", "gateDlg", "migrateDlg", "saveDlg",
  "makeCheckDlg", "undoSave", "conflictDlg", "adminDlg", "announceDlg", "phoneBar", "featSheet", "phoneSheet", "drawSizeDlg",
  "toolbarCustom", "drawHud", "cadCtxMenu", "sidewaysHint", "dimEdit", "fsBar", "addPartsDlg", "importDlg", "resizeDlg",
  "sizeDlg", "importAskDlg", "straightDlg", "settingsDlg", "howtoDlg"];
const stillHere = MOVED.filter((id) => new RegExp(`id="${id}"`).test(index));
ck("the screen dialogs and sheets are in the html/ partials, not index.html", stillHere.length === 0, stillHere);

// Safety: these must be in the page even before any partial loads.
const SAFETY = ["btnStop", "estopBar", "alarmBar", "lostBar", "safeDlg", "turnOverlay", "connPill"];
for (const id of SAFETY) ck(`#${id} stays in the index.html shell, not in a partial`, new RegExp(`id="${id}"`).test(index) && !new RegExp(`id="${id}"`).test(partHtml));

const onDisk = fs.readdirSync(SITE + "html").filter((f) => f.endsWith(".html")).map((f) => "html/" + f).sort();
ck("boot.js loads every html/ partial (none left unused)", JSON.stringify([...parts].sort()) === JSON.stringify(onDisk), { parts, onDisk });
const sw = read("sw.js");
for (const f of parts) ck(`sw.js precaches ${f}`, sw.includes(`"${f}"`));

process.exit(t.done() ? 1 : 0);
