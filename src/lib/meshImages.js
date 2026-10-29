import meshIconSvg from "../img/mesh_icon.svg?raw";
import arrowUrl from "../img/mesh_arrow_75px_gray.png";
import { BANDS } from "./meshData";

/** ICON_PX is the on-screen size of a node icon and its azimuth arrow, as the older map drew them. */
export const ICON_PX = 25;

const RATIO = 3;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 64)}`));
    img.src = src;
  });

const draw = (paint) => {
  const size = ICON_PX * RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  paint(g, size);
  return { data: g.getImageData(0, 0, size, size), pixelRatio: RATIO };
};

let images = null;

/**
 * meshImages draws the map icons once per page: one node icon per band, the mesh glyph on a disc of the band's
 * color, and the azimuth arrow. The SVG gets a size first, since some browsers will not draw one without it.
 */
export function meshImages() {
  if (!images) {
    const svg = meshIconSvg.replace("<svg ", '<svg width="512" height="512" ');
    images = Promise.all([loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), loadImage(arrowUrl)]).then(([icon, arrow]) => {
      const out = {};
      for (const [band, { color }] of Object.entries(BANDS)) {
        out[`node-${band}`] = draw((g, size) => {
          g.fillStyle = color;
          g.beginPath();
          g.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
          g.fill();
          g.drawImage(icon, 0, 0, size, size);
        });
      }
      out.arrow = draw((g, size) => g.drawImage(arrow, 0, 0, size, size));
      return out;
    });
    images.catch(() => {
      images = null;
    });
  }
  return images;
}
