import { sql } from "@vercel/postgres";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eventsTable } from "./schema";

config({ path: ".env" });

// Use this object to send drizzle queries to your DB
export const db = drizzle(sql, { schema: { eventsTable } });

export type EventInsertType = typeof eventsTable.$inferInsert;

// Todo: derive a zod schema from the table schema and use it inside analytics package
