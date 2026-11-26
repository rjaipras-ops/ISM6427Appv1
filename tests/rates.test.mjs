import { test } from "node:test";
import assert from "node:assert/strict";
import { latestFromCsv } from "../netlify/lib/rates.mjs";

test("FRED CSV: newest valid weekly value; skips '.' (missing) rows", () => {
  const csv = "observation_date,MORTGAGE30US\n2026-11-12,7.11\n2026-11-19,7.28\n2026-11-25,7.21\n";
  assert.deepEqual(latestFromCsv(csv), { date: "2026-11-25", value: 7.21 });
  assert.deepEqual(latestFromCsv("observation_date,MORTGAGE30US\n2026-11-19,7.28\n2026-11-25,.\n"), { date: "2026-11-19", value: 7.28 });
  assert.equal(latestFromCsv("<html>error</html>"), null);
});
