import dotenv from "dotenv";
dotenv.config();

import { migrate } from "drizzle-orm/vercel-postgres/migrator";
import { db } from "~/lib/db";

export async function runMigration() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (error) {
    console.error("Error running migration:", error);
  }
}

runMigration();
