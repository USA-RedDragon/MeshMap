import meshIconSvg from "../img/mesh_icon.svg?raw";
import arrowUrl from "../img/mesh_arrow_75px_gray.png";
import { BANDS } from "./meshData";

/** ICON_PX is the on-screen size of a node icon and its azimuth arrow, as the older map drew them. */
export const ICON_PX = 25;

/** meshIconUrl returns the node icon as a data URL, with the badge in the given color. */
export function meshIconUrl(color, px = ICON_PX) {
  const svg = meshIconSvg.replace("currentColor", color).replace("<svg ", `<svg width="${px}" height="${px}" `);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 64)}`));
    img.src = src;
  });

let images = null;

/**
 * meshImages draws the map icons once per page at the screen's pixel density: one node icon per band and the
 * azimuth arrow. The SVG gets a size first, since some browsers will not draw one without it.
 */
export function meshImages() {
  if (!images) {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const size = Math.round(ICON_PX * ratio);
    const draw = (img) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext("2d");
      g.drawImage(img, 0, 0, size, size);
      return { data: g.getImageData(0, 0, size, size), pixelRatio: ratio };
    };
    const bands = Object.entries(BANDS);
    images = Promise.all([loadImage(arrowUrl), ...bands.map(([, { color }]) => loadImage(meshIconUrl(color, size)))]).then(([arrow, ...icons]) => {
      const out = { arrow: draw(arrow) };
      bands.forEach(([band], i) => {
        out[`node-${band}`] = draw(icons[i]);
      });
      return out;
    });
    images.catch(() => {
      images = null;
    });
  }
  return images;
}
