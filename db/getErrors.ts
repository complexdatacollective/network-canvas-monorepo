import { sql } from "@vercel/postgres";
import type { ErrorPayload as Error } from "@/@codaco/analytics";

export default async function getErrors() {
  const errors = await sql`SELECT * FROM Errors ;`;
  return errors.rows as Error[];
}
