// Real pictures of each property from aerial imagery, with the county parcel
// boundary drawn on top.
//
// Imagery: Esri World Imagery (ArcGIS Online basemap). Free to use with the
// attribution below; commercial use requires a (free) ArcGIS account.
// Parcel outlines: Florida Department of Revenue statewide parcel layer.

export const IMAGERY_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const IMAGERY_EXPORT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";
export const IMAGERY_ATTRIBUTION =
  "Imagery &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
export const IMAGERY_CREDIT_TEXT = "Imagery © Esri, Maxar, Earthstar Geographics";

// Web Mercator (EPSG:3857) projection, so the outline lines up with the image.
const R = 6378137;
const toMerc = ([lng, lat]) => [
  (R * lng * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

// Extent (in metres) around the parcel, padded and matched to the image's aspect ratio.
// Esri's export endpoint errors (HTTP 500) when asked for finer than about
// 0.2 m per pixel, so the extent is never narrower than that allows.
const MIN_METRES_PER_PX = 0.21;
function extentFor(l, aspect, pxWidth, minWidth = 90) {
  const rings = l.Parcel?.Shape;
  const pts = rings ? rings.flat().map(toMerc) : [toMerc([l.Longitude, l.Latitude])];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let w = Math.max(minWidth, pxWidth * MIN_METRES_PER_PX, (Math.max(...xs) - Math.min(...xs)) * 1.8);
  let h = Math.max((Math.max(...ys) - Math.min(...ys)) * 1.8, w / aspect);
  w = Math.max(w, h * aspect);
  h = w / aspect;
  return { xmin: cx - w / 2, xmax: cx + w / 2, ymin: cy - h / 2, ymax: cy + h / 2 };
}

// A static satellite photo (<img>) with an SVG parcel outline, for search cards.
export function satelliteThumb(l, { width = 480, height = 300, fallback = "" } = {}) {
  const e = extentFor(l, width / height, width);
  const src = `${IMAGERY_EXPORT}?${new URLSearchParams({
    bbox: [e.xmin, e.ymin, e.xmax, e.ymax].map((n) => n.toFixed(2)).join(","),
    bboxSR: "3857", imageSR: "3857", size: `${width},${height}`, format: "jpg", f: "image",
  })}`;
  const px = ([x, y]) => [((x - e.xmin) / (e.xmax - e.xmin)) * width, ((e.ymax - y) / (e.ymax - e.ymin)) * height];
  const outline = l.Parcel?.Shape
    ? `<svg class="sat-outline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${l.Parcel.Shape
        .map((ring) => `<polygon points="${ring.map((p) => px(toMerc(p)).map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`)
        .join("")}</svg>`
    : `<span class="sat-pin" aria-hidden="true"></span>`;
  return `<div class="sat">
    <div class="sat-fallback">${fallback}</div>
    <img src="${src}" alt="Satellite view of ${l.StreetAddress.replace(/"/g, "&quot;")}" loading="lazy" decoding="async"
      width="${width}" height="${height}" onerror="this.parentNode.classList.add('sat-failed')">
    ${outline}
    <span class="sat-credit">${IMAGERY_CREDIT_TEXT}</span>
  </div>`;
}

// Interactive Leaflet satellite map with the outline, for the listing page.
export function satelliteMap(el, l, { zoom = null, interactive = true } = {}) {
  const m = L.map(el, {
    zoomControl: interactive, scrollWheelZoom: false, dragging: interactive, touchZoom: interactive,
    doubleClickZoom: interactive, boxZoom: false, keyboard: interactive, attributionControl: true,
  });
  L.tileLayer(IMAGERY_TILES, { attribution: IMAGERY_ATTRIBUTION, maxZoom: 20, maxNativeZoom: 19 }).addTo(m);
  const shape = l.Parcel?.Shape;
  if (shape) {
    const poly = addParcelOutline(m, shape);
    if (zoom) m.setView(poly.getBounds().getCenter(), zoom);
    else m.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 20 });
  } else {
    m.setView([l.Latitude, l.Longitude], zoom || 19);
    L.circleMarker([l.Latitude, l.Longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#e8563f", fillOpacity: 1 }).addTo(m);
  }
  return m;
}

/** Draws a parcel outline (rings of [lng, lat]) on a Leaflet map; returns the polygon. */
export function addParcelOutline(m, rings) {
  return L.polygon(rings.map((ring) => ring.map(([lng, lat]) => [lat, lng])), {
    color: "#ffd84d", weight: 3, fillOpacity: 0.08, fillColor: "#ffd84d", interactive: false,
  }).addTo(m);
}
