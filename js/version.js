// The release this copy of the app belongs to. scripts/stamp-version.sh rewrites this file, version.json and the
// service-worker cache name together, so a new release always gets a new cache and the "New version" banner.
// (The page itself reads version.json at start-up, so footer/About match the deployed commit even if only that file is stamped.)
export const VERSION = { id: "2026.11.11-f148eaf", commit: "f148eaf", built: "2026-11-11" };
