// Prints a short version string for the current DOR tax roll files of the checked counties.
// The daily job uses it as its cache key, so the files are downloaded again only when DOR posts new ones.
import { dorVersion } from "./sources/dor.mjs";

const year = Number(process.env.RECORDS_TAX_YEAR || 2026);
dorVersion(["Palm Beach", "Broward", "Miami-Dade"], year)
  .then((v) => console.log(v))
  .catch(() => console.log(`unknown-${new Date().toISOString().slice(0, 10)}`));
