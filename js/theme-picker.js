/* =========================================================
   theme-picker.js — The color wheel on the Set Up Game
   screen's THEME tab. It recolors the whole game, and the
   players' and host's phones too (theme.js / css/theme.css).

   Around the wheel = the color, toward the middle = paler,
   the slider = darker / brighter. "Reset to red" goes back to
   the original red. The choice is remembered in this browser,
   and buzzer-host.js sends it to the phones.
   ========================================================= */

const THEME_STORAGE_KEY = "trivia-night-theme";

const colorWheel = document.getElementById("color-wheel");
const colorWheelMarker = document.getElementById("color-wheel-marker");
const colorBrightness = document.getElementById("color-brightness");
const colorResetButton = document.getElementById("color-reset");

let gameTheme = loadGameTheme(); // null = the original red
let isDraggingWheel = false;

/* ---------- Choosing ---------- */

function setGameTheme(changes) {
  gameTheme = cleanTheme({ ...(gameTheme || THEME_BASE), ...changes }); // theme.js
  handleGameThemeChanged();
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(gameTheme)); } catch (error) { /* fine */ }
}

function resetGameTheme() {
  gameTheme = null;
  handleGameThemeChanged();
  try { localStorage.removeItem(THEME_STORAGE_KEY); } catch (error) { /* fine */ }
}

function handleGameThemeChanged() {
  applyTheme(gameTheme); // theme.js
  updateThemeControls();
  if (typeof sendThemeToBuzzer === "function") sendThemeToBuzzer(); // buzzer-host.js — the phones follow
  if (typeof updateGameSetupTabCounts === "function") updateGameSetupTabCounts(); // game-setup.js
}

function loadGameTheme() {
  try {
    return cleanTheme(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)));
  } catch (error) {
    return null;
  }
}

/* ---------- Drawing the controls ---------- */

function updateThemeControls() {
  const { hue, saturation, lightness } = gameTheme || THEME_BASE;

  // Marker on the wheel: the angle is the hue (red at the top), the distance is the saturation
  const angle = (hue * Math.PI) / 180;
  const distance = (saturation / 100) * 50; // % of the wheel's width
  colorWheelMarker.style.left = `${50 + Math.sin(angle) * distance}%`;
  colorWheelMarker.style.top = `${50 - Math.cos(angle) * distance}%`;
  colorWheelMarker.style.background = themeColorCss(gameTheme);
  colorWheel.setAttribute("aria-valuetext", `Hue ${Math.round(hue)}°, ${Math.round(saturation)}% color`);

  // The slider shows dark to bright in the picked color
  colorBrightness.min = String(THEME_MIN_LIGHTNESS);
  colorBrightness.max = String(THEME_MAX_LIGHTNESS);
  colorBrightness.value = String(Math.round(lightness));
  colorBrightness.style.setProperty("--slider-dark", themeColorCss({ hue, saturation, lightness: THEME_MIN_LIGHTNESS }));
  colorBrightness.style.setProperty("--slider-bright", themeColorCss({ hue, saturation, lightness: THEME_MAX_LIGHTNESS }));
  colorResetButton.disabled = !gameTheme;
}

/* ---------- The wheel ---------- */

// Where the pointer is on the wheel → hue (angle) and saturation (distance from the middle)
function pickFromWheel(event) {
  const box = colorWheel.getBoundingClientRect();
  const x = event.clientX - (box.left + box.width / 2);
  const y = event.clientY - (box.top + box.height / 2);
  const hue = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  const saturation = Math.min(1, Math.hypot(x, y) / (box.width / 2)) * 100;
  setGameTheme({ hue, saturation });
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
  const { hue, saturation } = gameTheme || THEME_BASE;
  const changes = {
    ArrowLeft: { hue: hue - 5 },
    ArrowRight: { hue: hue + 5 },
    ArrowUp: { saturation: Math.min(100, saturation + 5) },
    ArrowDown: { saturation: Math.max(0, saturation - 5) },
  }[event.key];
  if (!changes) return;
  event.preventDefault();
  setGameTheme(changes);
});

colorBrightness.addEventListener("input", () => setGameTheme({ lightness: Number(colorBrightness.value) }));
colorResetButton.addEventListener("click", resetGameTheme);

applyTheme(gameTheme);
updateThemeControls();
