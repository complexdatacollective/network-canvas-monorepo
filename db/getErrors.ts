import { sql } from "@vercel/postgres";
import { Error } from "@/db/types";

export default async function getErrors() {
  const errors = await sql`SELECT * FROM Errors ;`;
  return errors.rows as Error[];
}
