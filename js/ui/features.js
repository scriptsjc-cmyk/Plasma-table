// Starts the optional screen features (version banner, playable preview, cut list, restart, size check, demo helpers, icons).
import { setHost } from "./host.js";
import { bindVersion, paintVersionLines, startVersionWatch } from "./about.js";
import { bindCam } from "../cut/camedit.js";
import { bindCutList } from "../cut/cutlist.js";
import { bindDelay } from "../cut/pierce.js";
import { bindDemo, bindPierceJump } from "./demo.js";
import { bindFnScroll, bindTopMenu } from "./menu.js";
import { bindPlay } from "../cut/playback.js";
import { bindRestart } from "../cut/restart.js";
import { bindSize } from "../make/sizecheck.js";
import { bindStraight } from "../make/straight.js";
import { bindWhy } from "./whytip.js";
import { installIcons } from "./icons.js";
import { installLabelGuard } from "./labels.js";

export function initFeatures(host) {
  setHost(host);
  startVersionWatch();
  bindVersion(); bindPlay(); bindCam(); bindCutList(); bindSize(); bindStraight(); bindRestart(); bindDelay(); bindDemo(); bindWhy(); bindTopMenu(); bindPierceJump(); installLabelGuard(); installIcons();
  paintVersionLines();
  bindFnScroll();
}
