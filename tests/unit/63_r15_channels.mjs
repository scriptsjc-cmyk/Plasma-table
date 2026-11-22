// r15 9.1 a stable release channel, written before it is wired into the deploy:
//   buyers open stable/ (the newest release Josh promoted after a real cut); the newest 3 promoted releases stay at v/<commit>/
//   for rollback; with no promoted release the deploy is exactly as before. Each copy is stamped with its own id and channel,
//   gets a service-worker cache prefix of its own (channels never clear each other's offline copy) and the same CSP tightening.
//   Run against a throwaway git repo made from the real scripts and sw.js.
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const t = new T("63_r15_channels");
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r15-channels-"));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid", GITHUB_SHA: "" };
const sh = (cmd, args, extra = {}) => execFileSync(cmd, args, { cwd: tmp, env: { ...env, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (...a) => sh("git", a);
const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
const read = (f) => fs.readFileSync(path.join(tmp, f), "utf8");
const has = (f) => fs.existsSync(path.join(tmp, f));

try {
  git("init", "-q", "-b", "main");
  for (const f of ["scripts/stamp-version.sh", "scripts/harden-csp.sh", "scripts/build-channels.sh", "sw.js", "version.json", "js/version.js"]) {
    put(f, fs.readFileSync(path.join(REPO, f), "utf8"));
    if (f.endsWith(".sh")) fs.chmodSync(path.join(tmp, f), 0o755);
  }
  put("index.html", `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws: https://x.supabase.co;">\n<p>v1</p>\n`);
  put("js/app.js", "export const N = 1;\n"); put("tests/t.txt", "test\n"); put("docs/d.md", "doc\n"); put(".github/workflows/x.yml", "x\n");
  const shas = [];
  let day = 10;
  const commit = (n) => { put("js/app.js", `export const N = ${n};\n`); git("add", "-A"); sh("git", ["commit", "-q", "-m", "c" + n], { GIT_COMMITTER_DATE: `2026-11-${day} 12:00:00 +0000`, GIT_AUTHOR_DATE: `2026-11-${day} 12:00:00 +0000` }); shas.push(git("rev-parse", "HEAD").trim()); };
  const tag = (name, sha) => { sh("git", ["tag", "-a", name, "-m", name, sha], { GIT_COMMITTER_DATE: `2026-11-${day++} 13:00:00 +0000` }); };
  const build = () => sh("./scripts/build-channels.sh", []);

  // ---- no promoted release: nothing changes
  commit(1);
  const before = read("sw.js");
  const out0 = build();
  t.check("9.1 with no stable-* tag nothing is added (the deploy stays as it was)", !has("stable") && !has("v") && !has("channels.json") && read("sw.js") === before, out0);

  // ---- four promoted releases (and a tag that is not a release)
  commit(2); commit(3); commit(4); commit(5);
  tag("stable-a", shas[1]); tag("stable-b", shas[2]); tag("not-a-release", shas[4]); tag("stable-c", shas[3]); tag("stable-d", shas[4]);
  const out = build();
  const s7 = (i) => shas[i].slice(0, 7);
  const vdirs = has("v") ? fs.readdirSync(path.join(tmp, "v")).sort() : [];
  t.check("9.1 stable/ is the newest promoted release", has("stable/index.html") && read("stable/js/app.js").includes("N = 5"), out);
  t.check("9.1 the newest 3 releases are kept at v/<commit>/ (the oldest one is dropped)", JSON.stringify(vdirs) === JSON.stringify([s7(2), s7(3), s7(4)].sort()), vdirs);
  t.check("9.1 each kept copy is that release's own files", read(`v/${s7(2)}/js/app.js`).includes("N = 3") && read(`v/${s7(3)}/js/app.js`).includes("N = 4"));
  const sv = JSON.parse(read("stable/version.json"));
  t.check("9.1 stable/version.json carries its own release id, commit, channel and tag", sv.channel === "stable" && sv.commit === s7(4) && sv.id.endsWith("-" + s7(4)) && sv.tag === "stable-d", sv);
  t.check("9.1 stable/js/version.js matches version.json and says the channel", read("stable/js/version.js").includes(`channel: "stable", id: "${sv.id}"`));
  const vv = JSON.parse(read(`v/${s7(2)}/version.json`));
  t.check("9.1 a kept copy says which release it is", vv.channel === "v-" + s7(2) && vv.commit === s7(2), vv);
  const ssw = read("stable/sw.js");
  t.check("9.1 stable/sw.js has a cache of its own (plasma-cad-stable-<id>)", ssw.includes(`const CACHE = "plasma-cad-stable-${sv.id}";`) && ssw.includes(`const PREFIX = "plasma-cad-stable-";`));
  t.check("9.1 a kept copy's sw.js has a cache of its own", read(`v/${s7(2)}/sw.js`).includes(`const PREFIX = "plasma-cad-v-${s7(2)}-";`));
  t.check("9.1 stable/'s precache lists its own files", ssw.includes(`"js/app.js"`) && ssw.includes(`"index.html"`));
  t.check("9.1 the copies get the same CSP tightening (no ws: in connect-src)", !/connect-src[^;]*\bwss?:/.test(read("stable/index.html")) && !/connect-src[^;]*\bwss?:/.test(read(`v/${s7(3)}/index.html`)));
  t.check("9.1 tests/, docs/ and .github/ are not published in the copies", !has("stable/tests") && !has("stable/docs") && !has("stable/.github") && !has(`v/${s7(2)}/tests`));
  t.check("9.1 the main site is left alone (same sw.js, index.html still as committed)", read("sw.js") === before && read("index.html").includes("ws:"));
  const cj = JSON.parse(read("channels.json"));
  t.check("9.1 channels.json says what stable is and what is kept for rollback", cj.stable === "stable-d" && cj.kept.length === 3 && cj.kept[0].path === `v/${s7(4)}/` && cj.kept.map((k) => k.tag).join() === "stable-d,stable-c,stable-b", cj);

  // ---- rollback: promoting an older release again makes it stable
  tag("stable-e", shas[2]);
  build();
  t.check("9.1 rollback: promoting an older release again makes it stable/", read("stable/js/app.js").includes("N = 3") && JSON.parse(read("stable/version.json")).tag === "stable-e");
  const vd2 = fs.readdirSync(path.join(tmp, "v")).sort();
  t.check("9.1 after a rollback the kept copies are the newest 3 promotions, nothing stale left", JSON.stringify(vd2) === JSON.stringify([s7(2), s7(3), s7(4)].sort()), vd2);

  // ---- service-worker cache clean-up: each worker only clears its own channel
  const ownOf = (src) => {
    const pick = (re) => (src.match(re) || [""])[0];
    const code = [pick(/^const PREFIX = .*$/m), pick(/^const CHANNELS = .*$/m), pick(/^const isOwn = .*$/m), "return isOwn;"].join("\n");
    return new Function(code)();
  };
  const all = ["plasma-cad-2026.11.12-aaaaaaa", "plasma-cad-v1", "plasma-cad-stable-2026.11.01-bbbbbbb", "plasma-cad-v-ccccccc-2026.10.01-ccccccc", "other-app"];
  const root = ownOf(fs.readFileSync(path.join(REPO, "sw.js"), "utf8")), stable = ownOf(ssw), kept = ownOf(read(`v/${s7(2)}/sw.js`));
  t.check("9.1 the main site's worker never clears the stable or kept copies' caches", all.filter(root).join() === "plasma-cad-2026.11.12-aaaaaaa,plasma-cad-v1", all.filter(root));
  t.check("9.1 stable's worker only clears stable caches", all.filter(stable).join() === "plasma-cad-stable-2026.11.01-bbbbbbb", all.filter(stable));
  t.check("9.1 a kept copy's worker only clears its own caches", all.filter(kept).join() === "" && kept(`plasma-cad-v-${s7(2)}-x`));
  t.check("9.1 the activate step uses isOwn", /keys\.filter\(\(k\) => isOwn\(k\) && k !== CACHE\)/.test(fs.readFileSync(path.join(REPO, "sw.js"), "utf8")));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- the workflows: the deploy builds the channels from tags; promotion is by hand, only after a real cut
{
  const pages = fs.readFileSync(path.join(REPO, ".github/workflows/pages.yml"), "utf8");
  const deploy = pages.slice(pages.indexOf("\n  deploy:"));
  t.check("9.1 the deploy checks out the tags (fetch-depth: 0)", /Check out the commit being deployed[\s\S]*?fetch-depth: 0/.test(deploy));
  const iStamp = deploy.indexOf("stamp-version.sh"), iHarden = deploy.indexOf("harden-csp.sh"), iCh = deploy.indexOf("build-channels.sh"), iUp = deploy.indexOf("upload-pages-artifact");
  t.check("9.1 the deploy builds the channels after stamping the main site and before the upload", iStamp > 0 && iHarden > iStamp && iCh > iHarden && iUp > iCh, { iStamp, iHarden, iCh, iUp });
  const pf = path.join(REPO, ".github/workflows/promote-stable.yml");
  const p = fs.existsSync(pf) ? fs.readFileSync(pf, "utf8") : "";
  t.check("9.1 there is a 'Promote to stable' workflow, run by hand only", /^on:\s*\n\s+workflow_dispatch:/m.test(p) && !/^\s+(push|schedule|pull_request):/m.test(p));
  t.check("9.1 promoting asks for a confirmation that a real part was cut", /cut_done:[\s\S]*?type: boolean/.test(p) && /cut_done[^\n]*!= *'?true'?|inputs\.cut_done/.test(p));
  t.check("9.1 only commits already on main can be promoted", /merge-base --is-ancestor/.test(p));
  t.check("9.1 inputs reach the shell through env, never pasted into the script", !/run:[^\n]*\$\{\{\s*(github\.event\.)?inputs\./.test(p) && !/^\s+git[^\n]*\$\{\{/m.test(p));
  t.check("9.1 promotion makes a stable-* tag and redeploys the site", (/git tag -a "?stable-/.test(p) || (/TAG="stable-/.test(p) && /git tag -a "\$TAG"/.test(p) && /git push origin "refs\/tags\/\$TAG"/.test(p))) && /gh workflow run pages\.yml/.test(p));
}

process.exit(t.done() ? 1 : 0);
