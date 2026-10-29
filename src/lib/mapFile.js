// Reads the walker's slim map.json. Its nodes keep the sysinfo field names, so they go through toNode like crawl file
// records; only the LQM trackers come as rows, in the order of trackerColumns.

import { canonicalHostname, toNode } from "./meshData";

/** nodesFromMap is the node list of a map.json: the nodes that have a location, marked slim until their details load. */
export function nodesFromMap(m) {
  const cols = m.trackerColumns || [];
  return m.nodes
    .filter((d) => (d.lat && d.lon) || (d.mlat && d.mlon))
    .map((d) => {
      const trackers = (d.trackers || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
      return { ...toNode({ ...d, lqm: trackers.length ? { trackers } : undefined }), slim: true };
    });
}

/** shardOf is the detail file of a node: FNV-1a 32 of the UTF-8 bytes of its canonical name, modulo shards. */
export function shardOf(name, shards) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(canonicalHostname(name))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % shards;
}
