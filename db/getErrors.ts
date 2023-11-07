import { sql } from "@vercel/postgres";

export default async function getErrors() {
  const errors = await sql`SELECT * FROM Errors ;`;
  return errors.rows;
}
