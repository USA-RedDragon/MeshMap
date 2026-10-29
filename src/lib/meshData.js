import { distanceMeters } from "./geo";
import { freqStartsWith } from "../utils/freq";

/** BANDS lists the node bands in legend order, with the color each is drawn in. */
export const BANDS = {
  halow: { label: "HaLow", color: "#08b7b2", css: "teal" },
  900: { label: "900 MHz", color: "#c561ec", css: "magenta" },
  24: { label: "2.4 GHz", color: "#810490", css: "purple" },
  34: { label: "3.4 GHz", color: "#0000f8", css: "blue" },
  58: { label: "5 GHz", color: "#ff9742", css: "gold" },
  supernode: { label: "Supernode", color: "#148406", css: "green" },
  off: { label: "No RF", color: "#707070", css: "gray" },
};

/** LINK_TYPES are the link groups, drawn bottom to top, with their default color, width and dash pattern in line widths. */
export const LINK_TYPES = [
  { id: "rf", color: "limegreen", width: 2 },
  { id: "tun", color: "grey", width: 2, dash: [2.5, 2.5] },
  { id: "stun", color: "blue", width: 2, dash: [2.5, 2.5] },
  { id: "dtd", color: "cadetblue", width: 2, dash: [0.5, 5] },
  { id: "rfdtd", color: "limegreen", width: 3, dash: [2 / 3, 2] },
];

export const METRICS = {
  default: { label: "None", unit: "" },
  lq: { label: "Link Quality", unit: "%", min: 0, max: 100, reverse: false, prop: "quality", rev: "rev_quality" },
  ping: { label: "Ping Time", unit: "ms", min: 0, max: 1000, reverse: true, prop: "ping_success_time", rev: "rev_ping_success_time", factor: 1000 },
  ping_quality: { label: "Ping Quality", unit: "%", min: 0, max: 100, reverse: false, prop: "ping_quality", rev: "rev_ping_quality" },
  routes: { label: "Route Count", unit: "", min: 0, max: 100, reverse: false, prop: "babel_route_count" },
  metric: { label: "Babel Metric", unit: "", min: 0, max: 4096, reverse: true, prop: "babel_metric" },
  snr: { label: "SNR", unit: "dB", min: 0, max: 50, reverse: false },
  bitrate: { label: "Bitrate", unit: "Mbps", min: 0, max: 100, reverse: false },
};

export const METRIC_KEYS = Object.keys(METRICS).filter((k) => k !== "default");

export const canonicalHostname = (hostname) => {
  if (typeof hostname !== "string") return "";
  return hostname.replace(/^\./, "").replace(/\.local\.mesh$/i, "").toUpperCase();
};

/** toNode keeps the fields of one sysinfo record that the map uses. */
export const toNode = (data) => ({
  node: data.node,
  lat: data.lat || data.mlat,
  lon: data.lon || data.mlon,
  mlat: data.mlat || data.lat,
  mlon: data.mlon || data.lon,
  meshrf: data.meshrf,
  chanbw: data.chanbw,
  node_details: data.node_details,
  interfaces: data.interfaces,
  link_info: Object.keys(data.link_info || {}).map((key) => data.link_info[key]),
  lqm: data.lqm,
});

/** nodesFromStored is the node list of a crawl file: the nodes that have a location. */
export const nodesFromStored = (stored) =>
  stored.nodeInfo.filter(({ data }) => (data.lat && data.lon) || (data.mlat && data.mlon)).map(({ data }) => toNode(data));

const isHalowBw = (bw) => bw === 1 || bw === 2 || bw === 4 || bw === 8 || bw === "1" || bw === "2" || bw === "4" || bw === "8";
const in34 = (rf) => rf.channel >= 3380 && rf.channel <= 3495;

const num = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(v);
};

/** bandOf is the band a node is drawn and filtered as. */
export function bandOf(n) {
  if (n.node_details && n.node_details.mesh_supernode) return "supernode";
  const rf = n.meshrf;
  if (!rf) return "off";
  const chan = parseInt(rf.channel);
  if (chan >= 3380 && chan <= 3495) return "34";
  const freq = rf.freq;
  if (freq) {
    if (freqStartsWith(freq, "2")) return "24";
    if (freqStartsWith(freq, "5")) return "58";
    if (freqStartsWith(freq, "3")) return "34";
    if (freqStartsWith(freq, "9")) {
      const chanbw = typeof rf.chanbw === "number" ? rf.chanbw : parseInt(rf.chanbw);
      return chanbw === 1 || chanbw === 2 || chanbw === 4 || chanbw === 8 ? "halow" : "900";
    }
  }
  return "off";
}

