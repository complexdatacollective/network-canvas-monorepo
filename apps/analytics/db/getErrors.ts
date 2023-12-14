import { sql } from "@vercel/postgres";
import type { Error } from "~/db/schema";

export default async function getErrors() {
  const errors = await sql`SELECT * FROM Errors ;`;

  // sort by timestamp to display errros in order of most recent first
  errors.rows.sort((a, b) => {
    return b.timestamp - a.timestamp;
  });
  return errors.rows as Error[];
}
