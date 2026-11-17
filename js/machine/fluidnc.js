// Serial FluidNC detection from the controller's banner or status text.
// USB and Bluetooth both use the existing Web Serial port.

export function looksLikeFluidNC(text) {
  const t = String(text || "").trim();
  // The app logs its own transmitted lines as "> ...". A probe query
  // ("> $/axes/x/...") must not be treated as a FluidNC reply.
  if (/^>/.test(t)) return false;
  return /fluidnc/i.test(t) || /\[MSG:INFO: FluidNC/i.test(t) || /\$\/ax/i.test(t);
}
