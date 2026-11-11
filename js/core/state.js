// The one shared state object, plus the few live references init() fills in (machine, sketch, ...).
// Other modules import these names directly: ES module bindings are live, so they always see the current value.
export const S = {
  cfg: null, chart: null, jogStep: 10, status: { state: "Disconnected" }, job: null, prepared: null,
  gcode: null, design: null, fileName: "", safety: {}, src: "file", showMachine: true, cur: 1, material: null, thickness: null, connected: false, currentPart: null, cutStep: 1,
  lastAlarm: null, lastAlarmCode: null, speed: null, lastFeedOv: 100,
  // work zero lives in the machine model (M.zeroConfirmed) so startJob can enforce it; STOP / reset / home / alarm clear it there
  get zeroSet() { return !!(M && M.zeroConfirmed); }, set zeroSet(v) { if (M) M.zeroConfirmed = !!v; },
  fluidnc: false, shapeFs: false,
  cam: { tabs: 0, tabW: 3, leadOut: 0, over: 0, starts: {}, tabOver: {} }, cutOrder: null, cutSkip: [], startCut: 1, resume: null, jobSeq: 0,
};

export let M = null, CFH = null, inspectorApi = null, sketch = null, makeTools = null;
export const setM = (v) => { M = v; };
export const setCFH = (v) => { CFH = v; };
export const setInspectorApi = (v) => { inspectorApi = v; };
export const setSketch = (v) => { sketch = v; };
export const setMakeTools = (v) => { makeTools = v; };
