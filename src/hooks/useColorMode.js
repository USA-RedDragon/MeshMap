import { useSyncExternalStore } from "react";
import { colorMode, cycleMode, onColorMode, setMode } from "../lib/colorMode";

const LABELS = { system: "System", light: "Light", dark: "Dark" };

/** useColorMode follows the OS light or dark setting unless the user picked one, and re-renders when either changes. */
export function useColorMode() {
  const { mode, isDark } = useSyncExternalStore(onColorMode, colorMode);
  return { mode, isDark, modeLabel: LABELS[mode], setMode, cycleMode };
}
