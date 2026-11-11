// The "Put the table on your Wi-Fi" screen: pick the home network the controller can see, type its password, save it on the
// controller, then restart it and find it on the network. The talking to the controller is in machine/wifi.js.
import { $, esc, toast } from "../core/dom.js";
import { M, S } from "../core/state.js";
import { openDlg, closeAll } from "../account/uibase.js";
import { machineAllowed, requireMachine } from "../machine/access.js";
import { joinNetwork, scanNetworks, wifiBlocker } from "../machine/wifi.js";

let chosen = "", hostname = "";
const show = (id) => { for (const p of ["wifiPick", "wifiForm", "wifiDone"]) $(p).classList.toggle("hidden", p !== id); };
const forgetPassword = () => { const p = $("wifiPw"); p.value = ""; p.type = "password"; const b = document.querySelector('.pwshow[data-pw="wifiPw"]'); if (b) { b.textContent = "Show"; b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", "Show password"); } };
const blocker = () => wifiBlocker({ connected: !!(S.connected && M.grbl), viaPi: !!S.wifi, jobRunning: M.jobRunning() });
const bars = (sig) => sig >= 70 ? "Strong" : sig >= 40 ? "OK" : "Weak";

function paintWhy() {
  const why = blocker();
  $("wifiWhy").textContent = why; $("wifiWhy").classList.toggle("hidden", !why);
  $("wifiScan").disabled = !!why;
  return why;
}
export function openWifiSetup() {
  if (!machineAllowed()) { requireMachine(); return; }
  chosen = ""; forgetPassword(); $("wifiList").innerHTML = ""; $("wifiScanning").classList.add("hidden");
  show("wifiPick"); paintWhy(); openDlg("wifiDlg");
}
async function scan() {
  if (paintWhy()) return;
  $("wifiScan").disabled = true; $("wifiScanning").classList.remove("hidden"); $("wifiList").innerHTML = "";
  let r;
  try { r = await scanNetworks(M.grbl); } catch (e) { r = { list: null, error: String(e && e.message || e) }; }
  $("wifiScan").disabled = false; $("wifiScanning").classList.add("hidden"); $("wifiScan").textContent = "Look again";
  hostname = r.hostname || "";
  if (!r.list) { $("wifiList").innerHTML = `<li class="warntext">The controller didn't answer the Wi-Fi scan. This works with FluidNC controllers (version 3.7 or newer). You can still type your Wi-Fi name: press "My Wi-Fi isn't in the list".</li>`; return; }
  if (!r.list.length) { $("wifiList").innerHTML = `<li class="muted">No Wi-Fi found. Move the table nearer the router, or type the name.</li>`; return; }
  $("wifiList").innerHTML = r.list.map((a, i) => `<li><button type="button" data-ap="${i}"><b>${esc(a.ssid)}</b><span class="muted">${bars(a.signal)} signal${a.locked ? " · needs a password" : " · open"}</span></button></li>`).join("");
  $("wifiList").querySelectorAll("button[data-ap]").forEach((b) => { b.onclick = () => pick(r.list[Number(b.dataset.ap)]); });
}
function pick(ap) {
  chosen = ap ? ap.ssid : "";
  $("wifiSsidRow").classList.toggle("hidden", !!ap);
  $("wifiChosen").innerHTML = ap ? `Wi-Fi: <b>${esc(ap.ssid)}</b>` : "";
  $("wifiSsid").value = ap ? ap.ssid : "";
  $("wifiPwRow").classList.toggle("hidden", !!ap && !ap.locked);
  $("wifiFormErr").classList.add("hidden");
  $("wifiJoin").textContent = ap ? `Connect the table to ${ap.ssid}` : "Connect the table";
  forgetPassword(); show("wifiForm");
  (ap && !ap.locked ? $("wifiJoin") : ap ? $("wifiPw") : $("wifiSsid")).focus();
}
function formProblem(ssid, pw, needsPw) {
  if (!ssid) return "Type the name of your Wi-Fi.";
  if (new TextEncoder().encode(ssid).length > 32) return "That Wi-Fi name is too long (32 letters at most).";
  if (needsPw && pw.length < 8) return "Wi-Fi passwords are at least 8 characters. Check it and type it again.";
  if (pw.length > 64) return "That password is too long (64 characters at most).";
  return "";
}
async function join(e) {
  e.preventDefault();
  const ssid = (chosen || $("wifiSsid").value).trim(), needsPw = !$("wifiPwRow").classList.contains("hidden");
  const pw = needsPw ? $("wifiPw").value : "";
  const bad = formProblem(ssid, pw, needsPw) || blocker();
  if (bad) { $("wifiFormErr").textContent = bad; $("wifiFormErr").classList.remove("hidden"); return; }
  forgetPassword();                                       // the field is emptied before anything is sent; only the controller gets it
  $("wifiJoin").disabled = true; $("wifiJoin").textContent = "Sending to the table…";
  let r;
  try { r = await joinNetwork(M.grbl, ssid, pw); } catch (err) { r = { ok: false, error: String(err && err.message || err) }; }
  $("wifiJoin").disabled = false; $("wifiJoin").textContent = `Connect the table to ${ssid}`;
  if (!r.ok) { $("wifiFormErr").textContent = `The controller didn't take the setting (${r.failed || "Wi-Fi"}: ${r.error || "no answer"}). Check it's a FluidNC controller and try again.`; $("wifiFormErr").classList.remove("hidden"); return; }
  $("wifiDoneSsid").textContent = ssid;
  $("wifiDoneHost").textContent = `http://${hostname || "fluidnc"}.local`;
  if ($("fnHost") && !$("fnHost").value) $("fnHost").value = `${hostname || "fluidnc"}.local`;
  show("wifiDone");
}
async function restart() {
  if (!M.grbl) { toast("The controller is not connected. Switch it off and on again instead."); return; }
  $("wifiRestart").disabled = true;
  try { await M.grbl.ask("$Bye", { timeout: 1500 }); } catch (e) { /* it drops the link as it restarts */ }
  $("wifiRestart").disabled = false;
  toast("Restarting the controller. Give it about 20 seconds.");
}
export function bindWifiSetup() {
  $("btnWifiSetup").onclick = openWifiSetup;
  $("wifiScan").onclick = scan;
  $("wifiOther").onclick = () => pick(null);
  $("wifiBack").onclick = () => { forgetPassword(); show("wifiPick"); };
  $("wifiForm").addEventListener("submit", join);
  $("wifiRestart").onclick = restart;
  $("wifiDlg").addEventListener("click", (e) => { if (e.target === $("wifiDlg")) closeAll(); });
  // however the box is closed (Close, Esc, a tap outside), the password field is emptied
  new MutationObserver(() => { if ($("wifiDlg").classList.contains("hidden")) forgetPassword(); }).observe($("wifiDlg"), { attributes: true, attributeFilter: ["class"] });
}
