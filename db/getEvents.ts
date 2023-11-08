import { sql } from "@vercel/postgres";
import type { Event } from "@/db/types";

export default async function getEvents() {
  const events = await sql`SELECT * FROM Events ;`;
  return events.rows as Event[];
}
