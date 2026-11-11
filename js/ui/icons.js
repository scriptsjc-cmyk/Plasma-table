// Replaces emoji with the app's own line icons.


// One stroke icon set. Emoji in buttons, tabs and status pills are swapped for these symbols.
const ICON_GLYPHS = [
  ["🗑", "trash"], ["🔍", "search"], ["📍", "pin"], ["📂", "folder"], ["📏", "ruler"],
  ["⊂⊃", "slot"], ["⟳", "rotate-cw"], ["⟲", "rotate-ccw"], ["⤢", "expand"], ["⤡", "resize"],
  ["⛶", "fullscreen"], ["⇤", "align-left"], ["⤓", "arrow-down"], ["⤒", "arrow-up"], ["⌂", "home"],
  ["⚠", "warning"], ["⚙", "gear"], ["✂", "cut"], ["✥", "move"], ["🔒", "lock"], ["▶", "play"],
  ["⏸", "pause"], ["✏", "pencil"], ["✎", "pencil"], ["↺", "undo"], ["↻", "rotate-cw"], ["➖", "minus"],
  ["⊞", "arrange"], ["⇋", "flip"], ["⧉", "copy"], ["✕", "close"], ["●", "dot"], ["▣", "square"],
  ["▭", "rect"], ["◯", "circle"], ["△", "triangle"], ["◔", "sector"], ["⊖", "minus-circle"],
  ["⊕", "plus"], ["⁘", "dots"], ["⟋", "slash"], ["⧈", "offset"], ["↔", "arrows-h"], ["⌒", "arc"],
  ["⌜", "corner"], ["◈", "diamond"], ["⌗", "grid"], ["✲", "asterisk"], ["⋯", "more"],
  ["↶", "undo"], ["↷", "redo"], ["▲", "arrow-up"], ["▼", "arrow-down"], ["◀", "arrow-left"],
  ["←", "arrow-left"], ["→", "arrow-right"], ["↑", "arrow-up"], ["↓", "arrow-down"],
].sort((a, b) => b[0].length - a[0].length);
function iconForGlyph(ch, el) {
  if (ch === "▶" && el.closest(".jog")) return "arrow-right";
  if (ch === "●" && !el.closest("#connPill")) return null;
  if (ch === "▲" && el.closest(".selhead")) return null;
  const hit = ICON_GLYPHS.find(([g]) => g === ch);
  return hit ? hit[1] : null;
}
function iconSvg(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.appendChild(use);
  return svg;
}
function shouldDressIcon(el) {
  if (!el || el.closest("script, style, textarea, input, .ico, #log, #advConsoleLog, #whyTip, .selhead, [data-shape], [data-bshape], .libgrid")) return false;
  return !!el.closest("button, .tab, .pill, .locknote, .turnicon, .jog, .ampsnote, .quickbar");
}
function replaceEmojiText(node) {
  const raw = node.nodeValue;
  const parent = node.parentElement;
  if (!raw || !shouldDressIcon(parent)) return;
  const segs = [];
  let i = 0, buf = "", changed = false;
  while (i < raw.length) {
    let hit = null;
    for (const pair of ICON_GLYPHS) {
      if (raw.startsWith(pair[0], i)) { hit = pair; break; }
    }
    if (!hit) {
      const cp = raw.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      buf += ch;
      i += ch.length;
      continue;
    }
    const name = iconForGlyph(hit[0], parent);
    if (!name) { buf += hit[0]; i += hit[0].length; continue; }
    if (buf) segs.push({ t: buf });
    buf = "";
    segs.push({ i: name });
    changed = true;
    i += hit[0].length;
  }
  if (buf) segs.push({ t: buf });
  if (!changed) return;
  const frag = document.createDocumentFragment();
  for (const s of segs) frag.appendChild(s.t != null ? document.createTextNode(s.t) : iconSvg(s.i));
  node.parentNode.replaceChild(frag, node);
}
function dressIcons(root) {
  if (!root || root.nodeType !== 1) return;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) replaceEmojiText(node);
}
export function installIcons() {
  let queued = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const list = queued;
    queued = [];
    for (const el of list) dressIcons(el);
  };
  const queue = (el) => {
    if (!el || el.nodeType !== 1) return;
    queued.push(el);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  };
  dressIcons(document.body);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "characterData" && r.target.parentElement) queue(r.target.parentElement);
      for (const node of r.addedNodes) {
        if (node.nodeType === 1) queue(node);
        else if (node.nodeType === 3 && node.parentElement) queue(node.parentElement);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
