// Reads IDX settings from environment variables (.env locally, Netlify
// environment variables in production). Never import this from browser code.

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);

export function idxConfig() {
  const token = (process.env.SPARK_API_BEARER_TOKEN || "").trim();
  const baseUrl = (process.env.SPARK_API_BASE_URL || "https://replication.sparkapi.com/Reso/OData").replace(/\/+$/, "");
  return {
    token,
    mock: !token,
    // Sample (test-mode) listings are for local development only. On the public site they
    // stay off until the real BeachesMLS feed is live (set IDX_SAMPLE_DATA=true to show them).
    sampleData: process.env.IDX_SAMPLE_DATA === "true",
    baseUrl,
    // "reso" for the RESO Web API (…/Reso/OData), "spark" for the Spark REST API (…/v1).
    flavor: /\/reso\/odata$/i.test(baseUrl) ? "reso" : "spark",
    userAgent: process.env.SPARK_USER_AGENT || "BeachesMLS_IDX_Client/1.0",
    intervalMinutes: num(process.env.IDX_SYNC_INTERVAL_MINUTES, 15),
    syncSecret: (process.env.IDX_SYNC_SECRET || "").trim(),
    // County names exactly as the MLS spells them in CountyOrParish.
    counties: (process.env.IDX_COUNTIES || "Broward,Palm Beach,St. Lucie").split(",").map((s) => s.trim()).filter(Boolean),
    // RESO PropertyType values to include.
    propertyTypes: (process.env.IDX_PROPERTY_TYPES || "Residential").split(",").map((s) => s.trim()).filter(Boolean),
    pageSize: num(process.env.IDX_PAGE_SIZE, 200),
    // Each run stops after this long and resumes next run (scheduled functions are cut off at 30 s).
    budgetMs: num(process.env.IDX_SYNC_BUDGET_MS, 22000),
    // Full check for listings that disappeared from the feed (deleted / opted out).
    reconcileHours: num(process.env.IDX_RECONCILE_HOURS, 24),
  };
}

export const ACTIVE = "Active";
