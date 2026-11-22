// Loads the record-check configuration for a tax year.
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));

export function loadConfig(year = 2026) {
  const config = {
    rules: read("rules.json"),
    millage: read(`millage-${year}.json`),
    exemptions: read(`exemptions-${year}.json`),
    costOfSale: read(`cost-of-sale-${year}.json`),
  };
  for (const k of ["millage", "exemptions", "costOfSale"]) {
    if (config[k].taxYear !== year) throw new Error(`config ${k} is for ${config[k].taxYear}, expected ${year}`);
  }
  return config;
}
