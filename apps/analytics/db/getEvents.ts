import { sql } from "@vercel/postgres";
import type { Event } from "~/db/schema";

export default async function getEvents() {
  const events = await sql`SELECT * FROM Events ;`;

  // sort by timestamp to display events in order of most recent first
  events.rows.sort((a, b) => {
    return b.timestamp - a.timestamp;
  });
  return events.rows as Event[];
}
