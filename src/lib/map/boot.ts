import { mark, PERF } from '../marks';
import { colorMode } from '../colorMode';
import { viewFromUrl } from '../urlView';
import { BASEMAP_ATTRIBUTION, type Basemap, mapStyle, type MapSettings, prepareMap, RASTER_ATTRIBUTION, rebase, warmGlyphs } from './setup';

/** AppConfig is the part of appConfig.json the map needs before the rest of the app loads. */
type AppConfig = { mapSettings?: MapSettings & { zoom?: string | number; mapCenter?: { lat?: string | number; lon?: string | number } } };

/** Booted is the map the page started before the UI loaded, with the basemap it draws. */
export type Booted = {
  maplibregl: typeof import('maplibre-gl');
  map: import('maplibre-gl').Map;
  basemap: Basemap;
  changed: Promise<Basemap | null>;
  dark: boolean;
};

/**
 * Boot is what the page starts first. config is the current appConfig.json; map is the map; loaded settles when the
 * basemap in view has loaded, and complete when it is also drawn and the map is idle. firstFrame settles once the
 * first basemap tiles are on screen, or when the map fails or takes too long. stored is the stored mesh data, once
 * the page has started loading it.
 */
export type Boot = {
  container: HTMLElement;
  config: Promise<AppConfig>;
  map: Promise<Booted>;
  loaded: Promise<void>;
  complete: Promise<void>;
  firstFrame: Promise<void>;
  stored?: Promise<unknown>;
};

/** COMPACT_QUERY matches the small map tile the AREDN node pages embed: small in both directions, or short. */
export const COMPACT_QUERY = '((max-width: 499px) and (max-height: 499px)), (max-height: 299px)';

/** FIRST_FRAME_WAIT_MS is how long the rest of the app waits for the basemap before it loads anyway. */
const FIRST_FRAME_WAIT_MS = 2500;

const CONFIG_KEY = 'meshmap-config';

declare global {
  interface Window {
    __mmConfig?: Promise<AppConfig>;
    __meshmap?: unknown;
  }
}

function storedConfig(): AppConfig | null {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as AppConfig | null;
  } catch {
    return null;
  }
}

function fetchConfig(): Promise<AppConfig> {
  return fetch('appConfig.json').then((res) => {
    if (!res.ok) {
      throw new Error(`appConfig.json answered ${res.status}`);
    }
    return res.json() as Promise<AppConfig>;
  });
}

const sameBases = (a?: AppConfig | null, b?: AppConfig | null) => JSON.stringify(a?.mapSettings?.basemaps ?? null) === JSON.stringify(b?.mapSettings?.basemaps ?? null);

/**
 * startBoot creates the map in container before React and the mesh data load. It reads the settings appConfig.json
 * had on the last visit, so a return visit does not wait for the file; the page's inline script has already started
 * fetching the current one. If its basemaps changed, the map switches to the new ones once they answer.
 */
export function startBoot(container: HTMLElement): Boot {
  const config = window.__mmConfig ?? fetchConfig();
  const known = storedConfig();
  void config.then(
    (c) => {
      mark('config');
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
      } catch {
        // Without storage, every visit waits for appConfig.json.
      }
    },
    () => undefined,
  );
  const { isDark: dark } = colorMode();
  if (window.matchMedia?.(COMPACT_QUERY).matches) {
    container.parentElement?.classList.add('compact');
  }
  // Load the basemap style's code and the theme's style while MapLibre and the basemap check are under way.
  void import('./style');
  void (dark ? import('./styles/dark.json') : import('./styles/light.json'));
  const css = import('maplibre-gl/dist/maplibre-gl.css');

  const map = (async (): Promise<Booted> => {
    const settingsFrom = known ?? (await config);
    const settings = settingsFrom.mapSettings ?? {};
    const [{ maplibregl, basemap, changed: probed }] = await Promise.all([prepareMap(settings), css]);
    mark('basemap');
    container.dataset.basemap = basemap.kind;
    const style = await mapStyle(basemap, dark);
    warmGlyphs(style);
    const center = settings.mapCenter ?? {};
    const lon = Number(center.lon);
    const lat = Number(center.lat);
    const zoom = Number(settings.zoom);
    const fromUrl = viewFromUrl();
    const m = new maplibregl.Map({
      container,
      style,
      center: fromUrl ? [fromUrl.lon, fromUrl.lat] : Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : [-96, 38],
      // appConfig zooms are Leaflet zooms of 256 px tiles; MapLibre draws the same scale one zoom lower.
      zoom: fromUrl ? fromUrl.zoom : Number.isFinite(zoom) ? zoom - 1 : 3,
      minZoom: 2,
      hash: true,
      // Draw symbols at once instead of fading them in over 300 ms, so nodes show the moment their data does.
      fadeDuration: 0,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mark('map');
    if (PERF) {
      window.__meshmap = m;
    }
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    const attribution = new maplibregl.AttributionControl({ compact: true, customAttribution: basemap.kind === 'raster' ? RASTER_ATTRIBUTION : BASEMAP_ATTRIBUTION });
    // MapLibre opens the compact attribution the first time it fills in and keeps it open until the first drag,
    // which covers most of a small embed. Start it collapsed behind the "i" button instead.
    const ctl = attribution as unknown as { _container: HTMLElement; _updateCompact: () => void };
    const updateCompact = ctl._updateCompact;
    ctl._updateCompact = () => {
      const wasCompact = ctl._container.classList.contains('maplibregl-compact');
      updateCompact();
      if (!wasCompact) ctl._container.classList.remove('maplibregl-compact-show');
    };
    m.addControl(attribution, 'bottom-right');
    if (fromUrl) {
      const spot = document.createElement('div');
      spot.className = 'url-spot';
      new maplibregl.Marker({ element: spot }).setLngLat([fromUrl.lon, fromUrl.lat]).addTo(m);
    }
    // A basemap list changed since the last visit wins over the remembered one once one of its bases answers.
    const rebased = known
      ? config.then(
          async (c) => {
            if (sameBases(c, known)) {
              return null;
            }
            return rebase(c.mapSettings ?? {});
          },
          () => null,
        )
      : Promise.resolve(null);
    const changed = Promise.all([probed, rebased.catch(() => null)]).then(([a, b]) => b ?? a);
    return { maplibregl, map: m, basemap, changed, dark };
  })();

  const loaded = map.then(
    ({ map: m }) =>
      new Promise<void>((resolve) => {
        m.once('load', () => {
          mark('basemap-drawn');
          mark('load');
          resolve();
        });
      }),
  );
  // The basemap of the first view, fully drawn: every tile in view loaded and on screen.
  const complete = map.then(
    ({ map: m }) =>
      new Promise<void>((resolve) => {
        m.once('idle', () => {
          mark('basemap-complete');
          resolve();
        });
      }),
  );
  // The first frame with basemap tiles in it, which can come well before every tile in view has drawn.
  const firstFrame = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, FIRST_FRAME_WAIT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    loaded.then(done, done);
    map.then(({ map: m }) => {
      const onData = (e: { dataType?: string; tile?: unknown }) => {
        if (e.dataType === 'source' && e.tile) {
          m.off('data', onData);
          m.once('render', () => {
            mark('first-tile-drawn');
            done();
          });
        }
      };
      m.on('data', onData);
    }, done);
  });
  return { container, config, map, loaded, complete, firstFrame };
}
