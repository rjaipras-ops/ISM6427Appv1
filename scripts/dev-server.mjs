// Local development server: serves the site and runs the same /api/idx/* functions
// Netlify runs, using .env and the .idx-cache/ folder. No Netlify account needed.
//   npm run dev   → http://localhost:8888
// (`netlify dev` from the Netlify CLI works too.)
import "./load-env.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import listings from "../netlify/functions/idx-listings.mjs";
import listing from "../netlify/functions/idx-listing.mjs";
import status from "../netlify/functions/idx-sync-status.mjs";
import sync from "../netlify/functions/idx-sync.mjs";
import parcel from "../netlify/functions/idx-parcel.mjs";
import propertyLookup from "../netlify/functions/property-lookup.mjs";
import scheduled from "../netlify/functions/idx-sync-scheduled.mjs";
import authConfig from "../netlify/functions/auth-config.mjs";
import authMe from "../netlify/functions/auth-me.mjs";
import authGoogle from "../netlify/functions/auth-google.mjs";
import authLogout from "../netlify/functions/auth-logout.mjs";
import authDev from "../netlify/functions/auth-dev.mjs";
import reviews from "../netlify/functions/reviews.mjs";
import idxSearch from "../netlify/functions/idx-search.mjs";
import propertyHistory from "../netlify/functions/property-history.mjs";
import reviewAction from "../netlify/functions/review-action.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8888);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
const BLOCKED = /^\/(netlify|scripts|node_modules|\.idx-cache|\.env|\.git)(\/|$)/;

const routes = [
  [/^\/api\/idx\/listings$/, listings],
  [/^\/api\/idx\/listing\/([\w-]+)$/, listing, (m) => ({ key: m[1] })],
  [/^\/api\/idx\/parcel\/([\w-]+)$/, parcel, (m) => ({ key: m[1] })],
  [/^\/api\/idx\/sync-status$/, status],
  [/^\/api\/idx\/search$/, idxSearch],
  [/^\/api\/idx\/sync$/, sync],
  [/^\/api\/property\/lookup$/, propertyLookup],
  [/^\/api\/property\/history$/, propertyHistory],
  [/^\/api\/auth\/config$/, authConfig],
  [/^\/api\/auth\/me$/, authMe],
  [/^\/api\/auth\/google$/, authGoogle],
  [/^\/api\/auth\/logout$/, authLogout],
  [/^\/api\/auth\/dev$/, authDev],
  [/^\/api\/reviews$/, reviews],
  [/^\/api\/reviews\/([\w-]+)\/(delete|helpful)$/, reviewAction, (m) => ({ id: m[1], action: m[2] })],
];

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    for (const [re, fn, params] of routes) {
      const m = url.pathname.match(re);
      if (!m) continue;
      const body = req.method === "POST" ? await new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); }) : undefined;
      const r = await fn(new Request(url, { method: req.method, headers: req.headers, body }), { params: params ? params(m) : {} });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (BLOCKED.test(url.pathname)) { res.writeHead(404).end("Not found"); return; }
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT") { res.writeHead(404).end("Not found"); return; }
    console.error(e);
    res.writeHead(500).end("Server error");
  }
}).listen(PORT, () => {
  console.log(`Toured dev server: http://localhost:${PORT}`);
  console.log(process.env.SPARK_API_BEARER_TOKEN ? "IDX: live mode (Spark token set)" : "IDX: MOCK MODE (no SPARK_API_BEARER_TOKEN)");
});

// Mimic the Netlify schedule locally: check every 5 minutes.
setInterval(() => scheduled().catch((e) => console.error("[IDX]", e.message)), 5 * 60 * 1000).unref();
