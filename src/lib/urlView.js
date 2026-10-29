/** DEFAULT_URL_ZOOM is the zoom used when the URL gives a position but no zoom. */
export const DEFAULT_URL_ZOOM = 12;

const finite = (...v) => v.every((x) => x !== null && x !== "" && Number.isFinite(Number(x)));
const onEarth = (lat, lon) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * viewFromUrl reads a map position from the page URL, in the form AREDN's world map uses: a hash of
 * #zoom/lat/lon (or #lat/lon), or ?lat=&lon=&zoom=. Zooms are MapLibre zooms. It returns null when the URL has none.
 */
export function viewFromUrl(loc = window.location) {
  const parts = loc.hash.replace(/^#/, "").split("/");
  if (parts.length >= 3 && finite(parts[0], parts[1], parts[2])) {
    const [zoom, lat, lon] = parts.slice(0, 3).map(Number);
    if (onEarth(lat, lon)) return { zoom, lat, lon };
  }
  if (parts.length === 2 && finite(parts[0], parts[1])) {
    const [lat, lon] = parts.map(Number);
    if (onEarth(lat, lon)) return { zoom: DEFAULT_URL_ZOOM, lat, lon };
  }
  const q = new URLSearchParams(loc.search);
  const lat = q.get("lat");
  const lon = q.get("lon") ?? q.get("lng");
  if (finite(lat, lon) && onEarth(Number(lat), Number(lon))) {
    const zoom = q.get("zoom") ?? q.get("z");
    return { zoom: finite(zoom) ? Number(zoom) : DEFAULT_URL_ZOOM, lat: Number(lat), lon: Number(lon) };
  }
  return null;
}
