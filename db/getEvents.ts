import { sql } from "@vercel/postgres";

export default async function getEvents() {
  const events = await sql`SELECT * FROM Events ;`;
  return events.rows;
}
