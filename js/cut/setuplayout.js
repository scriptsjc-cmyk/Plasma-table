// r11 Setup step (Get to cutting step 2): laptop-only placement helpers.
import { $ } from "../core/dom.js";

export const SETUP_LAPTOP_MQ = "(min-width: 1200px) and (min-height: 560px) and (hover: hover) and (pointer: fine)";
export function isSetupLaptop() {
  try { return window.matchMedia(SETUP_LAPTOP_MQ).matches; } catch (e) { return false; }
}

function homeSlot(card) {
  const jog = card && card.querySelector(".jogmount .jog");
  if (!jog || !jog.children[5]) return null;
  jog.children[5].classList.add("jog-home-slot");
  return jog.children[5];
}

// On the laptop Setup step, Home sits in the centre of the jog pad. Everywhere
// else it stays in the Home / Raise / Go to start row.
export function placeTorchHome() {
  const card = $("zeroCard"); if (!card) return;
  const home = card.querySelector(".do-home"); if (!home) return;
  const slot = homeSlot(card);
  const row = card.querySelector(".homerow");
  if (isSetupLaptop() && slot && home.parentNode !== slot) slot.appendChild(home);
  else if (!isSetupLaptop() && row && home.parentNode !== row) {
    const raise = row.querySelector(".do-raise");
    row.insertBefore(home, raise || row.firstChild);
  }
}

export function bindSetupLayout() {
  placeTorchHome();
  bindBeforeCut();
  try { window.matchMedia(SETUP_LAPTOP_MQ).addEventListener("change", placeTorchHome); } catch (e) { /* placed once */ }
}

function bindBeforeCut() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".beforecut-link");
    if (!b) return;
    if (b.dataset.before === "cutStatus") {
      const btn = $("cutStatus");
      if (btn) btn.click();
    }
  });
}
