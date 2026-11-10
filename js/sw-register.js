// Registers the offline cache (sw.js). Lives in its own file because the page's CSP does not allow inline scripts.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function () {});
}
