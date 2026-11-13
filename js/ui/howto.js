// Built-in "How to use" guide. The first topic is a first practice cut.

const STEPS = [
  { id: "practice", title: "Your first practice cut (5 steps)", body: [
    "1. On Make a part, pick a simple shape (a rectangle is fine) and type its size.",
    "2. Press Cut this part. That opens the cutting screen on the Part step, where you pick the material and thickness.",
    "3. Tick Practice run – the torch stays off. The header chip says “Practice run · torch off” on a real machine. You can try this without a linked machine.",
    "4. The part cuts where you place it on the bed. Then press Start here at the sheet's bottom-left corner so the table knows where that corner is (skipped in Practice if it is already set).",
    "5. Press Start cutting and watch the path. This is the safest first job. The red STOP button (or the space bar) cancels at once.",
  ]},
  { id: "make", title: "Make a part", body: [
    "Simple view is big templates you fill in. Advanced tools is the full drawing editor: lines, rectangles, circles, holes, join, snap and more. Preset parts (in the corner) is a library of ready-made parts, separate from the basic shapes under More shapes.",
    "On the drawing, drag a part to move it. Blue sizes on the outline can be clicked (or tapped) to type an exact measurement. Wheel zooms to the pointer; drag empty space, use two fingers, or the arrow keys to pan when nothing is selected.",
    "Press Cut this part when the drawing looks right. That sends the part to the cutting screen, starting at material and thickness.",
  ]},
  { id: "cut", title: "Cutting screen", body: [
    "The steps are: 1 Part (material and thickness), 2 Setup (place the sheet and set Start here), then cut.",
    "Practice run keeps the torch off (the header chip says “Practice run · torch off”). Pause holds motion and the torch. STOP or the space bar cancels the job. The red STOP button stays visible even if you hide the header.",
    "A red TORCH ON pill in the header lights whenever the controller says the torch is firing.",
  ]},
  { id: "zero", title: "Set the start point (Start here)", body: [
    "Put the sheet on the slats. On Setup, jog the torch to the sheet's bottom-left corner, at a safe height.",
    "Press Start here. That sets the start point. If you skip it, Start is blocked — you could cut in the wrong place.",
    "Use Trace the outline (torch off) to walk the path on the sheet before a real cut.",
  ]},
  { id: "link", title: "Link a machine", body: [
    "Create an account (or use a local demo account with the claim code DEMO-0000).",
    "Each sold table has a claim code on its sticker. Open Account → Link a machine, type the code, and the table is tied to you.",
    "Design and save are free without a machine. You can practise without one. Connect, jog and a real cut stay locked until a table is linked.",
  ]},
  { id: "materials", title: "Materials and settings", body: [
    "Pick a material and thickness on the Part step. If the admin has published cut presets, those become the default pierce delay, height, speed and kerf.",
    "You can override speed on the slider, and save a speed that worked. Settings → Material library keeps your own presets on this device.",
    "Pierce height, cut height and delay are edited under Settings → Torch & THC.",
  ]},
  { id: "setup", title: "Setting up a new table", body: [
    "This app talks to a plasma table through USB or Bluetooth serial (grblHAL / FluidNC) in Chrome or Edge on a computer.",
    "Typical wiring: the controller drives stepper drivers (for example DM542TE) for X, Y and Z; a relay fires the torch on M3 and turns it off on M5; a floating-head or ohmic probe finds the sheet; optional home switches and an e-stop feed input pins.",
    "Leave the torch lead, earth clamp and air supply as the cutter manufacturer describes. The app never replaces the e-stop.",
  ]},
  { id: "trouble", title: "Troubleshooting", body: [
    "Won’t connect: use Chrome or Edge on a computer. Plug in the USB cable, or pair the table in Windows Bluetooth settings first, then press Connect and pick its port (Bluetooth shows as “Standard Serial over Bluetooth link”). Close the FluidNC installer or any other program using the port first.",
    "Wrong size: check units (mm), kerf, and that Start here was set at the corner you meant. Trace the outline before cutting.",
    "Not cutting through: slow down a step, confirm amps and thickness, check air pressure and earth clamp, and that pierce delay is long enough for the arc to start.",
    "Torch won’t fire: not a practice run? M3 is confirmed in the console and the Torch test is on Machine setup. Check the torch relay wiring and that the cutter is ready.",
  ]},
  { id: "fluidnc", title: "FluidNC on an ESP32", body: [
    "A typical path: an ESP32-DevKitC with a screw-terminal breakout, running FluidNC, driving stepper drivers.",
    "On a computer in Chrome or Edge, press Connect (USB or Bluetooth) and pick the board’s port. If you paired it in Windows Bluetooth settings first, it shows as Standard Serial over Bluetooth link.",
    "FluidNC stores settings in config.yaml, not GRBL $ numbers. To change a setting, edit the YAML and copy it to the board, then restart it. This is documented in docs/FLUIDNC.md.",
  ]},
];

export function openHowto(id) {
  const dlg = document.getElementById("howtoDlg"); if (!dlg) return;
  dlg.classList.remove("hidden");
  paintNav(id || STEPS[0].id);
}

export function closeHowto() {
  const dlg = document.getElementById("howtoDlg"); if (dlg) dlg.classList.add("hidden");
}

function paintNav(id) {
  const nav = document.getElementById("howtoNav");
  const body = document.getElementById("howtoBody");
  const title = document.getElementById("howtoTitle");
  if (!nav || !body) return;
  nav.replaceChildren();
  const pick = document.createElement("select");                 // a phone: one compact picker instead of ten stacked buttons
  pick.className = "howto-pick"; pick.setAttribute("aria-label", "Guide section");
  for (const s of STEPS) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.title; o.selected = s.id === id; pick.appendChild(o); }
  pick.onchange = () => paintNav(pick.value);
  nav.appendChild(pick);
  for (const s of STEPS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "howto-step" + (s.id === id ? " sel" : "");
    b.textContent = s.title;
    b.onclick = () => paintNav(s.id);
    nav.appendChild(b);
  }
  const step = STEPS.find((s) => s.id === id) || STEPS[0];
  if (title) title.textContent = "How to use";
  body.replaceChildren();
  const h = document.createElement("h3"); h.textContent = step.title; body.appendChild(h);
  for (const para of step.body) {
    const p = document.createElement("p"); p.textContent = para; body.appendChild(p);
  }
}

export function bindHowto() {
  const btn = document.getElementById("btnHowto");
  if (btn) btn.onclick = () => openHowto();
  const dlg = document.getElementById("howtoDlg");
  if (dlg) dlg.addEventListener("click", (e) => { if (e.target === dlg) closeHowto(); });
  const close = document.getElementById("howtoClose");
  if (close) close.onclick = closeHowto;
}

export { STEPS as HOWTO_STEPS };
