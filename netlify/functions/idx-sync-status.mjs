// GET /api/idx/sync-status — when the feed last synced, how many listings are active.
import { syncStatus } from "../lib/sync.mjs";

export default async () => Response.json(await syncStatus(), { headers: { "Cache-Control": "no-store" } });

export const config = { path: "/api/idx/sync-status" };
