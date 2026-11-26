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

// On phones the chart becomes a list in cooking order (see toolchart.css).
// Numbers each step and, where branches join, names the earlier steps it uses.
(() => {
  const dos = [...document.querySelectorAll(".toolchart .do")];
  const inputs = d => [...d.previousElementSibling.children].filter(c => c.matches(".step")).map(s => s.querySelector(":scope > .do"));
  const names = new Map(dos.map((d, i) => [d, `${i + 1} ${d.querySelector("h3").textContent}`]));
  dos.forEach((d, i) => {
    const f = inputs(d);
    // only worth saying when it isn't simply the step just above
    if (f.length > 1 || (f.length && f[0] !== dos[i - 1]))
      d.querySelector("h3").insertAdjacentHTML("afterend", `<small class="from">with ${f.map(x => names.get(x)).join(", ")}</small>`);
    d.querySelector("h3").insertAdjacentHTML("afterbegin", `<span class="n">${i + 1}</span>`);
  });
})();
