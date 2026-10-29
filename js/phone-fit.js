/* =========================================================
   phone-fit.js — Keeps the phone pages (buzzer and host) from
   scrolling. If the page is a bit taller than the phone's screen,
   everything shrinks just enough to fit.

   It never shrinks below PHONE_FIT_MIN_ZOOM, so text stays easy to
   read. Something far too long for that stays full size and
   scrolls instead.
   ========================================================= */

const PHONE_FIT_MIN_ZOOM = 0.7;

function fitPhonePage() {
  const page = document.documentElement;
  const parts = [...document.body.children].filter((element) => element.tagName !== "SCRIPT");
  parts.forEach((part) => { part.style.zoom = ""; });

  // Way too long to fit readably: leave it full size
  if (page.scrollHeight / window.innerHeight > 1 / PHONE_FIT_MIN_ZOOM) return;

  let zoom = 1;
  for (let pass = 0; pass < 6; pass++) {
    const overflow = page.scrollHeight / window.innerHeight; // 1.2 = 20% too tall
    if (overflow <= 1.002 || zoom <= PHONE_FIT_MIN_ZOOM) break;
    zoom = Math.max(PHONE_FIT_MIN_ZOOM, zoom / overflow);
    parts.forEach((part) => { part.style.zoom = String(zoom); });
  }
}

// Re-check whenever the page's contents or the screen change size
const phonePageWatcher = new ResizeObserver(() => fitPhonePage());
[...document.body.children].forEach((element) => phonePageWatcher.observe(element));
window.addEventListener("resize", fitPhonePage);
