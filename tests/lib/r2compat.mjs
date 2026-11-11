// Small adapter so the round-5 safety suite (ported from r2tools/r5safety.mjs) runs on this repo's shared harness.
import { startServer, launchKillable, newPage, demoToShape as dts, PROFILES } from "./browser.mjs";
PROFILES.laptopchrome ||= { viewport: { width: 1366, height: 648 } };
const MAP = { laptop: "d1366", laptopchrome: "laptopchrome", phone: "iphone14", phoneland: "iphone14land" };
export const serve = async () => startServer();
export const open = (br, view, base, query = "?test=1&turn=0") => newPage(br, MAP[view] || view, { base, query });
export const demoToShape = dts;
export const launch = async () => { const k = await launchKillable(); const b = k.browser; b.close = async () => { k.kill(); }; return b; };
