// Loads .env (if present) into process.env for local scripts.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
// Local development shows the sample listings unless .env says otherwise.
process.env.IDX_SAMPLE_DATA ??= "true";