const trackersOf = (lqm) => {
  if (!lqm) return null;
  if (lqm.info && lqm.info.trackers) return lqm.info.trackers;
  return lqm.trackers || null;
};

const findTracker = (lqm, target) => {
  const trackers = trackersOf(lqm);
  if (!trackers || !target) return null;
  const host = canonicalHostname(target.node);
  const ips = target.interfaces ? target.interfaces.map((i) => i.ip) : [];
  return Object.values(trackers).find((t) => {
    const th = t.hostname ? canonicalHostname(t.hostname) : "";
    if (th && th === host) return true;
    if (t.ip && ips.includes(t.ip)) return true;
    if (t.canonical_ip && ips.includes(t.canonical_ip)) return true;
    return false;
  }) || null;
};

const reverseLinkOf = (conn) => {
  const li = conn.neighbor && conn.neighbor.link_info;
  return li ? li.find((l) => l.hostname && canonicalHostname(l.hostname) === conn.from) : undefined;
};

const snrOf = (l) => (l && l.signal && l.noise ? l.signal - l.noise : undefined);
const bitrateOf = (l) => (l ? l.bitrate || l.rate : undefined);

/** metricValue is the raw value of metric on conn in one direction, or undefined when the data has none. */
export function metricValue(conn, metric, reverse) {
  const def = METRICS[metric];
  if (metric === "snr") return snrOf(reverse ? reverseLinkOf(conn) : conn.link);
  if (metric === "bitrate") return bitrateOf(reverse ? reverseLinkOf(conn) : conn.link);
  let value;
  if (!reverse) {
    value = conn.tracker ? conn.tracker[def.prop] : undefined;
  } else if (conn.reverseTracker) {
    value = conn.reverseTracker[def.prop];
  } else if (conn.tracker && def.rev) {
    value = conn.tracker[def.rev];
  }
  if (value !== undefined && value !== null && def.factor) value = value * def.factor;
  return value;
}

const linkGroup = (m, n, to) => {
  switch (m.linkType) {
    case "RF":
      return "rf";
    case "TUN":
    case "WIREGUARD":
      return "tun";
    case "SUPER":
      return "stun";
    case "XLINK":
      return "rfdtd";
    case "DTD":
      return distanceMeters([n.lonNum, n.latNum], [to.lonNum, to.latNum]) < 50 ? "dtd" : "rfdtd";
    default:
      return null;
  }
};

const emptyCounts = () => ({ halow: 0, 900: 0, 24: 0, 34: 0, 58: 0, supernode: 0, off: 0, all: 0 });

const linkFeature = (c) => {
  const properties = { id: c.id, group: c.group, b1: c.b1, b2: c.b2 };
  for (const k of METRIC_KEYS) {
    const f = num(metricValue(c, k, false));
    const r = num(metricValue(c, k, true));
    if (Number.isFinite(f)) properties[`f_${k}`] = f;
    if (Number.isFinite(r)) properties[`r_${k}`] = r;
  }
  return { type: "Feature", id: c.id, properties, geometry: { type: "LineString", coordinates: c.coords } };
};

/**
 * MeshBuilder turns nodes into the lookups the popups need and the GeoJSON the map draws, a batch at a time, so the
 * map can draw nodes while the rest still load. A link is drawn once per node pair, from the first node in the list
 * that names the other; a link to a node not seen yet waits until that node arrives. b1 is the band of the node the
 * link is drawn from and b2 the band of the other end when it names the first one too, so a band filter shows the
 * links of every node in the band, as the older map did. Features carry ids, so batches can be added in place.
 */
export class MeshBuilder {
  constructor() {
    this.byName = {};
    this.links = [];
    this.coords = {};
    this.counts = emptyCounts();
    this.nodeCount = 0;
    this.features = { nodes: [], arrows: [], links: [] };
    this.pairs = new Map();
    this.pending = new Map();
  }

