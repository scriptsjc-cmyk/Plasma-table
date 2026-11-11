// Machine access rules: send a command only when allowed (signed in, machine linked, not e-stopped).
import { openGate } from "../account/accounthome.js";
import * as Acc from "../account/account.js";
import { M, S } from "../core/state.js";
import { toast } from "../core/dom.js";

export function cmd(name, extra = {}) {
  if (!M.grbl) { toast("Connect to the table first.", true); return null; }
  try {
    const r = M.command({ cmd: name, ...extra });
    if (r && r.note) toast(r.note);
    return r;
  } catch (e) { toast(e.message, true); return null; }
}
// ------------------------------------------------------------------ accounts / machine gate
export function machineAllowed() {
  // The on-screen demo controller is free so people can look around and design.
  if (S.demo) return true;
  return Acc.realControlAllowed();
}
// the wording has to match the account: never say "sign in" to someone who already is
export const lockText = (what = "run jobs") => Acc.isSignedIn() ? `Locked: link a machine to ${what}. You are signed in; use Link a machine.` : `Locked: sign in, then link a machine to ${what}.`;
export function requireMachine(why) {
  if (machineAllowed()) return true;
  if (Acc.hasLinkedMachine()) {
    // A demo/test-mode "link" is browser-only: it never unlocks real hardware on a site with accounts.
    toast("Demo accounts can't control a real machine. Open the site normally and sign in.", true);
    return false;
  }
  openGate(why || lockText());
  return false;
}
