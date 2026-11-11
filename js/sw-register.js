// Registers the offline cache (sw.js). Lives in its own file because the page's CSP does not allow inline scripts.
// Tells the page (window event "pt-new-version") when a newer release has taken over, so it can show a Reload banner.
if ("serviceWorker" in navigator) {
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("message", function (e) {
    if (e.data && e.data.type === "new-version") { window.__ptNewVersion = true; window.dispatchEvent(new Event("pt-new-version")); }
  });
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadController) { window.__ptNewVersion = true; window.dispatchEvent(new Event("pt-new-version")); }
    hadController = true;
  });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function (reg) {
    try { reg.update().catch(function () { /* offline: keep the installed release */ }); } catch (e) { /* ignore */ }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { try { reg.update().catch(function () { /* offline: keep the installed release */ }); } catch (e) { /* ignore */ } } });
  }).catch(function () {});
}
