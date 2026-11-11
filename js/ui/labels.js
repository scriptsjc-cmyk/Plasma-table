// Keeps the preview's labels off the sheet and machine drawing.


// Sheet-map captions are drawn in sketch.js / setup.js. On a narrow canvas the footer
// pair shares one baseline and the start-point caption sits on the sheet title.
// Nudge only those known strings; leave every other canvas label where it was drawn.
let mapSheetY = null, mapMachineY = null;
function nudgePreviewLabel(text, x, y, w, h) {
  if (typeof text !== "string" || !(w > 0)) return { x, y };
  if (/^grid /.test(text)) { mapSheetY = null; mapMachineY = null; return { x, y }; }
  if (/shape/.test(text) && /overall/.test(text) && w < 560) return { x: 8, y: Math.max(14, h - 22) };
  if (text.startsWith("Sheet ")) { mapSheetY = y; return { x, y }; }
  if (text === "Machine work area") {
    let yy = y;
    if (mapSheetY != null && Math.abs(yy - mapSheetY) < 22) yy = mapSheetY + 22;
    if ((w < 560 || h < 220) && yy > h - 32) yy = Math.max(14, h - 32);
    mapMachineY = yy;
    return { x, y: yy };
  }
  if (text.startsWith("Start point")) {
    let yy = y;
    const block = Math.max(mapSheetY || 0, mapMachineY || 0);
    if (block && yy < block + 22) yy = block + 22;
    if ((w < 560 || h < 220) && yy > h - 36) yy = Math.max(14, h - 36);
    const moved = yy !== y;
    const xx = moved ? Math.max(4, Math.min(x, Math.max(4, w - 130))) : x;
    return { x: xx, y: yy };
  }
  return { x, y };
}
export function installLabelGuard() {
  const orig = CanvasRenderingContext2D.prototype.fillText;
  if (orig.__ptLabel) return;
  function wrapped(text, x, y, maxWidth) {
    const cv = this.canvas;
    if (!cv || cv.id !== "preview") return maxWidth == null ? orig.call(this, text, x, y) : orig.call(this, text, x, y, maxWidth);
    const w = cv.clientWidth || 0, h = cv.clientHeight || 0;
    const p = nudgePreviewLabel(String(text), x, y, w, h);
    return maxWidth == null ? orig.call(this, text, p.x, p.y) : orig.call(this, text, p.x, p.y, maxWidth);
  }
  wrapped.__ptLabel = true;
  CanvasRenderingContext2D.prototype.fillText = wrapped;
}
