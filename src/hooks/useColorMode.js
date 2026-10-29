// Ported from DMRHub src/composables/useColorMode.ts (AGPL-3.0-or-later,
// Copyright (C) 2023-2026 Jacob McSwain, https://github.com/USA-RedDragon/DMRHub)
// as a React hook.

import { useSyncExternalStore } from "react";

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

const getSnapshot = () => {
  if (!state) apply(readStored());
  return state;
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

if (media) {
  media.addEventListener("change", () => {
    if (getSnapshot().mode === "system") apply("system");
  });
}

const setMode = (mode) => {
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    // Storage can be blocked; the mode still applies for this page.
  }
  apply(mode);
};

const cycleMode = () => {
  const { mode } = getSnapshot();
  setMode(mode === "system" ? "light" : mode === "light" ? "dark" : "system");
};

const LABELS = { system: "System", light: "Light", dark: "Dark" };

/** useColorMode follows the OS light or dark setting unless the user picked one, and re-renders when either changes. */
export function useColorMode() {
  const { mode, isDark } = useSyncExternalStore(subscribe, getSnapshot);
  return { mode, isDark, modeLabel: LABELS[mode], setMode, cycleMode };
}