  /** add takes a batch of nodes and returns what it adds to the map and the links it changes. */
  add(batch) {
    const diff = { nodes: [], arrows: [], links: [], linkUpdates: [] };
    const fresh = [];
    for (const n of batch || []) {
      const name = canonicalHostname(n.node);
      const entry = {
        ...n,
        name,
        band: bandOf(n),
        latNum: num(n.lat),
        lonNum: num(n.lon),
        mlatNum: num(n.mlat),
        mlonNum: num(n.mlon),
        link_info: n.link_info || [],
      };
      this.byName[name] = entry;
      this.count(entry);
      fresh.push(entry);
    }
    const c = this.counts;
    c.all = c[900] + c[24] + c[34] + c[58] + c.halow + c.off;
    for (const n of fresh) {
      for (const p of this.pending.get(n.name) || []) this.link(p.n, p.m, diff);
      this.pending.delete(n.name);
      if (!(n.mlat && n.mlon) || !Number.isFinite(n.mlatNum) || !Number.isFinite(n.mlonNum)) continue;
      const coords = [n.mlonNum, n.mlatNum];
      const node = { type: "Feature", id: this.features.nodes.length, properties: { name: n.name, band: n.band }, geometry: { type: "Point", coordinates: coords } };
      this.features.nodes.push(node);
      diff.nodes.push(node);
      this.coords[n.name] = coords;
      this.nodeCount++;
      const az = n.meshrf ? n.meshrf.azimuth : undefined;
      if (az !== null && az !== undefined && az !== "" && Number.isFinite(Number(az))) {
        const arrow = { type: "Feature", id: this.features.arrows.length, properties: { band: n.band, rot: parseInt(az) - 45 }, geometry: { type: "Point", coordinates: coords } };
        this.features.arrows.push(arrow);
        diff.arrows.push(arrow);
      }
      for (const m of n.link_info) {
        const tn = canonicalHostname(m.hostname);
        if (this.byName[tn]) {
          this.link(n, m, diff);
        } else {
          if (!this.pending.has(tn)) this.pending.set(tn, []);
          this.pending.get(tn).push({ n, m });
        }
      }
    }
    return diff;
  }

  count(n) {
    const c = this.counts;
    const rf = n.meshrf;
    if (n.node_details && n.node_details.mesh_supernode) c.supernode++;
    if (!rf) return;
    if (rf.status === "off") c.off++;
    if (!rf.freq || rf.status !== "on") return;
    if (freqStartsWith(rf.freq, "9")) {
      if (isHalowBw(rf.chanbw)) c.halow++;
      else c[900]++;
    }
    if (freqStartsWith(rf.freq, "2")) c[24]++;
    if (freqStartsWith(rf.freq, "3") || in34(rf)) c[34]++;
    if (freqStartsWith(rf.freq, "5") && !in34(rf)) c[58]++;
  }

  link(n, m, diff) {
    const tn = canonicalHostname(m.hostname);
    const to = this.byName[tn];
    if (!to || !to.lat || !to.lon) return;
    const seen = this.pairs.get(`${tn}/${n.name}`);
    if (seen !== undefined) {
      const c = seen >= 0 ? this.links[seen] : null;
      if (c && c.from === tn && c.b2 === null) {
        c.b2 = n.band;
        this.features.links[seen].properties.b2 = n.band;
        diff.linkUpdates.push({ id: seen, addOrUpdateProperties: [{ key: "b2", value: n.band }] });
      }
      return;
    }
    if (!Number.isFinite(n.latNum) || !Number.isFinite(n.lonNum) || !Number.isFinite(to.latNum) || !Number.isFinite(to.lonNum)) return;
    const group = linkGroup(m, n, to);
    let index = -1;
    if (group) {
      index = this.links.length;
      const c = {
        id: index,
        group,
        from: n.name,
        to: tn,
        link: m,
        neighbor: to,
        tracker: findTracker(n.lqm, to),
        reverseTracker: findTracker(to.lqm, n),
        coords: [[n.lonNum, n.latNum], [to.lonNum, to.latNum]],
        b1: n.band,
        b2: null,
      };
      this.links.push(c);
      const f = linkFeature(c);
      this.features.links.push(f);
      diff.links.push(f);
    }
    this.pairs.set(`${tn}/${n.name}`, index);
    this.pairs.set(`${n.name}/${tn}`, index);
  }
}

/** buildMeshData builds the whole mesh from a node list at once. */
export function buildMeshData(nodesData) {
  const b = new MeshBuilder();
  b.add(nodesData);
  return b;
}

/** nodePopupModel is what the popup of one node shows: the node and the neighbors it names. */
export function nodePopupModel(mesh, name) {
  const node = mesh.byName[name];
  if (!node) return null;
  const byName = {};
  for (const m of node.link_info) {
    const hn = mesh.byName[canonicalHostname(m.hostname)];
    if (hn) byName[hn.name] = { name: hn.name, lat: hn.lat, lon: hn.lon, latNum: hn.latNum, lonNum: hn.lonNum, link_info: hn.link_info };
  }
  return { node, byName };
}

/** linkPopupModel is what the popup of one link needs to show its metrics both ways. */
export function linkPopupModel(mesh, id) {
  const c = mesh.links[id];
  if (!c) return null;
  return { from: c.from, to: c.to, link: c.link, tracker: c.tracker, reverseTracker: c.reverseTracker, neighbor: { link_info: c.neighbor.link_info } };
}
