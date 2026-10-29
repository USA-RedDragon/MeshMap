import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useColorMode } from "../hooks/useColorMode";
import { mapStyle } from "../lib/map/setup";
import { BANDS, LINK_TYPES, METRICS } from "../lib/meshData";
import { meshImages } from "../lib/meshImages";
import { PERF, mark } from "../lib/marks";
import LinkPopup from "./LinkPopup";
import NodePopup from "./NodePopup";

const SRC_NODES = "mesh-nodes";
const SRC_ARROWS = "mesh-arrows";
const SRC_LINKS = "mesh-links";
const NODE_LAYER = "mesh-nodes";
const ARROW_LAYER = "mesh-arrows";
const linkLayerId = (t) => `mesh-links-${t.id}`;
const LINK_LAYERS = LINK_TYPES.map(linkLayerId);

const RED = "rgb(255, 0, 0)";
const YELLOW = "rgb(255, 255, 0)";
const GREEN = "rgb(0, 128, 0)";

/** LINK_HIT_PX is how far from a link, in pixels, a click still opens it. */
const LINK_HIT_PX = 4;
const PAN_PADDING = 10;

/** lineColor colors a link group by metric on a red, yellow, green ramp, or in its default color when the link has no value. */
function lineColor(color, metric, direction) {
  if (metric === "default" || !METRICS[metric]) return color;
  const m = METRICS[metric];
  const value = ["get", `${direction === "reverse" ? "r" : "f"}_${metric}`];
  const [lo, hi] = m.reverse ? [GREEN, RED] : [RED, GREEN];
  return ["case", ["==", ["typeof", value], "number"], ["interpolate", ["linear"], value, m.min, lo, (m.min + m.max) / 2, YELLOW, m.max, hi], color];
}

const bandFilter = (selected) => (selected === "all" ? null : ["==", ["get", "band"], selected]);

function linkFilter(t, selected) {
  const group = ["==", ["get", "group"], t.id];
  if (selected === "all") return group;
  return ["all", group, ["any", ["==", ["get", "b1"], selected], ["==", ["get", "b2"], selected]]];
}

const withFilter = (layer, filter) => (filter ? { ...layer, filter } : layer);

const collection = (features) => ({ type: "FeatureCollection", features: features.slice() });

/** applyMesh brings the map's sources up to mesh: it adds the batches the map lacks in place, or replaces everything for a new load. */
function applyMesh(m, mesh, applied) {
  const prev = applied.mesh;
  if (prev === mesh || !m.getSource(SRC_LINKS)) return;
  if (!prev || prev.key !== mesh.key) {
    m.getSource(SRC_LINKS).setData(collection(mesh.features.links));
    m.getSource(SRC_ARROWS).setData(collection(mesh.features.arrows));
    nodesDone(m.getSource(SRC_NODES).setData(collection(mesh.features.nodes), true), mesh, applied);
  } else {
    for (const d of mesh.batches.slice(prev.version, mesh.version)) {
      if (d.links.length || d.linkUpdates.length) m.getSource(SRC_LINKS).updateData({ add: d.links, update: d.linkUpdates });
      if (d.arrows.length) m.getSource(SRC_ARROWS).updateData({ add: d.arrows });
      if (d.nodes.length) nodesDone(m.getSource(SRC_NODES).updateData({ add: d.nodes }), mesh, applied);
    }
  }
  applied.mesh = mesh;
  colorSpot(mesh);
  if (PERF && mesh.complete) nodesDone(Promise.resolve(), mesh, applied);
}

/** colorSpot gives the URL location ring the band color of the node that sits on it. */
function colorSpot(mesh) {
  const spot = document.querySelector(".url-spot");
  if (!spot || !mesh) return;
  const lon = Number(spot.dataset.lon), lat = Number(spot.dataset.lat);
  let best = null, bestD = 1e-6;
  for (const f of mesh.features.nodes) {
    const [x, y] = f.geometry.coordinates;
    const d = (x - lon) ** 2 + (y - lat) ** 2;
    if (d <= bestD) {
      best = f;
      bestD = d;
    }
  }
  const color = best && BANDS[best.properties.band]?.color;
  if (color) spot.style.setProperty("--spot-color", color);
}

/** nodesDone notes, for benchmarks, the node count the map's worker holds once an update lands. */
function nodesDone(update, mesh, applied) {
  if (!PERF) return;
  Promise.resolve(update).then(() => {
    if (!applied.landed || applied.landed.nodeCount <= mesh.nodeCount) applied.landed = { nodeCount: mesh.nodeCount, complete: mesh.complete };
    applied.repaint?.();
  });
}

const NO_FADE = { duration: 0, delay: 0 };
const HIDDEN = {
  line: { "line-opacity": 0, "line-opacity-transition": NO_FADE },
  icon: { "icon-opacity": 0, "icon-opacity-transition": NO_FADE },
};

