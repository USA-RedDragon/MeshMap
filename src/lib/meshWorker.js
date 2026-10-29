// Fetches, parses and indexes the mesh data off the main thread. It reads the walker's slim map.json when there is
// one, and otherwise streams the crawl file. The page gets slim GeoJSON for the map in batches and asks for the full
// records of one node or link when a popup opens.

import { MeshBuilder, linkPopupModel, nodePopupModel, nodesFromStored, toNode } from "./meshData";
import { nodesFromMap, shardOf } from "./mapFile";

/** BATCH_MS is how long the worker collects nodes before it sends them to the page. */
const BATCH_MS = 75;

let mesh = new MeshBuilder();

/** details says where the full node records are when the mesh came from map.json, and caches the shards read. */
let details = null;

const located = ({ data }) => data && ((data.lat && data.lon) || (data.mlat && data.mlon));

/** objectEnd is the index of the brace that closes the object starting at start, or -1 when the text stops first. */
function objectEnd(b, start) {
  let depth = 0;
  for (let i = start; i < b.length; i++) {
    const c = b.charCodeAt(i);
    if (c === 34) {
      for (i++; i < b.length; i++) {
        const d = b.charCodeAt(i);
        if (d === 92) i++;
        else if (d === 34) break;
      }
      if (i >= b.length) return -1;
    } else if (c === 123 || c === 91) {
      depth++;
    } else if (c === 125 || c === 93) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * NodeScanner finds the objects of the top-level "nodeInfo" array of a crawl file as its text arrives, so each node
 * is parsed on its own. The text outside that array is kept to read the file's other fields at the end.
 */
class NodeScanner {
  constructor() {
    this.buf = "";
    this.phase = "head";
    this.head = "";
    this.tail = "";
  }

  /** push adds text and returns the node objects it completes. */
  push(text) {
    const out = [];
    if (this.phase === "tail") {
      this.tail += text;
      return out;
    }
    this.buf += text;
    if (this.phase === "head") {
      const m = /"nodeInfo"\s*:\s*\[/.exec(this.buf);
      if (!m) return out;
      this.head = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      this.phase = "array";
    }
    const b = this.buf;
    let i = 0;
    for (;;) {
      while (i < b.length && (b[i] === "," || b[i] === " " || b[i] === "\n" || b[i] === "\r" || b[i] === "\t")) i++;
      if (i >= b.length) break;
      if (b[i] === "]") {
        this.phase = "tail";
        this.tail = b.slice(i + 1);
        this.buf = "";
        return out;
      }
      const end = objectEnd(b, i);
      if (end < 0) break;
      out.push(JSON.parse(b.slice(i, end + 1)));
      i = end + 1;
    }
    this.buf = b.slice(i);
    return out;
  }

  /** meta reads the file's fields other than nodeInfo, once the text is complete. */
  meta() {
    try {
      return JSON.parse(`${this.head}"nodeInfo":[]${this.tail}`);
    } catch {
      return {};
    }
  }
}

const emptyDiff = () => ({ nodes: [], arrows: [], links: [], linkUpdates: [] });

const merge = (into, d) => {
  for (const k of Object.keys(into)) into[k].push(...d[k]);
};

function send(id, diff) {
  self.postMessage({ id, ok: true, partial: true, value: { diff, counts: { ...mesh.counts }, nodeCount: mesh.nodeCount } });
}

/** loadMap reads the walker's map.json, or returns null when there is none to read. */
async function loadMap(id, mapUrl, detailsUrl) {
  let m;
  try {
    const res = await fetch(mapUrl);
    if (!res.ok) return null;
    m = await res.json();
  } catch {
    return null;
  }
  if (!m || m.version !== 1 || !Array.isArray(m.nodes)) return null;
  const timings = { origin: performance.timeOrigin };
  mesh = new MeshBuilder();
  details = {
    base: new URL(m.details, detailsUrl ? new URL(detailsUrl, mapUrl) : mapUrl).href,
    shards: m.shards,
    cache: new Map(),
  };
  send(id, mesh.add(nodesFromMap(m)));
  timings.firstNode = timings.done = performance.now();
  return { meta: { nonMapped: m.nonMapped, hostsScraped: m.hostsScraped, date: m.date }, timings, streamed: false, slim: true };
}

/** shard fetches the detail file of a node name once, and resolves to its records. */
function shard(name) {
  const i = shardOf(name, details.shards);
  if (!details.cache.has(i)) {
    const url = new URL(`${i.toString(16).padStart(2, "0")}.json`, details.base);
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`The node details answered ${res.status}`);
      return res.json();
    });
    p.catch(() => details.cache.delete(i));
    details.cache.set(i, p);
  }
  return details.cache.get(i);
}

/** nodeModel answers a node popup. With map.json it sends what that file has first, then the full record. */
async function nodeModel(id, name) {
  const entry = mesh.byName[name];
  if (!entry || !entry.slim || !details) return nodePopupModel(mesh, name);
  self.postMessage({ id, ok: true, partial: true, value: nodePopupModel(mesh, name) });
  try {
    const full = (await shard(name))[name];
    if (full) Object.assign(entry, toNode(full), { slim: false });
  } catch {
    // The popup keeps what map.json had.
    entry.slim = "failed";
  }
  return nodePopupModel(mesh, name);
}

async function load(id, url, mapUrl, detailsUrl) {
  if (mapUrl) {
    const loaded = await loadMap(id, mapUrl, detailsUrl);
    if (loaded) return loaded;
  }
  details = null;
  mesh = new MeshBuilder();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The mesh data answered ${res.status}`);
  const timings = { origin: performance.timeOrigin };
  if (!res.body || typeof TextDecoderStream === "undefined") {
    const stored = JSON.parse(await res.text());
    send(id, mesh.add(nodesFromStored(stored)));
    timings.firstNode = timings.done = performance.now();
    return { meta: { nonMapped: stored.nonMapped, hostsScraped: stored.hostsScraped, date: stored.date }, timings, streamed: false };
  }
  const scanner = new NodeScanner();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = emptyDiff();
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const objs = scanner.push(value).filter(located);
    if (objs.length) merge(pending, mesh.add(nodesFromStored({ nodeInfo: objs })));
    const now = performance.now();
    if (pending.nodes.length && (!timings.firstNode || now - last >= BATCH_MS)) {
      timings.firstNode ??= now;
      send(id, pending);
      last = now;
      pending = emptyDiff();
    }
  }
  if (pending.nodes.length || pending.links.length || pending.linkUpdates.length || pending.arrows.length) send(id, pending);
  timings.done = performance.now();
  const meta = scanner.meta();
  return { meta: { nonMapped: meta.nonMapped, hostsScraped: meta.hostsScraped, date: meta.date }, timings, streamed: true };
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === "load") {
      self.postMessage({ id: msg.id, ok: true, value: await load(msg.id, msg.url, msg.mapUrl, msg.detailsUrl) });
    } else if (msg.type === "node") {
      self.postMessage({ id: msg.id, ok: true, value: await nodeModel(msg.id, msg.name) });
    } else if (msg.type === "link") {
      self.postMessage({ id: msg.id, ok: true, value: linkPopupModel(mesh, msg.link) });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
