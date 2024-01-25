import dotenv from "dotenv";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");
dotenv.config({ path: envPath });
