import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Try project root .env first (works for both tsx and compiled builds)
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, "../../../../.env") });
