// r15 5.5: which way each fold line bends. "up" folds towards you as the flat pattern is drawn (the 3D's base lies
// flat and the flanges rise towards the viewer), "down" away from you. A preset not listed folds every line up 90°.
// Lists run in the order the preset draws its fold lines.
const U = {}, D = { dir: "down" };
export const FOLD_DIRS = {
  foldzbr: [U, D],
  zbracket: [U, D],
  hatsect: [U, D, D, U],
  usaddle: [U, D, D, U],
  furring: [U, D, D, U],
  firepit: [U, D],
  bbqside: [U, D],
  planterbox: [U, U, U, U, D, D, D, D],
  ridgecap: [{ deg: 45 }, { deg: 45 }],
};
const isBend = (c) => c && c.role === "bend" && c.pts && c.pts.length === 2;

// Put each fold line's direction / angle on it (pattern order). Nothing else changes, so the cut is the same.
export function markFolds(id, contours) {
  const spec = FOLD_DIRS[id];
  if (!spec || !Array.isArray(contours)) return contours;
  let i = 0;
  return contours.map((c) => (isBend(c) ? { ...c, ...(spec[i++] || {}) } : c));
}

export function foldLabel(c) {
  const deg = Number.isFinite(c && c.deg) ? c.deg : 90;
  return (c && c.dir === "down" ? "▼ Down" : "▲ Up") + (Math.abs(deg - 90) > 1e-6 ? ` ${Math.round(deg * 10) / 10}°` : "");
}
// Marks go on a part's fold lines only when there are a few (a triangulated transition has dozens of etch lines).
export const MAX_FOLD_MARKS = 12;
