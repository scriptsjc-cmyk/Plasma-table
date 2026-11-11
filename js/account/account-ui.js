// Account, parts, claim and admin dialogs: start-up wiring. The pieces live next to this file; the host (app.js) passes toast/esc and hooks for mode, design load/save, and gating.
import { bindAdmin } from "./adminview.js";
import { bindAnnounce } from "./announceui.js";
import { bindAuthForms } from "./authforms.js";
import { bindDialogs, bindHome, openAccount, paintAccountChrome } from "./accounthome.js";
import { bindPartsList } from "./partslist.js";
import { bindSavePart } from "./savepart.js";
import { host, setHost, toast } from "./uibase.js";
import { initAdminMachine } from "../machine/admin-machine.js";
import * as A from "./account.js";

function bind() {
  bindDialogs();
  bindAuthForms();
  bindPartsList();
  bindHome();
  bindSavePart();
  bindAdmin();
  bindAnnounce();
}
export async function initAccountUi(opts) {
  setHost(opts || {});
  await A.initAccount();
  bind();
  initAdminMachine({
    toast,
    isAdmin: () => A.isAdmin(),
    isPro: () => A.canPro(),
    send: host.sendAdvanced,
    confirm: host.confirm,
    readSettings: host.readSettings,
    writeSettings: host.writeSettings,
    calMove: host.calMove,
    addPattern: host.addPattern,
  });
  A.onAccountChange(() => paintAccountChrome());
  paintAccountChrome();
  try { await A.touchLastActive(); } catch (e) { /* ignore */ }
  if (A.snapshot().recovery) openAccount("newpin");
  return A.snapshot();
}
export { A as accountApi };
