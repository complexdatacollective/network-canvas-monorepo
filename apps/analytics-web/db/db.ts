import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { eventsTable } from "./schema";

config({ path: ".env" });

// Use this object to send drizzle queries to your DB
const sql = neon(process.env.POSTGRES_URL!);
export const db = drizzle({ client: sql, schema: { eventsTable } });

export type EventInsertType = typeof eventsTable.$inferInsert;

// Todo: derive a zod schema from the table schema and use it inside analytics package
