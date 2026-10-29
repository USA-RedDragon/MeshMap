// SPDX-License-Identifier: AGPL-3.0-or-later
// DMRHub - Run a DMR network server in a single binary
// Copyright (C) 2023-2026 Jacob McSwain
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// The source code is available at <https://github.com/USA-RedDragon/DMRHub>

import type { StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PMTiles, Protocol } from 'pmtiles';

import { mark } from '../marks';
import { cachedAsset, cachedUrl, CACHED_PROTOCOL, warmAsset } from './assetCache';
import { type Basemap as Archive, chooseBasemap, clearOldArchives, DEFAULT_BASEMAPS, PROBE_TIMEOUT_MS, sourceOf } from './archive';

/** BASEMAP_ATTRIBUTION credits the basemap's data. */
export const BASEMAP_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

/** RASTER_ATTRIBUTION credits the raster tile servers of the older config. */
export const RASTER_ATTRIBUTION = '© OpenStreetMap contributors';

/** RasterServer is a raster tile server of the older config, with an optional tile that must load for it to be used. */
export type RasterServer = { test?: string; url: string };

/** MapSettings is the part of appConfig.json that picks the basemap. */
export type MapSettings = { basemaps?: string[]; basemapTimeoutMs?: number; servers?: RasterServer[] };

/** Basemap is what the map draws under the mesh: a vector archive, raster tiles, or nothing when neither answered. */
export type Basemap = { kind: 'archive'; archive: string } | { kind: 'raster'; url: string } | { kind: 'none'; reason: string };

/** Prepared is MapLibre, the basemap to draw now, and changed, which resolves to a different basemap if the background check finds one. */
type Prepared = { maplibregl: typeof import('maplibre-gl'); basemap: Basemap; changed: Promise<Basemap | null> };

const REMEMBER_KEY = 'meshmap-basemap';

/** remembered is the archive an earlier visit chose from the same list of bases, so a return visit can draw from the cache without waiting for the probe. */
function remembered(bases: string[]): Archive | null {
  try {
    const r = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null') as { bases?: string[]; archive?: Archive } | null;
    return r && JSON.stringify(r.bases) === JSON.stringify(bases) && r.archive?.archive && r.archive.layout ? r.archive : null;
  } catch {
    return null;
  }
}

function remember(bases: string[], archive: Archive): void {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ bases, archive }));
  } catch {
    // Without storage, every visit probes first.
  }
}

const sameArchive = (a: Archive, b: Archive) => a.archive === b.archive && a.layout.parts === b.layout.parts && a.layout.partBytes === b.layout.partBytes;

let prepared: Promise<Prepared> | null = null;

function probeRaster(server: RasterServer, timeoutMs: number): Promise<string | null> {
  if (!server.test) {
    return Promise.resolve(server.url);
  }
  return new Promise((resolve) => {
    const img = document.createElement('img');
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(server.url);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = server.test!;
  });
}

/** protocol serves the basemap archives to MapLibre. */
const protocol = new Protocol();

function use(a: Archive): Basemap {
  protocol.add(new PMTiles(sourceOf(a.archive, a.layout)));
  void clearOldArchives(a.archive).catch(() => undefined);
  return { kind: 'archive', archive: a.archive };
}

const basesOf = (settings: MapSettings) => (settings.basemaps?.length ? settings.basemaps : DEFAULT_BASEMAPS);

/** rebase picks the first basemap of settings that answers, for a basemap list that changed after the map started. */
export async function rebase(settings: MapSettings): Promise<Basemap> {
  const bases = basesOf(settings);
  const found = await chooseBasemap(bases, Number(settings.basemapTimeoutMs) || PROBE_TIMEOUT_MS);
  remember(bases, found);
  return use(found);
}

