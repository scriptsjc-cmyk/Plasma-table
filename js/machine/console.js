// The controller console pane: the log lines and the typed-command box.
import { filterConsoleCommand } from "./admin-machine.js";
import { estopOn } from "../ui/flow.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd, lockText, requireMachine } from "./access.js";
import { M } from "../core/state.js";

export function log(text, level = "rx") {
  const el = $("log"), d = document.createElement("div");
  d.className = level; d.textContent = text; el.appendChild(d);
  while (el.childNodes.length > 300) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
export async function sendConsoleLine(raw, inputEl) {
  const l = String(raw || "").trim();
  if (!l) return;
  // STOP / realtime bytes are never behind the account lock, the Idle check or a confirm
  const live = l === "!" || l === "?" || l === "~" || l === "\x18";
  if (!live && !requireMachine(lockText())) return;
  let f = filterConsoleCommand(l);
  if (!live && estopOn()) {
    const p = filterConsoleCommand(l, { allowTorch: true });
    if (p.send === "$H" || p.moves || p.needsTorchConfirm || /(^|\s)M0*[34](?!\d)/i.test(p.send || "")) { toast("E-STOP is ON. Press and hold the red button to reset it first.", true); return; }
  }
  if (!live) {
    // Same rules as the admin console: nothing is queued behind a running cut, and anything that moves the machine,
    // lights the torch or writes a $ setting needs the controller to be Idle.
    if (M.jobRunning()) { toast("A job is running. Press STOP, or wait until it finishes.", true); return; }
    const needsIdle = f.needsTorchConfirm || f.moves || /^\$\d/.test(f.send || "") || f.send === "$H";
    if (M.grbl && needsIdle && M.state() !== "Idle") { toast("The machine must be Idle (it is " + M.state() + ").", true); return; }
  }
  if (f.needsTorchConfirm) {
    if (!(await askConfirm({ title: "This would fire the torch", body: "Send " + l + "?\n\nTorch over scrap, earth clamp on, hands clear. STOP stays available.", ok: "Send", cancel: "Cancel", danger: true }))) return;
    f = filterConsoleCommand(l, { allowTorch: true });
  }
  if (!f.ok) { toast(f.reason, true); return; }
  if (f.confirm && !(await askConfirm({ title: "Send this command?", body: "Send " + f.send + "?\n\n" + f.confirm.join("\n") + "\n\nSTOP stays available.", ok: "Send", cancel: "Cancel" }))) return;
  if (f.send === "!") { cmd("stop"); }
  else if (f.send === "\x18") { cmd("reset"); }
  else cmd("console", { line: f.send, allowTorch: !!f.send && /M[34]/.test(f.send) });
  if (inputEl) inputEl.value = "";
}
