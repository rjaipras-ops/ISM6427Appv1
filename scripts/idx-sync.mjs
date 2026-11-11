// Runs the IDX sync from your computer until the current phase finishes.
// Handy for the first full sync (which otherwise spans several 5-minute scheduled runs).
//
//   npm run idx:sync            → syncs into .idx-cache/ (what `npm run dev` serves)
//   npm run idx:sync -- --force → run even if the interval hasn't passed
//
// To write into your live Netlify site's storage instead, also set NETLIFY_SITE_ID and
// NETLIFY_AUTH_TOKEN (a personal access token) in .env.
import "./load-env.mjs";
import { runSync, syncStatus } from "../netlify/lib/sync.mjs";
import { storeKind } from "../netlify/lib/store.mjs";

const force = process.argv.includes("--force");
console.log(`Storage: ${await storeKind()}`);
let r = await runSync({ force, reason: "cli", budgetMs: 10 * 60 * 1000 });
while (r.ok && r.finished === false) r = await runSync({ force: true, reason: "cli", budgetMs: 10 * 60 * 1000 });
console.log(JSON.stringify(await syncStatus(), null, 2));
