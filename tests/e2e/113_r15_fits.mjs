// r15 Round 7.2 (not gated yet): the 96 fits-the-screen walk with the r15 checks (glyph-level text-on-text, clipped text,
// covered text/controls, header overflow, toast over controls, safety text cut) and the r15 screens (Holes tab, More panel,
// Check-the-cut pop-up on steps 1 and 2, signed-in admin Account box with a linked machine). Moves into 96 once it passes.
globalThis.R15_FITS = true;
await import("./96_fits_screen.mjs");
