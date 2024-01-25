import "~/lib/config";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.POSTGRES_URL!,
  },
  verbose: true,
  strict: true,
});
