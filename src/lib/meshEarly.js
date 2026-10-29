import { loadMesh } from "./meshStore";

/** DEFAULT_DATA_URL is the mesh data file, relative to the page, when appConfig.json names none. */
const DEFAULT_DATA_URL = "data/out.json";

/** DEFAULT_MAP_DATA_URL is the walker's slim map file, read before the full data file. */
const DEFAULT_MAP_DATA_URL = "data/map.json";

/** busted is url with a cache buster unless appConfig.json turns it off. */
function busted(appConfig, url) {
  if (appConfig.dataCacheBuster === false) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now().toFixed(0)}`;
}

/**
 * storedMesh starts loading the stored mesh data that appConfig names, without waiting for the UI. subscribe calls a
 * listener with the newest mesh at once, if there is one, and after every later batch; meta resolves to the crawl's
 * metadata.
 */
export function storedMesh(appConfig) {
  const urls = {
    url: busted(appConfig, appConfig.dataUrl || DEFAULT_DATA_URL),
    mapUrl: appConfig.mapDataUrl === false ? undefined : busted(appConfig, appConfig.mapDataUrl || DEFAULT_MAP_DATA_URL),
    detailsUrl: appConfig.detailsUrl,
  };
  let latest = null;
  const listeners = new Set();
  const meta = loadMesh(urls, (mesh) => {
    latest = mesh;
    listeners.forEach((l) => l(mesh));
  });
  meta.catch(() => undefined);
  return {
    meta,
    subscribe(listener) {
      if (latest) listener(latest);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
