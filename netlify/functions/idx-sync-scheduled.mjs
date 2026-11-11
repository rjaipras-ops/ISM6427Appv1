// Scheduled every 5 minutes. Runs a sync when IDX_SYNC_INTERVAL_MINUTES (default 15)
// has passed since the last one, or continues a sync that's still in progress
// (the first full sync spans several runs).
import { runSync } from "../lib/sync.mjs";

export default async () => {
  const r = await runSync({ reason: "scheduled" });
  if (r.skipped) console.log("[IDX] not due yet");
};

export const config = { schedule: "*/5 * * * *" };