async function pickBasemap(settings: MapSettings): Promise<Omit<Prepared, 'maplibregl'>> {
  const bases = basesOf(settings);
  const timeout = Number(settings.basemapTimeoutMs) || PROBE_TIMEOUT_MS;
  const probe = chooseBasemap(bases, timeout);
  const known = remembered(bases);
  if (known) {
    // Draw the remembered archive at once; if the probe finds a newer or different one, switch to it. If no base
    // answers at all, keep drawing the remembered one from the cache.
    const changed = probe.then(
      (found) => {
        if (sameArchive(found, known)) {
          return null;
        }
        remember(bases, found);
        return use(found);
      },
      () => null,
    );
    return { basemap: use(known), changed };
  }
  let reason: string;
  try {
    const found = await probe;
    remember(bases, found);
    return { basemap: use(found), changed: Promise.resolve(null) };
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }
  for (const server of settings.servers ?? []) {
    const url = await probeRaster(server, timeout);
    if (url) {
      return { basemap: { kind: 'raster', url }, changed: Promise.resolve(null) };
    }
  }
  return { basemap: { kind: 'none', reason }, changed: Promise.resolve(null) };
}

/** prepareMap loads MapLibre and finds the first basemap that answers, once per page. The two run side by side. */
export function prepareMap(settings: MapSettings = {}): Promise<Prepared> {
  if (!prepared) {
    const lib = (async () => {
      const maplibregl = await import('maplibre-gl');
      mark('maplibre');
      maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);
      maplibregl.addProtocol(CACHED_PROTOCOL, cachedAsset);
      maplibregl.addProtocol('pmtiles', protocol.tile);
      // Start the map's workers now, so their script loads while the basemap is still being chosen.
      maplibregl.prewarm();
      return maplibregl;
    })();
    prepared = Promise.all([lib, pickBasemap(settings)]).then(([maplibregl, picked]) => ({ maplibregl, ...picked }));
    prepared.catch(() => {
      prepared = null;
    });
  }
  return prepared;
}

/** glyphsUrl serves the label fonts from the app's own base path, so labels work offline and under any prefix, through the persistent cache. */
export function glyphsUrl(): string {
  return cachedUrl(`${new URL(`${import.meta.env.BASE_URL}glyphs/`, document.baseURI).href}{fontstack}/{range}.pbf`);
}

function rasterTiles(url: string): string[] {
  return url.includes('{s}') ? ['a', 'b', 'c'].map((s) => url.replace('{s}', s)) : [url];
}

/** mapStyle is the basemap style for a theme. */
export async function mapStyle(basemap: Basemap, dark: boolean): Promise<StyleSpecification> {
  if (basemap.kind === 'archive') {
    const [{ basemapStyle }, json] = await Promise.all([import('./style'), dark ? import('./styles/dark.json') : import('./styles/light.json')]);
    return basemapStyle(json.default as unknown as StyleSpecification, basemap.archive, glyphsUrl());
  }
  const style: StyleSpecification = {
    version: 8,
    glyphs: glyphsUrl(),
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#1b1d21' : '#f2efe9' } }],
  };
  if (basemap.kind === 'raster') {
    style.sources.raster = { type: 'raster', tiles: rasterTiles(basemap.url), tileSize: 256, maxzoom: 19, attribution: RASTER_ATTRIBUTION };
    style.layers.push({ id: 'raster', type: 'raster', source: 'raster' });
  }
  return style;
}

/** warmGlyphs starts loading the first glyph range of every font style uses, so labels do not wait for the first tiles to ask. */
export function warmGlyphs(style: StyleSpecification): void {
  if (!style.glyphs?.startsWith(`${CACHED_PROTOCOL}://`)) {
    return;
  }
  const stacks = new Set<string>();
  for (const layer of style.layers) {
    const font = (layer as { layout?: { 'text-font'?: unknown } }).layout?.['text-font'];
    if (Array.isArray(font) && font.every((f) => typeof f === 'string')) {
      stacks.add(font.join(','));
    }
  }
  for (const stack of stacks) {
    warmAsset(style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', '0-255'));
  }
}
