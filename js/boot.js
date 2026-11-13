// Load each main-menu area's HTML (Make a part, Go to cutting, Your parts,
// Machine setup) before the app starts. There is no build step: the files are
// fetched at run time and listed in the service-worker precache, so the app
// still works offline and on GitHub Pages.
const PARTIALS = [
  "html/make.html",
  "html/cut.html",
  "html/setup.html",
  "html/parts.html",
];

function fillSlot(id, nodes) {
  const slot = document.getElementById(id);
  if (!slot) throw new Error("Missing include slot #" + id);
  slot.replaceWith(...nodes);
}

async function loadPartials() {
  const docs = await Promise.all(PARTIALS.map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load " + url + " (" + res.status + ")");
    return { url, html: await res.text() };
  }));
  for (const { url, html } of docs) {
    const box = document.createElement("div");
    box.innerHTML = html;
    const tpls = [...box.querySelectorAll("template[data-slot]")];
    if (tpls.length) {
      for (const t of tpls) fillSlot("slot-" + t.dataset.slot, [...t.content.childNodes]);
    } else {
      const slot = url.replace(/^html\//, "").replace(/\.html$/, "");
      const nodes = [...box.childNodes].filter((n) => n.nodeType !== 3 || n.textContent.trim());
      fillSlot("slot-" + slot, nodes);
    }
  }
}

await loadPartials();
await import("./app.js");
await import("./ui/inspector-ui.js");
