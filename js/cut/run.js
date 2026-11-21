// Cut-step buttons: set start point, trace, Start, Pause, cut again, new file.
import { afterStart, startCut } from "./restart.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd, requireMachine } from "../machine/access.js";
import { M, S } from "../core/state.js";
import { blockers, startReminders } from "./checklist.js";
import { refresh } from "../ui/refresh.js";
import { goStep, markFirstJobDone } from "../ui/nav.js";
import { screen, setStartAsk } from "../ui/flow.js";
import { keepAwake } from "../machine/connection.js";
import { maybeLogJob } from "../machine/events.js";
import { startOver } from "../make/files.js";

// Get to cutting, step 2 Setup (S.cur 3) on the Cut tab: the only place a job may start (STOP is on this screen).
const onSetupStep = () => screen() === "cut" && S.tab === "cut" && S.cur === 3;

export function bindRun() {
  // step 3
  $("btnZero").onclick = async () => {
    const sf = M && M.safety, mp = (S.status && S.status.MPos) || [0, 0, 0];
    if (sf && sf.awayFromHome && sf.awayFromHome(mp)) {
      const ok = await askConfirm({
        title: "The torch is a long way from the home corner",
        body: "Start here will put the sheet's back-left corner here, not at the home corner. A part near the sheet origin can then sit outside the machine edges. Jog to the home corner (the sheet's back-left) first unless you really want the sheet corner here.",
        ok: "Use this point anyway",
        cancel: "Cancel",
      });
      if (!ok) return;
    }
    if (cmd("zero_xy")) { S.zeroSet = true; toast("Start point set ✓"); refresh(); }
  };
  $("btnTrace").onclick = () => cmd("trace_outline");
  // step 4
  if ($("checklist")) $("checklist").addEventListener("change", refresh);
  $("btnStart").onclick = async () => {
    if (!onSetupStep()) return;
    if (!requireMachine("Link your machine to run jobs")) return;
    { const b = blockers(); if (b.length) { toast(b[0], true); return; } }   // a script/DOM-poke can't bypass the disabled button: zero, alarm, fit, and the other start gates are re-checked here
    setStartAsk(true);
    let go = false;
    try {
      go = await askConfirm({
        title: "Before you cut",
        body: "",
        lines: startReminders(),
        ok: "Everything's correct – start",
        cancel: "Cancel",
        compact: true,
      });
    } finally { setStartAsk(false); }
    if (!go || !onSetupStep()) return;              // r15 1.1: only ever starts from Get to cutting, step 2 Setup, where STOP is
    { const b = blockers(); if (b.length) { toast(b[0], true); return; } }
    try {
      M.command({ cmd: "feed_override", step: "reset" });  // cut at exactly the speed chosen in step 2
      const fromCut = startCut();
      if (fromCut > 1 && !(await askConfirm({ title: "Continue from cut " + fromCut + "?", body: "Cuts 1 to " + (fromCut - 1) + " are NOT cut again. The torch lifts, moves to the start of cut " + fromCut + " with the arc off, then pierces there. Work zero is kept as it is now. Is the sheet still exactly where it was?", ok: "Continue", cancel: "Cancel" }))) return;
      const edges = M.safety && M.safety.limits;
      // (the practice table is simulated, so there is nothing to crash: no homing question on every practice run, r7 U24)
      if (!edges && !S.demo) {
        const ok = await askConfirm({ title: "Start without homing?", body: "No table edges are saved yet, so the app cannot check this job against the bed. Check the torch is clear and you are happy to start without homing.", ok: "Start anyway", cancel: "Cancel" });
        if (!ok) return;
      }
      S.jobSeq++; S.run = null; S.streamFromCut = fromCut; S.userHold = false; S.ampPauseConsumed = 0; S.ampPause = null;
      S.jobLogId = null; S.jobLoggedEnd = false; M.startJob({ fromCut }); markFirstJobDone(); afterStart(); S.job = M.grbl.jobProgress(); S.lastAlarm = null; keepAwake(true); goStep(4); maybeLogJob(S.job);
      $("btnSaveSpeed").classList.add("hidden");
    }
    catch (e) { toast(e.message, true); }
  };
  // step 5
  $("btnPause").onclick = () => {
    if (S.status.state === "Hold") {
      if (S.ampPause) S.ampPauseConsumed = (S.ampPauseConsumed || 0) + 1;
      S.ampPause = null;
      S.userHold = false;
      cmd("resume");
    } else {
      S.userHold = true;
      cmd("hold");
    }
  };
  $("btnAgain").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Move to the next spot and press Start here."); };
  if ($("btnRezero")) $("btnRezero").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Position was lost. Set a new start point before cutting again."); };
  $("btnNewFile").onclick = () => startOver();
  if ($("btnStreamFallback")) $("btnStreamFallback").onclick = () => {
    try {
      const fromCut = S.streamFromCut || startCut() || 1;
      S.jobSeq++; S.run = null; S.jobLogId = null; S.jobLoggedEnd = false; S.userHold = false; S.ampPauseConsumed = 0; S.ampPause = null;
      M.startJob({ fromCut, stream: true });
      markFirstJobDone(); afterStart(); S.job = M.grbl.jobProgress(); S.lastAlarm = null; S.needStreamFallback = false;
      keepAwake(true); goStep(4); maybeLogJob(S.job);
      $("btnStreamFallback").classList.add("hidden");
      $("btnSaveSpeed").classList.add("hidden");
    } catch (e) { toast(e.message, true); }
  };
}
