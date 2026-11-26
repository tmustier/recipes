// Keeps the screen on (no dimming, no auto-lock) while a recipe page is visible.
// Phones drop the lock when you switch apps or lock the screen, so it's re-acquired
// when the page becomes visible again, and on any tap in case the browser wanted one.
(() => {
  if (!("wakeLock" in navigator)) return;
  let lock = null;
  const request = async () => {
    if (lock || document.visibilityState !== "visible") return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch {}
  };
  request();
  document.addEventListener("visibilitychange", request);
  document.addEventListener("pointerdown", request, { passive: true });
})();

