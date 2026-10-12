import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { SupportedStudioLocale } from '@codaco/studio-contract/locales';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

const { user } = AUTH_TABLES;

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
