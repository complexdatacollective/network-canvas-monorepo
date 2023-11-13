import { sql } from "@vercel/postgres";
import type { EventPayload as Event } from "@/@codaco/analytics";

export default async function getEvents() {
  const events = await sql`SELECT * FROM Events ;`;
  return events.rows as Event[];
}
