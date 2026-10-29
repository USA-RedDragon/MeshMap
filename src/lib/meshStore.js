import { buildMeshData, linkPopupModel, nodePopupModel } from "./meshData";
import { mark } from "./marks";

/**
 * A mesh is what the map and the legend draw from. features holds every feature so far, batches the additions in the
 * order they came, so the map can add each batch in place, and key names the load they belong to. getNode and
 * getLink answer the details a popup shows. loadMesh streams one from the crawl file through a worker; meshFromNodes
 * builds one on the page from the nodes a live crawl found.
 */

let keys = 0;

function collector(getNode, getLink) {
  const key = ++keys;
  const features = { nodes: [], arrows: [], links: [] };
  const coords = {};
  const batches = [];
  let counts = {};
  let nodeCount = 0;
  return {
    add(diff, c, n) {
      features.nodes.push(...diff.nodes);
      features.arrows.push(...diff.arrows);
      features.links.push(...diff.links);
      for (const u of diff.linkUpdates) {
        for (const p of u.addOrUpdateProperties) features.links[u.id].properties[p.key] = p.value;
      }
      for (const f of diff.nodes) coords[f.properties.name] = f.geometry.coordinates;
      batches.push(diff);
      counts = c;
      nodeCount = n;
    },
    snapshot(complete) {
      return { key, version: batches.length, batches, features, coords, counts, nodeCount, complete, getNode, getLink };
    },
  };
}

export function meshFromNodes(nodes) {
  const m = buildMeshData(nodes);
  const c = collector(async (name) => nodePopupModel(m, name), async (id) => linkPopupModel(m, id));
  c.add({ ...m.features, linkUpdates: [] }, m.counts, m.nodeCount);
  return c.snapshot(true);
}

export const EMPTY_MESH = meshFromNodes([]);

/** loadMesh streams url through a worker, calls onMesh with the mesh after every batch, and resolves to the crawl's metadata. */
export function loadMesh(url, onMesh) {
  const worker = new Worker(new URL("./meshWorker.js", import.meta.url), { type: "module" });
  const waiting = new Map();
  let next = 0;
  const ask = (msg, onPartial) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      waiting.set(id, { resolve, reject, onPartial });
      worker.postMessage({ ...msg, id });
    });
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    if (data.partial) {
      w.onPartial(data.value);
      return;
    }
    waiting.delete(data.id);
    if (data.ok) w.resolve(data.value);
    else w.reject(new Error(data.error));
  };
  const c = collector((name) => ask({ type: "node", name }), (id) => ask({ type: "link", link: id }));
  let first = true;
  return ask({ type: "load", url: new URL(url, document.baseURI).href }, ({ diff, counts, nodeCount }) => {
    c.add(diff, counts, nodeCount);
    if (first) mark("first-batch");
    first = false;
    onMesh(c.snapshot(false));
  }).then(({ meta, timings }) => {
    const at = (t) => timings.origin + t - performance.timeOrigin;
    if (timings.firstNode) mark("worker-first-node", at(timings.firstNode));
    mark("worker-done", at(timings.done));
    onMesh(c.snapshot(true));
    return meta;
  });
}
