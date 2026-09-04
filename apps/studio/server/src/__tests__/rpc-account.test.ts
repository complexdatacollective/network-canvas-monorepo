// The account namespace: personal, not team-scoped — requireUser only, no
// tenant, and deliberately no audit row (2026-09-04 localization design §5.2,
// decision 7). Runs against the real better-auth service so the whole loop
// closes: account.updateLocale writes user.locale through the plain pool, and
// the next session lookup carries the stored value back out through `me`.
import { safe } from '@orpc/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUPPORTED_STUDIO_LOCALES } from '@codaco/studio-rpc';

import type { createApp } from '../app.ts';
import { readEnv } from '../env.ts';
import { signInWithMagicLink } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const env = readEnv();
const db = await reachableDb();

describe.skipIf(!db)('account.updateLocale', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let app: ReturnType<typeof createApp>;
  let cookie: string;
  let userId: string;
  let client: ReturnType<typeof createRpcClient>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    ({ app, cookie } = await signInWithMagicLink(env, scratch.app, 'locale'));
    client = createRpcClient(app, { cookie });
    userId = (await client.me()).userId;
  });
  afterAll(async () => {
    await scratch.dispose();
  });

  const storedLocale = async (): Promise<string | null> => {
    const row = await scratch.pool.query<{ locale: string | null }>(
      'select locale from "user" where id = $1',
      [userId],
    );
    expect(row.rowCount).toBe(1);
    return row.rows[0]!.locale;
  };

  it('stores every supported tag and hands it back through me', async () => {
    // A fresh sign-up starts with no preference.
    expect((await client.me()).locale).toBeNull();

    // Two tags today ('en', 'en-GB'); a registry change must revisit this
    // suite rather than slide through it.
    expect(SUPPORTED_STUDIO_LOCALES).toEqual(['en', 'en-GB']);
    for (const locale of SUPPORTED_STUDIO_LOCALES) {
      expect(await client.account.updateLocale({ locale })).toEqual({
        locale,
      });
      // The row itself, not just the echo …
      expect(await storedLocale()).toBe(locale);
      // … and the value the client's LocaleSync will actually watch.
      expect((await client.me()).locale).toBe(locale);
    }
  });

  it('clears the preference with null', async () => {
    await client.account.updateLocale({ locale: 'en-GB' });
    expect(await client.account.updateLocale({ locale: null })).toEqual({
      locale: null,
    });
    expect(await storedLocale()).toBeNull();
    expect((await client.me()).locale).toBeNull();
  });

  it('refuses an unknown tag as a validation error, storing nothing', async () => {
    await client.account.updateLocale({ locale: 'en' });
    // Unknown tags are a validation error, never a silent store (§5.2).
    const rejected = await safe(client.account.updateLocale({ locale: 'fr' }));
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a malformed tag the same way it refuses an unknown one', async () => {
    // Canonicalisation must not turn "not a tag" into a different failure
    // mode: both are BAD_REQUEST, and neither writes.
    await client.account.updateLocale({ locale: 'en' });
    const rejected = await safe(
      client.account.updateLocale({ locale: 'not a tag' }),
    );
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedLocale()).toBe('en');
  });

  it('accepts a supported tag spelled with different case, and stores it canonically', async () => {
    // BCP 47 tags are case-insensitive, so `EN-gb` names the locale `en-GB`.
    // Refusing it would make acceptance depend on how the registry happens to
    // be spelled rather than on which locale the caller meant, and the row
    // must end up holding the canonical form either way — `me` hands that
    // value straight to the client's registry lookup.
    await client.account.updateLocale({ locale: null });
    expect(await client.account.updateLocale({ locale: 'EN-gb' })).toEqual({
      locale: 'en-GB',
    });
    expect(await storedLocale()).toBe('en-GB');
  });

  it('requires a signed-in user', async () => {
    const { error } = await safe(
      createRpcClient(app).account.updateLocale({ locale: 'en' }),
    );
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('cannot be written through better-auth’s own update endpoint', async () => {
    // input: false on the additionalField declaration is what keeps
    // update-user from accepting the field; dropping it must fail here.
    if (!env.auth) throw new Error('dev env must configure auth');
    await client.account.updateLocale({ locale: 'en' });
    const response = await app.request('/api/auth/update-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth.baseUrl,
        cookie,
      },
      body: JSON.stringify({ locale: 'en-GB' }),
    });
    // Whether better-auth ignores the stripped field or refuses the empty
    // update, the stored preference must be untouched.
    expect(response.status).toBeLessThan(500);
    expect(await storedLocale()).toBe('en');
  });

  it('writes no audit row: a personal preference has no tenant', async () => {
    await client.account.updateLocale({ locale: 'en-GB' });
    const events = await scratch.pool.query('select id from audit_events');
    expect(events.rows).toEqual([]);
  });
});
