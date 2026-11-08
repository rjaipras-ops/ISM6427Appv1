// Generated illustrations used instead of listing photos.
// Listing photos are copyrighted by the listing agent/photographer and are only
// licensed for display through an MLS/IDX agreement — wire `Media` from the feed
// into `photoFor()` once you have one.

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SKIES = [["#cfe8f3", "#f4fafc"], ["#ffe3c7", "#fff7ee"], ["#d8e4ff", "#f3f6ff"], ["#d6efe4", "#f2fbf6"], ["#f6d9df", "#fdf3f5"]];
const WALLS = ["#f4efe6", "#e9eef2", "#f3e3d3", "#e4ece4", "#f1e8d9", "#dfe7ee", "#efe2e2", "#fbf5e9"];
const ROOFS = ["#5d6b78", "#8b5e3c", "#3f4d5a", "#a0614a", "#6a6f5b", "#2f3c46"];
const DOORS = ["#0b6e63", "#b4483a", "#2e4a6b", "#c08a2c", "#4b5a3c"];

export function houseSVG(listing, { variant = 0, label = "" } = {}) {
  const h = hash(listing.ListingId + ":" + variant);
  const pick = (arr, s) => arr[(h >>> s) % arr.length];
  const [sky1, sky2] = pick(SKIES, 1);
  const wall = pick(WALLS, 4);
  const roof = pick(ROOFS, 8);
  const door = pick(DOORS, 12);
  const type = listing.PropertyType;
  const pool = listing.demo?.PoolPrivateYN;
  const water = listing.demo?.WaterfrontYN;
  const two = (listing.demo?.StoriesTotal || 1) > 1;
  const palm = (h >>> 16) % 3 !== 0;

  let building;
  if (type === "Condo") {
    const floors = 6 + ((h >>> 3) % 6);
    const fh = 150 / floors;
    let wins = "";
    for (let f = 0; f < floors; f++) for (let c = 0; c < 5; c++)
      wins += `<rect x="${118 + c * 34}" y="${42 + f * fh + fh * .25}" width="22" height="${fh * .5}" rx="2" fill="${(f + c + h) % 7 ? "#9fc3d6" : "#fff4c9"}"/>`;
    building = `<rect x="104" y="36" width="192" height="164" rx="4" fill="${wall}"/>${wins}
      <rect x="104" y="30" width="192" height="10" rx="3" fill="${roof}"/>
      <rect x="182" y="176" width="36" height="24" fill="${door}"/>`;
  } else if (type === "Townhouse") {
    let units = "";
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 88;
      const w = WALLS[(h + i) % WALLS.length];
      units += `<rect x="${x}" y="88" width="88" height="112" fill="${w}" stroke="#00000010"/>
        <polygon points="${x - 4},90 ${x + 44},58 ${x + 92},90" fill="${roof}"/>
        <rect x="${x + 12}" y="102" width="24" height="26" rx="2" fill="#9fc3d6"/><rect x="${x + 52}" y="102" width="24" height="26" rx="2" fill="#9fc3d6"/>
        <rect x="${x + 12}" y="146" width="24" height="24" rx="2" fill="#9fc3d6"/><rect x="${x + 52}" y="150" width="22" height="50" rx="2" fill="${DOORS[(h + i) % DOORS.length]}"/>`;
    }
    building = units;
  } else if (type === "Mobile/Manufactured") {
    building = `<rect x="90" y="132" width="220" height="62" rx="6" fill="${wall}"/>
      <rect x="86" y="126" width="228" height="10" rx="3" fill="${roof}"/>
      <rect x="112" y="146" width="34" height="22" rx="2" fill="#9fc3d6"/><rect x="246" y="146" width="40" height="22" rx="2" fill="#9fc3d6"/>
      <rect x="180" y="146" width="24" height="48" fill="${door}"/><rect x="170" y="194" width="44" height="6" fill="#b9b2a5"/>`;
  } else {
    const top = two ? 70 : 108;
    const body = two
      ? `<rect x="110" y="${top}" width="180" height="${200 - top}" fill="${wall}"/>
         <rect x="128" y="${top + 18}" width="34" height="30" rx="2" fill="#9fc3d6"/><rect x="238" y="${top + 18}" width="34" height="30" rx="2" fill="#9fc3d6"/>
         <rect x="183" y="${top + 18}" width="34" height="30" rx="2" fill="#9fc3d6"/>`
      : `<rect x="96" y="${top}" width="208" height="${200 - top}" fill="${wall}"/>`;
    building = `${body}
      <polygon points="${two ? 96 : 82},${top + 2} 200,${top - 46} ${two ? 304 : 318},${top + 2}" fill="${roof}"/>
      <rect x="126" y="148" width="40" height="30" rx="2" fill="#9fc3d6"/><rect x="236" y="148" width="40" height="30" rx="2" fill="#9fc3d6"/>
      <rect x="186" y="146" width="28" height="54" rx="2" fill="${door}"/><circle cx="208" cy="174" r="2" fill="#fff"/>`;
  }

  const palmTree = palm ? `<g transform="translate(${(h >>> 5) % 2 ? 46 : 340},0)">
      <path d="M0 200 C 2 170, -2 140, 4 110" stroke="#8a6b47" stroke-width="5" fill="none"/>
      <g fill="#3f8f5a"><ellipse cx="-14" cy="108" rx="20" ry="6" transform="rotate(-20 -14 108)"/><ellipse cx="22" cy="106" rx="20" ry="6" transform="rotate(18 22 106)"/>
      <ellipse cx="4" cy="98" rx="6" ry="18"/><ellipse cx="-10" cy="118" rx="16" ry="5" transform="rotate(30 -10 118)"/><ellipse cx="18" cy="118" rx="16" ry="5" transform="rotate(-30 18 118)"/></g></g>` : "";

  const ground = water
    ? `<rect y="200" width="400" height="50" fill="#7fb8a2"/><rect y="222" width="400" height="28" fill="#5aa6c9"/><path d="M0 230 q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="#ffffff80" fill="none"/>`
    : `<rect y="200" width="400" height="50" fill="#8fc49b"/><rect x="180" y="200" width="40" height="50" fill="#d9d2c3"/>`;
  const poolEl = pool && !water ? `<rect x="268" y="214" width="78" height="22" rx="10" fill="#6cc5e3" stroke="#fff" stroke-width="3"/>` : "";

  return `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label || "Illustration of " + listing.StreetAddress}">
    <defs><linearGradient id="sky${h}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
    <rect width="400" height="250" fill="url(#sky${h})"/>
    <circle cx="${330 - ((h >>> 9) % 260)}" cy="44" r="18" fill="#fff" opacity=".7"/>
    ${ground}${building}${palmTree}${poolEl}
  </svg>`;
}

export function typeIcon(type) {
  const p = {
    "Single Family": '<path d="M4 13 14 5l10 8v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 24v-6h6v6" fill="none" stroke="currentColor" stroke-width="2"/>',
    Condo: '<rect x="6" y="3" width="16" height="22" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8h2M16 8h2M10 13h2M16 13h2M10 18h2M16 18h2" stroke="currentColor" stroke-width="2"/>',
    Townhouse: '<path d="M2 12 8 7l6 5 6-5 6 5v12H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 12v12" stroke="currentColor" stroke-width="2"/>',
    "Multi-Family": '<rect x="3" y="8" width="22" height="16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 8 14 3l11 5M14 8v16M8 13h2M18 13h2M8 18h2M18 18h2" fill="none" stroke="currentColor" stroke-width="2"/>',
    "Mobile/Manufactured": '<rect x="3" y="10" width="22" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="23" r="2" fill="currentColor"/><circle cx="19" cy="23" r="2" fill="currentColor"/>',
    Land: '<path d="M2 22 10 12l5 6 3-3 8 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  }[type] || "";
  return `<svg viewBox="0 0 28 28" aria-hidden="true">${p}</svg>`;
}
