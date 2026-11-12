// Cut-step buttons: set start point, trace, Start, Pause, cut again, new file.
import { afterStart, startCut } from "./restart.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd, requireMachine } from "../machine/access.js";
import { M, S } from "../core/state.js";
import { blockers } from "./checklist.js";
import { refresh } from "../ui/refresh.js";
import { goStep, markFirstJobDone } from "../ui/nav.js";
import { keepAwake } from "../machine/connection.js";
import { maybeLogJob } from "../machine/events.js";
import { startOver } from "../make/files.js";

export function bindRun() {
  // step 3
  $("btnZero").onclick = () => { if (cmd("zero_xy")) { S.zeroSet = true; toast("Start point set ✓"); refresh(); } };
  $("btnTrace").onclick = () => cmd("trace_outline");
  // step 4
  $("checklist").addEventListener("change", refresh);
  $("btnStart").onclick = async () => {
    if (!requireMachine("Link your machine to run jobs")) return;
    { const b = blockers(); if (b.length) { toast(b[0], true); return; } }   // a script/DOM-poke can't bypass the disabled button: zero, alarm, fit, checklist are re-checked here
    try {
      M.command({ cmd: "feed_override", step: "reset" });  // cut at exactly the speed chosen in step 2
      const fromCut = startCut();
      if (fromCut > 1 && !(await askConfirm({ title: "Continue from cut " + fromCut + "?", body: "Cuts 1 to " + (fromCut - 1) + " are NOT cut again. The torch lifts, moves to the start of cut " + fromCut + " with the arc off, then pierces there. Work zero is kept as it is now. Is the sheet still exactly where it was?", ok: "Continue", cancel: "Cancel" }))) return;
      const edges = M.safety && M.safety.limits;
      if (!edges) {
        const ok = await askConfirm({ title: "Start without homing?", body: "No table edges are saved yet, so the app cannot check this job against the bed. Check the torch is clear and you are happy to start without homing.", ok: "Start anyway", cancel: "Cancel" });
        if (!ok) return;
      }
      S.jobSeq++; S.run = null;
      S.jobLogId = null; S.jobLoggedEnd = false; M.startJob({ fromCut }); markFirstJobDone(); afterStart(); S.job = M.grbl.jobProgress(); S.lastAlarm = null; keepAwake(true); goStep(4); maybeLogJob(S.job);
      $("btnSaveSpeed").classList.add("hidden");
    }
    catch (e) { toast(e.message, true); }
  };
  // step 5
  $("btnPause").onclick = () => cmd(S.status.state === "Hold" ? "resume" : "hold");
  $("btnAgain").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Move to the next spot and press Start here."); };
  if ($("btnRezero")) $("btnRezero").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Position was lost. Set a new start point before cutting again."); };
  $("btnNewFile").onclick = () => startOver();
}
