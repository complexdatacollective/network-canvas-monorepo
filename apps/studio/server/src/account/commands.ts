import type pg from 'pg';

import type { SupportedStudioLocale } from '@codaco/studio-rpc';

// The account namespace acts on the caller's own user row: requireUser only,
// no tenant. Deliberately NOT an audited command (2026-09-04 localization
// design §5.2, decision 7): the audit log is study/team-scoped by design, and
// a personal presentation preference has no tenant and no research-data
// significance. Writes go through the plain pool — the same plane as
// team.acceptInvitation.

/**
 * Stores (or, with null, clears) the caller's UI-language preference. The
 * contract has already narrowed a non-null tag to the supported registry.
 * Returns the stored value, or null when the user row no longer exists.
 */
export async function updateUserLocale(
  pool: pg.Pool,
  input: { userId: string; locale: SupportedStudioLocale | null },
): Promise<{ locale: string | null } | null> {
  const result = await pool.query<{ locale: string | null }>(
    `UPDATE "user" SET locale = $2, "updatedAt" = now()
     WHERE id = $1
     RETURNING locale`,
    [input.userId, input.locale],
  );
  const row = result.rows[0];
  return row ? { locale: row.locale } : null;
}
