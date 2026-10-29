/* =========================================================
   theme.js — Applies the theme color (css/theme.css).

   Shared by the game, the players' buzzer page and the host's
   phone. The host picks the color on the Set Up Game screen
   (theme-picker.js); the phones get it from the server.

   A theme is { hue, saturation, lightness } (0–360, 0–100, 0–100),
   or null for the original red.
   ========================================================= */

// The original red, #711a26
const THEME_BASE = { hue: 352.3, saturation: 62.7, lightness: 27.25 };

// The brightness slider's range: darker or brighter than this and the
// cream text gets hard to read
const THEME_MIN_LIGHTNESS = 14;
const THEME_MAX_LIGHTNESS = 45;

let appliedThemeKey = null; // the phones check in often: only redo it when the color changes

function applyTheme(theme) {
  const key = JSON.stringify(theme);
  if (key === appliedThemeKey) return;
  appliedThemeKey = key;

  const { hue, saturation, lightness } = theme || THEME_BASE;
  const root = document.documentElement.style;
  const light = Math.max(THEME_MIN_LIGHTNESS, Math.min(THEME_MAX_LIGHTNESS, lightness));

  root.setProperty("--theme-hue-shift", `${hue - THEME_BASE.hue}deg`);
  root.setProperty("--theme-saturation", String(saturation / THEME_BASE.saturation));
  root.setProperty("--theme-lighten", `${Math.max(0, light - THEME_BASE.lightness)}%`);
  root.setProperty("--theme-darken", `${Math.max(0, THEME_BASE.lightness - light)}%`);

  // The phone's browser bar, too
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.content = themeColorCss(theme);
}

// The theme's main color as CSS, e.g. "hsl(352, 63%, 27%)"
function themeColorCss(theme) {
  const { hue, saturation, lightness } = theme || THEME_BASE;
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
}

// A theme from somewhere else (the server, browser storage): checked, or null
function cleanTheme(theme) {
  if (!theme || ![theme.hue, theme.saturation, theme.lightness].every(Number.isFinite)) return null;
  return {
    hue: ((theme.hue % 360) + 360) % 360,
    saturation: Math.max(0, Math.min(100, theme.saturation)),
    lightness: Math.max(THEME_MIN_LIGHTNESS, Math.min(THEME_MAX_LIGHTNESS, theme.lightness)),
  };
}
