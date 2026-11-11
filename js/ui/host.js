// What the screen modules in this group need from the app (state, toast, cmd, refresh, ...): app.js hands it over once with setHost().


export let H = null;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const setHost = (h) => { H = h; };
