// GET /api/idx/sync-status — when the feed last synced, how many listings are active.
import { syncStatus } from "../lib/sync.mjs";
import { envDiagnostics } from "../lib/config.mjs";

export default async () => {
  const status = await syncStatus();
  // While the feed isn't connected, report which feed-related variable NAMES the function can see
  // (never their values) so a misnamed or unscoped Netlify variable is easy to spot.
  if (status.mode === "pending") status.setup = envDiagnostics();
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/idx/sync-status" };
