import { sql } from "@vercel/postgres";
import type { Error } from "~/db/schema";

export default async function getErrors() {
  const errors = await sql`SELECT * FROM Errors ;`;
  return errors.rows as Error[];
}