/** ensureLayers adds the mesh images, sources and layers when the style lacks them, as after a theme switch. */
function ensureLayers(m, v, applied) {
  if (!v.images || !v.mesh) return;
  for (const [id, img] of Object.entries(v.images)) {
    if (!m.hasImage(id)) m.addImage(id, img.data, { pixelRatio: img.pixelRatio });
  }
  if (m.getSource(SRC_LINKS)) return;
  m.addSource(SRC_LINKS, { type: "geojson", data: collection(v.mesh.features.links) });
  m.addSource(SRC_ARROWS, { type: "geojson", data: collection(v.mesh.features.arrows) });
  m.addSource(SRC_NODES, { type: "geojson", data: collection(v.mesh.features.nodes) });
  applied.mesh = v.mesh;
  nodesDone(Promise.resolve(), v.mesh, applied);
  for (const t of LINK_TYPES) {
    m.addLayer({
      id: linkLayerId(t),
      type: "line",
      source: SRC_LINKS,
      filter: linkFilter(t, v.selected),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...HIDDEN.line, "line-color": lineColor(t.color, v.metric, v.direction), "line-width": t.width, ...(t.dash ? { "line-dasharray": t.dash } : {}) },
    });
  }
  const icon = { "icon-allow-overlap": true, "icon-ignore-placement": true };
  m.addLayer(withFilter({
    id: ARROW_LAYER,
    type: "symbol",
    source: SRC_ARROWS,
    layout: { ...icon, "icon-image": "arrow", "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map" },
    paint: HIDDEN.icon,
  }, bandFilter(v.selected)));
  m.addLayer(withFilter({
    id: NODE_LAYER,
    type: "symbol",
    source: SRC_NODES,
    layout: { ...icon, "icon-image": ["concat", "node-", ["get", "band"]] },
    paint: HIDDEN.icon,
  }, bandFilter(v.selected)));
  // Links and icons come from separate sources that finish at different times, so all of them stay transparent
  // until the map is idle and then appear in the same frame.
  m.once("idle", () => {
    colorSpot(v.mesh);
    for (const t of LINK_TYPES) if (m.getLayer(linkLayerId(t))) m.setPaintProperty(linkLayerId(t), "line-opacity", 1);
    for (const id of [ARROW_LAYER, NODE_LAYER]) if (m.getLayer(id)) m.setPaintProperty(id, "icon-opacity", 1);
  });
}

function MapControls({ metric, direction, setMetric, setDirection, modeLabel, cycleMode, open, setOpen }) {
  if (!open) {
    return (
      <div className="map-controls collapsed">
        <button type="button" className="panel-toggle" onClick={() => setOpen(true)} aria-expanded="false">Links</button>
      </div>
    );
  }
  return (
    <div className="map-controls">
      <button type="button" className="panel-toggle panel-close" onClick={() => setOpen(false)} aria-expanded="true" title="Hide">Hide</button>
      <div style={{ marginBottom: "5px" }}>
        <label style={{ marginRight: "5px" }}>Metric:</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {Object.keys(METRICS).map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}
        </select>
      </div>
      {metric !== "default" && (
        <div>
          <label style={{ marginRight: "5px" }}>Direction:</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="forward">Forward</option>
            <option value="reverse">Reverse</option>
          </select>
        </div>
      )}
      {metric !== "default" && (
        <div style={{ marginTop: "5px", fontSize: "0.8em" }}>
          <span>Low</span>
          <div className="metric-ramp" style={{ background: METRICS[metric].reverse ? "linear-gradient(to right, green, yellow, red)" : "linear-gradient(to right, red, yellow, green)" }} />
          <span>High</span>
        </div>
      )}
      <button type="button" className="theme-toggle" onClick={cycleMode} title="Switch between the system, light and dark map">
        Theme: {modeLabel}
      </button>
    </div>
  );
}

MapControls.propTypes = {
  metric: PropTypes.string.isRequired,
  direction: PropTypes.string.isRequired,
  setMetric: PropTypes.func.isRequired,
  setDirection: PropTypes.func.isRequired,
  modeLabel: PropTypes.string.isRequired,
  cycleMode: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  setOpen: PropTypes.func.isRequired,
};

/** autoPan moves the map so an open popup fits in view, as Leaflet popups did. */
function autoPan(m, popup) {
  const el = popup.getElement();
  if (!el) return;
  const box = el.getBoundingClientRect();
  const view = m.getContainer().getBoundingClientRect();
  const over = (lo, hi, vlo, vhi) => {
    if (lo < vlo + PAN_PADDING) return lo - (vlo + PAN_PADDING);
    if (hi > vhi - PAN_PADDING) return Math.min(hi - (vhi - PAN_PADDING), lo - (vlo + PAN_PADDING));
    return 0;
  };
  const dx = over(box.left, box.right, view.left, view.right);
  const dy = over(box.top, box.bottom, view.top, view.bottom);
  if (dx || dy) m.panBy([dx, dy], { duration: 250 });
}

