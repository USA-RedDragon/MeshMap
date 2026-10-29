/** PERF is on when the page URL has ?perf=1. It turns on the load marks and the hooks that benchmarks and tests use. */
export const PERF = typeof location !== "undefined" && new URLSearchParams(location.search).get("perf") === "1";

/** mark records a load milestone as a performance mark named mm:<name> when PERF is on. */
export function mark(name, startTime) {
  if (!PERF) return;
  try {
    performance.mark(`mm:${name}`, startTime === undefined ? undefined : { startTime });
  } catch {
    // Marks are only for measuring.
  }
}
