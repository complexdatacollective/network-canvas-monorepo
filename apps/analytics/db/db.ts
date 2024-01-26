import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "./schema";
import { eventsTable } from "./schema";

// Use this object to send drizzle queries to your DB
export const db = drizzle(sql, { schema });

export type EventInsertType = typeof eventsTable.$inferInsert;
