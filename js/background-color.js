/* =========================================================
   background-color.js — The color wheel that changes the
   background color (the round rainbow button, bottom right).

   Around the wheel = the color, toward the middle = paler,
   the slider = darker / brighter. The background's shades
   (the --stage-* colors in style.css) are all worked out from
   the one picked color. "Reset" goes back to the pink.

   The choice is remembered in this browser.
   ========================================================= */

const BACKGROUND_STORAGE_KEY = "panalo-background";

const colorButton = document.getElementById("color-button");
const colorPanel = document.getElementById("color-panel");
const colorWheel = document.getElementById("color-wheel");
const colorWheelMarker = document.getElementById("color-wheel-marker");
const colorBrightness = document.getElementById("color-brightness");
const colorResetButton = document.getElementById("color-reset");
const colorDoneButton = document.getElementById("color-done");

// The pink the game starts with, as hue / saturation / lightness
const DEFAULT_BACKGROUND = { hue: 333, saturation: 52, lightness: 47 };

let backgroundColor = loadBackgroundColor(); // null = the original pink
let isDraggingWheel = false;

/* ---------- Applying a color ---------- */

const hsl = (hue, saturation, lightness) =>
  `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(Math.max(3, Math.min(95, lightness)))}%)`;

// Works out every background shade from the one picked color
function applyBackgroundColor() {
  const root = document.documentElement.style;
  const names = ["--stage-top", "--stage-main", "--stage-mid", "--stage-bottom", "--stage-deep", "--stage-glow", "--stage-glow-light"];

  if (!backgroundColor) {
    names.forEach((name) => root.removeProperty(name)); // back to style.css's pink
  } else {
    const { hue, saturation: s, lightness: l } = backgroundColor;
    root.setProperty("--stage-top", hsl(hue, Math.min(100, s + 15), l + 18));
    root.setProperty("--stage-main", hsl(hue, s, l));
    root.setProperty("--stage-mid", hsl(hue, s, l - 9));
    root.setProperty("--stage-bottom", hsl(hue, s, l - 18));
    root.setProperty("--stage-deep", hsl(hue, s, l - 25));
    root.setProperty("--stage-glow", hsl(hue, s, l + 2));
    root.setProperty("--stage-glow-light", hsl(hue, Math.min(100, s + 30), l + 30));
  }

  const shown = backgroundColor || DEFAULT_BACKGROUND;
  colorButton.style.setProperty("--picked-color", hsl(shown.hue, shown.saturation, shown.lightness));
  updateColorControls();
}

function updateColorControls() {
  const { hue, saturation, lightness } = backgroundColor || DEFAULT_BACKGROUND;

  // Marker on the wheel: the angle is the hue (red at the top), the distance is the saturation
  const angle = (hue * Math.PI) / 180;
  const distance = (saturation / 100) * 50; // % of the wheel's width
  colorWheelMarker.style.left = `${50 + Math.sin(angle) * distance}%`;
  colorWheelMarker.style.top = `${50 - Math.cos(angle) * distance}%`;
  colorWheelMarker.style.background = hsl(hue, saturation, lightness);
  colorWheel.setAttribute("aria-valuetext", `Hue ${Math.round(hue)}°, ${Math.round(saturation)}% color`);

  // The slider shows dark to bright in the picked color
  colorBrightness.value = String(Math.round(lightness));
  colorBrightness.style.setProperty("--slider-dark", hsl(hue, saturation, 12));
  colorBrightness.style.setProperty("--slider-bright", hsl(hue, saturation, 65));
}

function setBackgroundColor(changes) {
  backgroundColor = { ...(backgroundColor || DEFAULT_BACKGROUND), ...changes };
  applyBackgroundColor();
  try { localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(backgroundColor)); } catch (error) { /* fine */ }
}

function resetBackgroundColor() {
  backgroundColor = null;
  applyBackgroundColor();
  try { localStorage.removeItem(BACKGROUND_STORAGE_KEY); } catch (error) { /* fine */ }
}

function loadBackgroundColor() {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKGROUND_STORAGE_KEY));
    if (saved && [saved.hue, saved.saturation, saved.lightness].every(Number.isFinite)) return saved;
  } catch (error) {
    // Nothing saved
  }
  return null;
}

/* ---------- The wheel ---------- */

// Where the pointer is on the wheel → hue (angle) and saturation (distance from the middle)
function pickFromWheel(event) {
  const box = colorWheel.getBoundingClientRect();
  const x = event.clientX - (box.left + box.width / 2);
  const y = event.clientY - (box.top + box.height / 2);
  const hue = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  const saturation = Math.min(1, Math.hypot(x, y) / (box.width / 2)) * 100;
  setBackgroundColor({ hue, saturation });
}

colorWheel.addEventListener("pointerdown", (event) => {
  isDraggingWheel = true;
  colorWheel.setPointerCapture(event.pointerId);
  pickFromWheel(event);
});
colorWheel.addEventListener("pointermove", (event) => { if (isDraggingWheel) pickFromWheel(event); });
colorWheel.addEventListener("pointerup", () => { isDraggingWheel = false; });
colorWheel.addEventListener("pointercancel", () => { isDraggingWheel = false; });

// Keyboard: ← → turn the color, ↑ ↓ more or less color
colorWheel.addEventListener("keydown", (event) => {
  const { hue, saturation } = backgroundColor || DEFAULT_BACKGROUND;
  const changes = {
    ArrowLeft: { hue: (hue + 355) % 360 },
    ArrowRight: { hue: (hue + 5) % 360 },
    ArrowUp: { saturation: Math.min(100, saturation + 5) },
    ArrowDown: { saturation: Math.max(0, saturation - 5) },
  }[event.key];
  if (!changes) return;
  event.preventDefault();
  setBackgroundColor(changes);
});

colorBrightness.addEventListener("input", () => setBackgroundColor({ lightness: Number(colorBrightness.value) }));

/* ---------- Opening & closing ---------- */

function openColorPanel() {
  colorPanel.hidden = false;
  colorButton.setAttribute("aria-expanded", "true");
  updateColorControls();
  colorWheel.focus({ preventScroll: true });
}

function closeColorPanel() {
  colorPanel.hidden = true;
  colorButton.setAttribute("aria-expanded", "false");
}

colorButton.addEventListener("click", () => (colorPanel.hidden ? openColorPanel() : closeColorPanel()));
colorDoneButton.addEventListener("click", closeColorPanel);
colorResetButton.addEventListener("click", resetBackgroundColor);

// Clicking anywhere else closes it
document.addEventListener("pointerdown", (event) => {
  if (!colorPanel.hidden && !colorPanel.contains(event.target) && !colorButton.contains(event.target)) closeColorPanel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !colorPanel.hidden) {
    event.stopImmediatePropagation(); // only closes this, not a question behind it
    closeColorPanel();
  }
}, true);

applyBackgroundColor();
