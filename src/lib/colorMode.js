// Ported from DMRHub src/composables/useColorMode.ts (AGPL-3.0-or-later,
// Copyright (C) 2023-2026 Jacob McSwain, https://github.com/USA-RedDragon/DMRHub).
// The color mode lives outside React so the map can start before the UI loads.

const COLOR_MODE_KEY = "color-mode";
const MODES = ["system", "light", "dark"];
const QUERY = "(prefers-color-scheme: dark)";

const readStored = () => {
  try {
    const stored = localStorage.getItem(COLOR_MODE_KEY);
    return MODES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY) : null;
const listeners = new Set();
let state = null;

const resolve = (mode) => {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!(media && media.matches);
};

const apply = (mode) => {
  state = { mode, isDark: resolve(mode) };
  document.documentElement.classList.toggle("dark", state.isDark);
  listeners.forEach((l) => l());
};

/** colorMode is the current mode and whether it draws dark. */
export const colorMode = () => {
  if (!state) apply(readStored());
  return state;
};

/** onColorMode calls listener whenever the mode or the OS setting changes, until the returned function is called. */
export const onColorMode = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

if (media) {
  media.addEventListener("change", () => {
    if (colorMode().mode === "system") apply("system");
  });
}

export const setMode = (mode) => {
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    // Storage can be blocked; the mode still applies for this page.
  }
  apply(mode);
};

export const cycleMode = () => {
  const { mode } = colorMode();
  setMode(mode === "system" ? "light" : mode === "light" ? "dark" : "system");
};
