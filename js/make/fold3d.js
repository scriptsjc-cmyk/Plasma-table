// Fold models and a small offline 3D viewer for formed / bent preset parts (r15 8.5: split into the four modules below).
// Everything that imports fold3d.js gets the same names as before the split.
export { addTopFlanges, assemble, attach, displayThickness, face, foldAngle, foldBritches, foldC, foldCuboid, foldElbow, foldFishmouth, foldFrustum, foldHat, foldHopper, foldLiddedBox, foldLiddedCross, foldOpenBox, foldOpenHem, foldPipeOnFlat, foldRectElbow, foldRedElbow, foldS2r, foldSaddleHole, foldScoop, foldTakeoff, foldTee, foldTrayCross, foldTube, foldU, foldUSaddle, foldYBranch, foldZ, rectElbowDims, redElbowDims, takeoffCollarH, thicken } from "./fold3d-geom.js";
export { FOLD_MODELS, addPipeFlanges3d, foldDisc, foldModel, isFoldPart, modelDims } from "./fold3d-models.js";
export { DEFAULT_CAM, dimLabels, drawFoldCanvas, foldThumbSvg } from "./fold3d-render.js";
export { foldTileSvg, mountFoldView } from "./fold3d-view.js";
