import { config as loadDotenvFile } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenvFile({ path: path.resolve(here, "../../../.env") });