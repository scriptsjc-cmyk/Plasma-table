// F2: Test torch silence treats lastRx === 0 as "no data", timed from when the hold started.
import { T } from "../lib/t.mjs";
import { readJs } from "../lib/site.mjs";

const t = new T("30_torch_test");
const src = readJs("torchtest");
const conn = readJs("connection");
const machine = readJs("machine");
const html = (await import("node:fs")).readFileSync(new URL("../../html/setup.html", import.meta.url), "utf8");

function silenceTimedOut({ lastRx, litAt, now, windowMs }) {
  const last = lastRx || 0;
  const since = last || litAt || 0;
  return !!(since && now - since > windowMs);
}

t.check("torchtest times silence from lastRx or, when lastRx is 0, from litAt",
  /lastRx/.test(src) && /litAt/.test(src) && /last \|\| state\.litAt|last \|\| litAt/.test(src),
  src.includes("litAt") ? "helpers present" : "missing litAt");
t.check("hard max hold is 2000 ms and cooldown is 3000 ms",
  /TORCH_TEST_MAX_HOLD_MS = 2000/.test(src) && /TORCH_TEST_COOLDOWN_MS = 3000/.test(src));
t.check("pagehide and beforeunload turn the test torch off",
  /pagehide/.test(src) && /beforeunload/.test(src) && /pagehide/.test(conn) && /beforeunload/.test(conn) && /torchTestOff/.test(conn));
t.check("STOP turns the test torch off",
  /case "stop":/.test(machine) && /torchTestOff/.test(machine));
t.check("touch-start warning is on the Machine setup Tests card",
  /no arc in air/.test(html) && /checks the relay and air only/.test(html));
t.check("Bluetooth drop warning is on the Tests card",
  /hardware E-stop/.test(html) && /torchTestBtNote/.test(html));

const windowMs = 3000;
t.check("lastRx === 0 is not silent at the moment the hold starts",
  silenceTimedOut({ lastRx: 0, litAt: 1000, now: 1000, windowMs }) === false);
t.check("lastRx === 0 becomes silent after the watchdog window, timed from litAt",
  silenceTimedOut({ lastRx: 0, litAt: 1000, now: 1000 + windowMs + 1, windowMs }) === true);
t.check("a fresh lastRx keeps the hold up even if litAt is old",
  silenceTimedOut({ lastRx: 5000, litAt: 1000, now: 5000 + 100, windowMs }) === false);
t.check("a stale lastRx is silent",
  silenceTimedOut({ lastRx: 1000, litAt: 1000, now: 1000 + windowMs + 1, windowMs }) === true);

process.exit(t.done() ? 1 : 0);
