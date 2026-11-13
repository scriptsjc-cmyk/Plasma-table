// Serial FluidNC detection from the controller's banner or status text.
// USB and Bluetooth both use the existing Web Serial port.

export function looksLikeFluidNC(text) {
  const t = String(text || "");
  return /fluidnc/i.test(t) || /\[MSG:INFO: FluidNC/i.test(t) || /\$\/ax/i.test(t);
}
