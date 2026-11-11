// Pro cut list: reorder cuts, skip a cut, change where each one starts.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";

// ================================================================ Pro cut list (reorder + skip)
function fullOrder(p) {
  const S = H.S;
  if (S.cutOrder) return S.cutOrder.filter((k) => p.allCuts.some((c) => c.key === k)).concat(p.allCuts.map((c) => c.key).filter((k) => !S.cutOrder.includes(k)));
  return (p.autoOrder || []).concat(p.allCuts.filter((c) => c.skipped).map((c) => c.key));
}
export function paintCutList() {
  const card = $("cutListCard"), S = H.S, p = S.prepared;
  if (!card) return;
  const show = !!p && !!p.allCuts && p.allCuts.length > 1;
  card.classList.toggle("hidden", !show);
  if (!show) return;
  const order = fullOrder(p), skipped = new Set(S.cutSkip || []);
  let n = 0;
  const html = order.map((k, i) => {
    const c = p.allCuts.find((x) => x.key === k); if (!c) return "";
    const off = skipped.has(k); if (!off) n++;
    const name = c.open ? "Line" : c.hole ? "Hole" : "Part";
    const up = `<svg class="ico" aria-hidden="true"><use href="#i-arrow-up"></use></svg>`;
    const dn = `<svg class="ico" aria-hidden="true"><use href="#i-arrow-down"></use></svg>`;
    return `<li draggable="true" data-key="${k}" class="${off ? "off" : ""}">
      <span class="grip" aria-hidden="true">≡</span>
      <label class="cuttick"><input type="checkbox" data-cutkey="${k}" ${off ? "" : "checked"} aria-label="Cut ${name} ${k + 1}"><b>${off ? "–" : n}</b><span class="cutname">${name} ${c.size[0]} × ${c.size[1]} mm</span></label>
      <span class="mv"><button type="button" data-mv="-1" data-key="${k}" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>${up}</button><button type="button" data-mv="1" data-key="${k}" aria-label="Move later" ${i === order.length - 1 ? "disabled" : ""}>${dn}</button></span></li>`;
  }).join("");
  // status updates call this many times a second; touching the DOM when nothing changed would swallow a click half-way through
  if ($("cutList")._html !== html) { $("cutList")._html = html; $("cutList").innerHTML = html; }
}
function applyOrder(order) { H.S.cutOrder = order; H.loadJob(); }
export function bindCutList() {
  const list = $("cutList");
  list.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-cutkey]"); if (!cb) return;
    const k = Number(cb.dataset.cutkey), s = new Set(H.S.cutSkip || []);
    if (cb.checked) s.delete(k); else s.add(k);
    H.S.cutSkip = [...s];
    if (!H.S.cutOrder) H.S.cutOrder = fullOrder(H.S.prepared);
    H.loadJob();
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mv]"); if (!b) return;
    const o = fullOrder(H.S.prepared), k = Number(b.dataset.key), i = o.indexOf(k), j = i + Number(b.dataset.mv);
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(j, 0, o.splice(i, 1)[0]); applyOrder(o);
  });
  let dragKey = null;
  list.addEventListener("dragstart", (e) => { const li = e.target.closest("li"); if (!li) return; dragKey = Number(li.dataset.key); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(dragKey)); } catch (x) { /* ignore */ } });
  list.addEventListener("dragover", (e) => { if (dragKey != null) e.preventDefault(); });
  list.addEventListener("drop", (e) => {
    const li = e.target.closest("li"); if (!li || dragKey == null) return;
    e.preventDefault();
    const o = fullOrder(H.S.prepared), to = o.indexOf(Number(li.dataset.key)), from = o.indexOf(dragKey);
    dragKey = null; if (from < 0 || to < 0 || from === to) return;
    o.splice(to, 0, o.splice(from, 1)[0]); applyOrder(o);
  });
  $("cutAuto").onclick = () => { H.S.cutOrder = null; H.S.cutSkip = []; H.loadJob(); };
}
