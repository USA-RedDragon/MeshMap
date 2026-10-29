/**
 * An IndexedDB stand-in for the part of the Cache Storage API that the block cache and the asset cache use.
 * Browsers only offer Cache Storage in a secure context, and mesh users load the map over plain
 * http://*.local.mesh, so there the same caches live in IndexedDB instead, under the same names and keys.
 */

const DB_NAME = 'meshmap-cache';
const STORE = 'entries';

type Entry = { cache: string; key: string; body: ArrayBuffer; type: string };
type KeyLike = string | { url: string };

let opened: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!opened) {
    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: ['cache', 'key'] }).createIndex('cache', 'cache');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('The cache database is blocked'));
    });
    opened.catch(() => {
      opened = null;
    });
  }
  return opened;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const result = done(work(tx.objectStore(STORE)));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The cache transaction was aborted'));
  });
  return result;
}

const keyOf = (k: KeyLike): string => (typeof k === 'string' ? k : k.url);

const range = (cache: string) => IDBKeyRange.bound([cache, ''], [cache, '\uffff']);

class IdbCache {
  constructor(private readonly name: string) {}

  async match(k: KeyLike): Promise<Response | undefined> {
    const e = (await run('readonly', (s) => s.get([this.name, keyOf(k)]))) as Entry | undefined;
    return e ? new Response(e.body, { status: 200, headers: { 'content-type': e.type } }) : undefined;
  }

  async put(k: KeyLike, res: Response): Promise<void> {
    const body = await res.arrayBuffer();
    const entry: Entry = { cache: this.name, key: keyOf(k), body, type: res.headers.get('content-type') ?? 'application/octet-stream' };
    await run('readwrite', (s) => s.put(entry));
  }

  async delete(k: KeyLike): Promise<boolean> {
    await run('readwrite', (s) => s.delete([this.name, keyOf(k)]));
    return true;
  }

  async keys(): Promise<Array<{ url: string }>> {
    const keys = (await run('readonly', (s) => s.getAllKeys(range(this.name)))) as Array<[string, string]>;
    return keys.map(([, url]) => ({ url }));
  }
}

class IdbCacheStorage {
  async open(name: string): Promise<IdbCache> {
    return new IdbCache(name);
  }

  async keys(): Promise<string[]> {
    const names = new Set<string>();
    const tx = (await db()).transaction(STORE, 'readonly');
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore(STORE).index('cache').openKeyCursor(null, 'nextunique');
      req.onsuccess = () => {
        const c = req.result;
        if (!c) {
          resolve();
          return;
        }
        names.add(c.key as string);
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    return [...names];
  }

  async delete(name: string): Promise<boolean> {
    await run('readwrite', (s) => s.delete(range(name)));
    return true;
  }
}

let fallback: CacheStorage | undefined;

/** persistentStore is the browser's Cache Storage where it has one, else the IndexedDB stand-in, else undefined. */
export function persistentStore(): CacheStorage | undefined {
  if (globalThis.caches) {
    return globalThis.caches;
  }
  if (!fallback && typeof indexedDB !== 'undefined') {
    fallback = new IdbCacheStorage() as unknown as CacheStorage;
  }
  return fallback;
}
