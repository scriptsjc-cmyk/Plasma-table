// Why a control is switched off (hover text), and the sign-in / link-your-machine gate on Start.
import { screen } from "./flow.js";
import { syncWhy } from "./whyoff.js";
import { openGate } from "../account/accounthome.js";
import * as Acc from "../account/account.js";
import { S } from "../core/state.js";
import { lockText, machineAllowed } from "../machine/access.js";
import { blockers } from "../cut/checklist.js";
import { $, $$ } from "../core/dom.js";
import { paintMenu } from "./nav.js";

// ---- why a control is greyed (aria-disabled + data-why); see whyoff.js
function whyOff(el) {
  const id = el.id, busy = S.connected && S.status && S.status.state && !/^(Idle|Check)$/i.test(S.status.state);
  const needConn = !S.connected ? "Connect to the table first." : null;
  if (el.matches && el.matches(".j[data-axis], .steps button")) return needConn || (S.job && S.job.running ? "Not while a job is running." : /alarm/i.test((S.status && S.status.state) || "") ? "Clear the alarm first." : "Not available right now.");
  if (el.hasAttribute && el.hasAttribute("data-mv")) return Number(el.dataset.mv) < 0 ? "Already first in the order." : "Already last in the order.";
  switch (id) {
    case "next1": return screen() === "make" ? "Pick a shape first." : "Upload a file or pick saved parts first.";
    case "btnStart": {
      if (!machineAllowed()) return Acc.isSignedIn() ? "Link a machine to run jobs." : "Sign in and link a machine to run jobs.";
      try { const b = blockers(); if (b && b.length) return String(b[0]).replace(/\s+/g, " ").slice(0, 90); } catch (e) { /* fall through */ }
      return "Not ready to start yet.";
    }
    case "btnZero": return needConn || (S.job && S.job.running ? "Not while a job is running." : "Wait until the machine is idle.");
    case "btnTrace": return !S.prepared ? "Make a shape or open a file first." : needConn || "Wait until the machine is idle.";
    case "btnGoStart": return needConn || (!S.zeroSet ? "Set the start point first." : "Wait until the machine is idle.");
    case "skUndo": return "Nothing to undo.";
    case "skRedo": return "Nothing to redo.";
    case "skClear": return "There is nothing on the sheet to clear.";
    case "skAll": return "There is nothing to select.";
    case "rsKeep": return "Only for imported drawings.";
    case "btnDemoEdges": return "The demo is finding the table edges now.";
    default: return needConn || (busy ? "Wait until the machine stops moving." : (S.job && S.job.running ? "Not while a job is running." : "Not available right now."));
  }
}
const padUnavailable = (el) => !!(el.matches && el.matches(".j[data-axis], .steps button")) && (!S.connected || !!(S.job && S.job.running));
export const paintWhy = () => syncWhy(whyOff, padUnavailable);
export function refreshGate() {
  const needLink = !Acc.hasLinkedMachine();
  $("btnConnect").classList.toggle("locked", needLink);
  $("connectLock").classList.toggle("hidden", !needLink);
  const runLocked = needLink && !S.demo;
  $("btnStart").classList.toggle("locked", runLocked);
  $("connectLockText").textContent = "🔒 " + lockText();      // round 5: the one lock note, next to Connect (Start says why under the button)
  const send = $("btnConsoleSend");
  if (send) send.classList.toggle("locked", runLocked);
  document.body.classList.toggle("run-locked", runLocked);
  $$(".jogwrap, .jogmount").forEach((el) => el.classList.toggle("locked", runLocked && !S.connected));
  paintMenu();                                   // B5 17: the main menu's "machine linked" line follows a claim at once
}
export function bindGate() {
  $("btnLinkMachine").onclick = () => openGate("Link your machine to run jobs");
}
