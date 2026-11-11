// Sketch: the layout lock. On the sheet layout (Get set up / Bed & start) parts can only be placed, never reshaped or resized.


// B5: the sheet layout (Get set up / Bed & start) only PLACES parts. Every route that changes a part's shape or size is refused there;
// shapes are edited in Make a part ("Edit in Make a part" takes the picked part there). Moving, turning, copies, removing, nesting stay.
export const LAYOUT_LOCK_MSG = "Shapes are edited in Make a part. Here you only place them. Use Edit in Make a part.";
export function installLayoutLock(Sketch) {
  for (const name of ["nudge", "setPos", "rotateBy", "setAngle"]) {          // turning / moving a part takes its own holes with it
    const f = Sketch.prototype[name];
    Sketch.prototype[name] = function (...a) { return this.carryOwned(() => f.apply(this, a), name === "rotateBy" ? Number(a[0]) : null); };
  }
  for (const name of ["resizeTo", "resizeCustomTo", "setWidth", "setHeight", "setDiameter", "setParam", "applyVariant", "setHoleOffset", "moveHole",
    "mirror", "flipV", "resetHoles", "join", "subtract", "offsetBy", "explode", "centreInHost", "finishDraw",
    "setEdgeLength", "squareUpEdge", "setEdgeAngle", "setEdgeCurve", "straightenEdge", "addVertexOnEdge", "deleteVertex", "moveVertex", "moveBulge"]) {
    const f = Sketch.prototype[name];
    if (typeof f !== "function") throw new Error("layout lock: Sketch." + name + " does not exist");
    Sketch.prototype[name] = function (...a) {
      if (this.layout) { this.onMessage(LAYOUT_LOCK_MSG); return false; }
      return f.apply(this, a);
    };
  }
}
