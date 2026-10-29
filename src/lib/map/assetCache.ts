import type { AddProtocolAction } from 'maplibre-gl';

import { persistentStore } from './idbCache';

/** CACHED_PROTOCOL marks map assets, such as the label glyphs, that the map keeps in the persistent cache. */
export const CACHED_PROTOCOL = 'meshmap-cached';

const CACHE_NAME = 'meshmap-assets';

/** cachedUrl routes url through the persistent cache. */
export function cachedUrl(url: string): string {
  return `${CACHED_PROTOCOL}://${url}`;
}

/** warming holds assets fetched before the map asked for them, until it does. */
const warming = new Map<string, Promise<ArrayBuffer>>();

/**
 * cachedAsset answers a request for a cached URL from the persistent cache, and fetches and stores it on a miss.
 * The assets it serves are static files of the app, so an entry stays good until the browser drops it.
 */
export const cachedAsset: AddProtocolAction = async (params, abort) => {
  const url = params.url.slice(CACHED_PROTOCOL.length + 3);
  const early = warming.get(url);
  if (early) {
    warming.delete(url);
    const data = await early.catch(() => null);
    if (data) {
      return { data };
    }
  }
  return { data: await load(url, abort.signal) };
};

/** warmAsset starts loading a cached URL that the map is about to ask for. */
export function warmAsset(cached: string): void {
  const url = cached.slice(CACHED_PROTOCOL.length + 3);
  if (!warming.has(url)) {
    const p = load(url);
    p.catch(() => undefined);
    warming.set(url, p);
  }
}

async function load(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const store = persistentStore();
  if (store) {
    try {
      const hit = await (await store.open(CACHE_NAME)).match(url);
      if (hit) {
        return await hit.arrayBuffer();
      }
    } catch {
      // A broken cache only costs a fetch.
    }
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`${url} answered ${res.status}`);
  }
  const data = await res.arrayBuffer();
  if (store) {
    void store
      .open(CACHE_NAME)
      .then((c) => c.put(url, new Response(data.slice(0), { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } })))
      .catch(() => undefined);
  }
  return data;
}