export default function MeshMap({ boot, appConfig, mesh, selected, compact, panelOpen, setPanelOpen }) {
  const { isDark, modeLabel, cycleMode } = useColorMode();
  const el = useRef(null);
  const wrap = useRef(null);
  const [map, setMap] = useState(null);
  const [failure, setFailure] = useState("");
  const [note, setNote] = useState("");
  const [metric, setMetric] = useState("default");
  const [direction, setDirection] = useState("forward");
  const [popup, setPopup] = useState(null);
  const [popupBox] = useState(() => document.createElement("div"));
  const view = useRef({});
  const applied = useRef({ mesh: null, dark: null });
  const basemap = useRef(null);
  const popupRef = useRef(null);
  const opening = useRef(null);

  useEffect(() => {
    view.current = { ...view.current, mesh, selected, metric, direction, isDark, compact };
  });

  // The map was started before React; move its container into this component's place before the first paint.
  useLayoutEffect(() => {
    const container = boot.container;
    if (wrap.current && container.parentElement !== wrap.current) {
      const old = container.parentElement;
      wrap.current.prepend(container);
      if (old && old.id === "boot-wrap") old.remove();
    }
    el.current = container;
  }, [boot]);

  useEffect(() => {
    let cancelled = false;
    let detach = null;
    boot.map.then(
      ({ maplibregl, map: m, basemap: picked, changed, dark }) => {
        if (cancelled) return;
        const offs = [];
        const on = (type, layerOrFn, fn) => {
          if (fn) {
            m.on(type, layerOrFn, fn);
            offs.push(() => m.off(type, layerOrFn, fn));
          } else {
            m.on(type, layerOrFn);
            offs.push(() => m.off(type, layerOrFn));
          }
        };
        basemap.current = picked;
        applied.current.dark = dark;
        if (picked.kind === "none") setNote(`The basemap could not load: ${picked.reason}`);
        const nav = new maplibregl.NavigationControl({ showCompass: false });
        m.addControl(nav, "top-left");
        import("../lib/map/style").then(({ circleImage }) => {
          if (cancelled) return;
          m.setMissingStyleImageResolver((id) => {
            if (id === "circle-11" && !m.hasImage(id)) m.addImage(id, circleImage(view.current.isDark ? "#c9cbd1" : "#5a5f68"));
          });
        });
        const p = new maplibregl.Popup({ closeOnClick: false, maxWidth: "380px", focusAfterOpen: false });
        p.setDOMContent(popupBox);
        p.on("close", () => {
          opening.current = null;
          setPopup(null);
        });
        popupRef.current = p;
        // The mesh layers go in only once the basemap of the first view is fully drawn, so no node ever shows on a half-drawn map.
        let loaded = false;
        const layersReady = () => loaded && ensureLayers(m, view.current, applied.current);
        meshImages().then((images) => {
          if (cancelled) return;
          view.current.images = images;
          layersReady();
        });
        on("styledata", layersReady);
        on("click", (e) => {
          if (view.current.compact) return;
          const pt = e.point;
          const nodes = m.getLayer(NODE_LAYER) ? m.queryRenderedFeatures(pt, { layers: [NODE_LAYER] }) : [];
          if (nodes.length) {
            openNodeRef.current(nodes[0].properties.name);
            return;
          }
          const layers = LINK_LAYERS.filter((id) => m.getLayer(id));
          const box = [[pt.x - LINK_HIT_PX, pt.y - LINK_HIT_PX], [pt.x + LINK_HIT_PX, pt.y + LINK_HIT_PX]];
          const links = layers.length ? m.queryRenderedFeatures(box, { layers }) : [];
          if (!links.length) {
            opening.current = null;
            setPopup(null);
            return;
          }
          const lngLat = [e.lngLat.lng, e.lngLat.lat];
          opening.current = null;
          view.current.mesh.getLink(links[0].properties.id).then((conn) => setPopup(conn ? { kind: "link", conn, lngLat } : null), () => setPopup(null));
        });
        const pointer = () => {
          if (!view.current.compact) m.getCanvas().style.cursor = "pointer";
        };
        const plain = () => {
          m.getCanvas().style.cursor = "";
        };
        on("mouseenter", [NODE_LAYER, ...LINK_LAYERS], pointer);
        on("mouseleave", [NODE_LAYER, ...LINK_LAYERS], plain);
        if (PERF) {
          // Records every node count the map drew, for tests and benchmarks.
          let lastDrawn = "";
          window.__meshDrawn = [];
          on("render", () => {
            const a = applied.current.landed;
            if (!a || !a.nodeCount) return;
            const now = `${a.nodeCount}/${a.complete}`;
            if (now === lastDrawn) return;
            if (!lastDrawn) mark("first-node-drawn");
            lastDrawn = now;
            window.__meshDrawn.push([Math.round(performance.now()), a.nodeCount]);
            if (a.complete) mark("nodes-drawn");
            if (el.current) el.current.dataset.drawn = String(a.nodeCount);
          });
        }
        changed.then(async (next) => {
          if (!next || cancelled) return;
          basemap.current = next;
          const nextStyle = await mapStyle(next, view.current.isDark);
          if (!cancelled) m.setStyle(nextStyle);
        });
        applied.current.repaint = () => m.triggerRepaint();
        const basemapDrawn = () => {
          if (cancelled) return;
          loaded = true;
          el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          layersReady();
          setMap(m);
        };
        boot.complete.then(basemapDrawn);
        detach = () => {
          offs.forEach((off) => off());
          m.removeControl(nav);
          p.remove();
        };
      },
      (err) => {
        console.error(err);
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
      detach?.();
      popupRef.current = null;
      setMap(null);
    };
  }, [boot, popupBox]);

  useEffect(() => {
    if (map) applyMesh(map, mesh, applied.current);
  }, [map, mesh]);

  // The map's container is not rendered by React, so its state for tests goes on it here.
  useEffect(() => {
    const c = el.current;
    if (!c) return;
    if (map) c.dataset.ready = "true";
    else delete c.dataset.ready;
    if (PERF && map && mesh.complete) c.dataset.nodes = String(mesh.nodeCount);
    else delete c.dataset.nodes;
  }, [map, mesh]);

  useEffect(() => {
    if (!map || !map.getLayer(NODE_LAYER)) return;
    map.setFilter(NODE_LAYER, bandFilter(selected));
    map.setFilter(ARROW_LAYER, bandFilter(selected));
    LINK_TYPES.forEach((t) => map.setFilter(linkLayerId(t), linkFilter(t, selected)));
  }, [map, selected]);

  useEffect(() => {
    if (!map || !map.getLayer(NODE_LAYER)) return;
    LINK_TYPES.forEach((t) => map.setPaintProperty(linkLayerId(t), "line-color", lineColor(t.color, metric, direction)));
  }, [map, metric, direction]);

  useEffect(() => {
    if (!map || !basemap.current || applied.current.dark === isDark) return undefined;
    let stale = false;
    applied.current.dark = isDark;
    mapStyle(basemap.current, isDark).then((style) => {
      if (!stale) map.setStyle(style);
    });
    return () => {
      stale = true;
    };
  }, [map, isDark]);

  const shown = compact ? null : popup;
  const node = shown && shown.kind === "node" ? shown.model.node : null;
  const nodeAt = node ? mesh.coords[shown.name] || null : null;
  const popupAt = shown && shown.kind === "link" ? shown.lngLat : nodeAt;

  useEffect(() => {
    const p = popupRef.current;
    if (!map || !p) return undefined;
    if (!popupAt) {
      p.remove();
      return undefined;
    }
    p.setMaxWidth(shown.kind === "link" ? "500px" : "380px");
    p.setLngLat(popupAt);
    if (!p.isOpen()) p.addTo(map);
    const frame = requestAnimationFrame(() => autoPan(map, p));
    return () => cancelAnimationFrame(frame);
  }, [map, shown, popupAt?.[0], popupAt?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNode = useCallback((name) => {
    opening.current = name;
    const show = (model) => {
      if (model && opening.current === name) setPopup({ kind: "node", name, model });
    };
    view.current.mesh.getNode(name, show).then(show, () => undefined);
  }, []);
  const openNodeRef = useRef(openNode);

  let content = null;
  if (node && nodeAt) {
    content = <NodePopup node={node} byName={shown.model.byName} active={appConfig?.active} openNode={openNode} />;
  } else if (shown && shown.kind === "link") {
    content = <LinkPopup conn={shown.conn} openNode={openNode} />;
  }

  return (
    <div ref={wrap} className={compact ? "map-wrap compact" : "map-wrap"}>
      {!compact && (
        <MapControls metric={metric} direction={direction} setMetric={setMetric} setDirection={setDirection} modeLabel={modeLabel} cycleMode={cycleMode} open={panelOpen} setOpen={setPanelOpen} />
      )}
      {(failure || note) && !compact && <p className="map-failure">{failure ? `The map could not load: ${failure}` : note}</p>}
      {createPortal(content, popupBox)}
    </div>
  );
}

MeshMap.propTypes = {
  boot: PropTypes.object.isRequired,
  appConfig: PropTypes.object,
  mesh: PropTypes.object.isRequired,
  selected: PropTypes.string,
  compact: PropTypes.bool,
  panelOpen: PropTypes.bool,
  setPanelOpen: PropTypes.func,
};
