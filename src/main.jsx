import { startBoot } from "./lib/map/boot";

// The map starts first. The mesh data, React, the legend and the controls load once the first basemap tiles draw.
const boot = startBoot(document.getElementById("boot-map"));

const hint = document.getElementById("boot-hint");
boot.firstFrame.then(() => hint?.remove());
boot.map.catch(() => hint?.remove());

boot.firstFrame.then(() => {
  boot.stored = boot.config.then(
    (config) => (config.offline === false ? null : import("./lib/meshEarly.js").then((m) => m.storedMesh(config))),
    () => null,
  );
  import("./ui.jsx").then((ui) => ui.mount(boot));
});
