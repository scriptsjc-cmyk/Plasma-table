// Built-in "How to use" guide: first setup, linking, zero, practice cut,
// first real cut, materials, the full-screen editor, troubleshooting,
// and FluidNC notes.

const STEPS = [
  { id: "setup", title: "First setup and wiring", body: [
    "This app talks to a plasma table through USB (grblHAL / FluidNC) or over Wi-Fi (a Pi bridge, or FluidNC on an ESP32).",
    "Typical wiring: the controller drives stepper drivers (for example DM542TE) for X, Y and Z; a relay fires the torch on M3 and turns it off on M5; a floating-head or ohmic probe finds the sheet; optional home switches and an e-stop feed input pins.",
    "Leave the torch lead, earth clamp and air supply as the cutter manufacturer describes. The app never replaces the e-stop.",
  ]},
  { id: "link", title: "Link a machine", body: [
    "Create an account (or use a local demo account with the claim code DEMO-0000).",
    "Each sold table has a claim code on its sticker. Open Account → Link a machine, type the code, and the table is tied to you.",
    "Design and save are free without a machine. Connect, jog, Send and Run stay locked until a table is linked. The lock message is always: sign in, then link a machine.",
  ]},
  { id: "layout", title: "Step 3: Get set up (sheet layout)", body: [
    "The picture shows your sheet (blue) and the machine's work area (green dashes). Add parts with Add parts…: tick saved parts and/or choose several DXF or SVG files at once, and type how many of each. Arrange for me packs them with the right gaps.",
    "Drag a part to move it (mouse or finger). Blue lines show when it lines up with the sheet edges, the middle, or another part's edges and centres; the numbers are the gaps in mm. Turn 90° either way, turn to any angle, mirror, copy and delete are under the picture. Pro also has arrow-key nudge and a grid snap.",
    "A part turns red when it is closer to another part than the kerf plus clearance, overlaps one, or hangs off the sheet or the machine's work area. Start stays locked until nothing is red.",
    "The sheet's bottom-left corner is your start point: every part is cut exactly where it sits on the sheet picture.",
  ]},
  { id: "zero", title: "Set zero (Start here)", body: [
    "Put the sheet on the slats. In step 3, jog the torch to the sheet's bottom-left corner, at a safe height.",
    "Press Start here. That is work zero. Step 3 ticks “Start point set” only after you do this. If you skip it, Start is blocked and you’ll see a warning — you could cut in the wrong place.",
    "Use Trace the outline (torch off) to walk the path on the sheet before a real cut.",
  ]},
  { id: "practice", title: "A practice (dry) run", body: [
    "On step 2 (Material), tick Practice run – move only, torch stays off. A PRACTICE RUN chip appears in the header.",
    "In step 3 tick the check boxes, and press Start. The machine moves the path with the torch off so you can see it will fit.",
    "This is the safest first job on a new setup.",
  ]},
  { id: "cut", title: "A first real cut", body: [
    "Untick Practice run. Confirm material and thickness, air on, plasma set to the listed amps, earth clamp on the sheet, and hands clear.",
    "A red TORCH ON pill in the header lights whenever the controller says the torch is firing — on every tab, not just the run screen.",
    "Pause holds motion and the torch. STOP or Esc cancels the job at once. Do not close the tab while a job is running. If you Disconnect mid-cut, the torch may stay on until you stop it.",
  ]},
  { id: "materials", title: "Materials and settings", body: [
    "Pick a material and thickness. If the admin has published cut presets, those become the default pierce delay, height, speed and kerf — the cut flow uses them.",
    "You can override speed on the slider, and save a speed that worked. Settings → Material library keeps your own presets on this device.",
    "Pierce height, cut height and delay live under Settings → Pierce & cut (and on step 2 under More settings).",
  ]},
  { id: "editor", title: "The full-screen shape editor", body: [
    "On Make a shape, press Full-screen editor. The canvas fills the screen. The toolbar has draw outline, rectangle, circle, slot, arc, holes, join, subtract, mirror, rotate, array, fillet/chamfer, offset, align, dimensions, snap, undo/redo, zoom/fit and edit-edge.",
    "After Draw outline, click an edge to type an exact length, square it up, set an angle, or turn it into a curve. Drag corners, double-click to add one, Delete removes one.",
    "Click a blue size on the drawing and type in the box (100/2 and 25+3 are fine). Enter applies, Esc cancels, Tab goes to the next size, arrows nudge. On a phone, the system keypad appears.",
    "Press Esc or Done to leave full screen. Your part stays on the canvas.",
  ]},
  { id: "trouble", title: "Troubleshooting", body: [
    "Won’t connect: use Chrome or Edge on a computer for USB. Close Mach3 or anything else using the port. For FluidNC, you must open this app over http on the LAN — GitHub Pages is https and the browser will block ws://. See the FluidNC page in this guide.",
    "Wrong size: check units (mm), kerf, and that Start here was set at the corner you meant. Trace the outline before cutting.",
    "Not cutting through: slow down a step, confirm amps and thickness, check air pressure and earth clamp, and that pierce delay is long enough for the arc to start.",
    "Torch won’t fire: not a practice run? M3 is confirmed in the console and the Torch test is on Setup. Check the torch relay wiring and that the cutter is ready.",
  ]},
  { id: "fluidnc", title: "FluidNC on an ESP32", body: [
    "Josh’s path: a DUBEUYEW ESP32-DevKitC V1 (30-pin) with a screw-terminal breakout, running FluidNC over Wi-Fi, driving DM542TE drivers.",
    "On Connect, choose FluidNC (Wi-Fi) and enter the board’s IP or fluidnc.local. The app uses ws://<host>:81, which is GRBL-compatible (status reports, realtime bytes, jobs).",
    "FluidNC stores settings in config.yaml, not GRBL $ numbers. Settings hides the $ editor for FluidNC and offers a YAML template (config/fluidnc-plasma.yaml) for this machine.",
    "Mixed content: the live site is https, FluidNC is ws:// on the LAN, and browsers block that. Serve a local copy over http (scripts/serve-local.sh), open the app from the ESP32’s own web server, or use USB. This is documented in docs/FLUIDNC.md.",
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
  for (const s of STEPS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "howto-step" + (s.id === id ? " sel" : "");
    b.textContent = s.title;
    b.onclick = () => paintNav(s.id);
    nav.appendChild(b);
  }
  const step = STEPS.find((s) => s.id === id) || STEPS[0];
  if (title) title.textContent = step.title;
  body.replaceChildren();
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
