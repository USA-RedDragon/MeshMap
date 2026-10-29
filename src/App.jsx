import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import MeshMap from "./components/MeshMap";
import sysinfo from "./APIResources.json";
import axios from "axios";
import alertify from "alertifyjs";
import "alertifyjs/build/css/themes/default.min.css";
import "alertifyjs/build/css/alertify.min.css";
import Header from "./components/Header";
import { mark } from "./lib/marks";
import { toNode } from "./lib/meshData";
import { EMPTY_MESH, loadMesh, meshFromNodes } from "./lib/meshStore";
import { COMPACT_QUERY, NARROW_QUERY, useMediaQuery } from "./hooks/useMediaQuery";

/** DEFAULT_DATA_URL is the mesh data file, relative to the page, when appConfig.json names none. */
const DEFAULT_DATA_URL = "data/out.json";

/** dataUrlOf is the URL of the mesh data file, with a cache buster unless appConfig.json turns it off. */
function dataUrlOf(appConfig) {
  const url = appConfig.dataUrl || DEFAULT_DATA_URL;
  if (appConfig.dataCacheBuster === false) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now().toFixed(0)}`;
}

async function loadStored(appConfig, setData) {
  try {
    const meta = await loadMesh(dataUrlOf(appConfig), (mesh) => setData((d) => ({ ...d, mesh })));
    setData((d) => ({ ...d, nonMapped: meta.nonMapped, hostsScraped: meta.hostsScraped, lastUpdated: meta.date }));
    const date = new Date(meta.date);
    if (new Date() - date > 24 * 60 * 60 * 1000) {
      alertify.alert("Warning", "Node data was last updated on " + date.toLocaleString());
    }
  } catch (e) {
    alertify.alert(e.toString());
  }
}

async function crawl(appConfig, addNode) {
  const start = appConfig.mapSettings.mapCenter.node || "localnode";
  const nodes = await axios.get(`http://${start}.local.mesh:8080${sysinfo.resource}${sysinfo.params.hosts}`);
  const regex = new RegExp(appConfig.nodesFilter);
  const filtered = nodes.data.hosts.filter((h) => h.name.toUpperCase().trim().match(regex));
  filtered.forEach(async (host) => {
    try {
      const info = await axios.get(`http://${host.name}.local.mesh:8080${sysinfo.resource}?${sysinfo.params.link_info}&${sysinfo.params.lqm}`);
      if (info.status === 200 && info.data.lat && info.data.lon) {
        addNode(toNode({ ...info.data, mlat: info.data.lat, mlon: info.data.lon }));
      }
    } catch (e) {
      console.log("Unable to retrieve node details for " + host.name + ". Error: " + e.toString());
    }
  });
}

export default function App() {
  const [appConfig, setAppConfig] = useState(null);
  const [data, setData] = useState({ mesh: EMPTY_MESH, nonMapped: 0, hostsScraped: 0, lastUpdated: null });
  const [crawled, setCrawled] = useState([]);
  const [selected, setSelected] = useState("all");
  const compact = useMediaQuery(COMPACT_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const [legendOpen, setLegendOpenState] = useState(true);
  const [panelOpen, setPanelOpenState] = useState(() => !window.matchMedia(NARROW_QUERY).matches);

  const setLegendOpen = useCallback((open) => {
    setLegendOpenState(open);
    if (open && narrow) setPanelOpenState(false);
  }, [narrow]);
  const setPanelOpen = useCallback((open) => {
    setPanelOpenState(open);
    if (open && narrow) setLegendOpenState(false);
  }, [narrow]);

  const crawledMesh = useMemo(() => (crawled.length ? meshFromNodes(crawled) : null), [crawled]);
  const mesh = crawledMesh || data.mesh;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await axios.get("appConfig.json");
      if (cancelled) return;
      const config = res.data;
      mark("config");
      setAppConfig(config);
      document.title = `${config.contactInfo.callsign} - ${import.meta.env.VITE_APP_NAME} ${import.meta.env.VITE_APP_VERSION} by ${import.meta.env.VITE_APP_CREATOR}`;
      if (!config.offline) {
        try {
          await crawl(config, (node) => !cancelled && setCrawled((list) => [...list, node]));
          return;
        } catch (e) {
          console.log("Unable to retrieve nodes data from the mesh network, falling back to stored data. Error: " + e.toString());
        }
      }
      try {
        await loadStored(config, (d) => !cancelled && setData(d));
      } catch {
        alertify.alert("Unable to find your node, please verify if you are connected to the mesh.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {!compact && (
        <Header
          counts={mesh.counts}
          nonMapped={data.nonMapped}
          hostsScraped={data.hostsScraped}
          appConfig={appConfig}
          lastUpdated={data.lastUpdated}
          selectNodes={setSelected}
          selected={selected}
          open={legendOpen}
          setOpen={setLegendOpen}
        />
      )}
      <MeshMap appConfig={appConfig} mesh={mesh} selected={selected} compact={compact} panelOpen={panelOpen} setPanelOpen={setPanelOpen} />
    </div>
  );
}
