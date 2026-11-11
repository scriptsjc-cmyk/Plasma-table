// The compact API the older "r2tools" style suites use (serve / open / launch / VIEWS / demoToShape), on top of the shared harness (browser.mjs).
import { startServer, launch as chromeLaunch, newPage, demoToShape as dts, PROFILES, SHOTS } from "./browser.mjs";
export { SITE, REPO, DATA, mod, readJs, allJsText, jsRel, jsUrl } from "./site.mjs";
export { SHOTS };
PROFILES.laptopchrome ||= { viewport: { width: 1366, height: 648 } };
const MAP = { laptop: "d1366", laptopchrome: "laptopchrome", phone: "iphone14", phoneland: "iphone14land" };
const strip = ({ safariLike, ...o }) => o;
export const VIEWS = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k, strip(PROFILES[v])]));
export const serve = async (dir) => startServer(dir ? { site: dir.replace(/\/?$/, "/") } : {});     // no argument = the site under test
export const open = (br, view, base, query = "?test=1&turn=0") => newPage(br, MAP[view] || view, { base, query, consoleErrors: false });     // (these suites count uncaught page errors, not console noise such as a 404 for the favicon)
export const demoToShape = dts;
export const launch = () => chromeLaunch();     // Playwright's own Chrome launch: a desktop page reports a mouse (hover: hover), which a bare CDP-launched headless Chrome does not
