import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { SupportedStudioLocale } from '@codaco/studio-contract/locales';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

// The account namespace acts on the caller's own user row: requireUser only,
// no tenant. Deliberately NOT an audited command (2026-09-04 localization
// design §5.2, decision 7): the audit log is study/team-scoped by design, and
// a personal presentation preference has no tenant and no research-data
// significance — so there is no `TeamAccess` to open a tenant scope with, and
// the caller opens an untenanted one.

const { user } = AUTH_TABLES;

/**
 * Stores (or, with null, clears) the caller's UI-language preference. The
 * contract has already narrowed a non-null tag to the supported registry.
 * Returns the stored value, or null when the user row no longer exists.
 *
 * `.returning()` is what carries the answer: the stored value is read back off
 * the write rather than assumed from the input, and an empty result is the one
 * way this reports a user row that is gone.
 */
export const updateUserLocale: (input: {
  userId: string;
  locale: SupportedStudioLocale | null;
}) => Effect.Effect<
  { locale: string | null } | null,
  SqlError.SqlError,
  Transaction
> = Effect.fn('account.updateUserLocale')(function* (input: {
  userId: string;
  locale: SupportedStudioLocale | null;
}) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .update(user)
    .set({ locale: input.locale, updatedAt: sql`now()` })
    .where(eq(user.id, input.userId))
    .returning({ locale: user.locale });
  return rows[0] ?? null;
}, sqlErrorsOnly);
