// The account namespace: personal, not team-scoped — requireUser only, no
// tenant, and deliberately no audit row (2026-09-04 localization design §5.2,
// decision 7). Runs against the real better-auth service so the whole loop
// closes: account.updateLocale writes user.locale through the plain pool, and
// the next session lookup carries the stored value back out through `me`.
import { safe } from '@orpc/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SUPPORTED_STUDIO_LOCALES,
  type SupportedStudioLocale,
} from '@codaco/studio-rpc';

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
    // The contract type refuses this at compile time; the server must refuse
    // it at runtime too — unknown tags are a validation error, never a
    // silent store (§5.2). The cast exists precisely to defeat that
    // narrowing, which is the point of the schema.
    const rejected = await safe(
      client.account.updateLocale({
        locale: 'fr' as unknown as SupportedStudioLocale,
      }),
    );
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a malformed tag the same way it refuses an unknown one', async () => {
    // "Not a tag at all" and "a tag we do not offer" must fail identically:
    // one BAD_REQUEST, no write. Same cast, same reason.
    await client.account.updateLocale({ locale: 'en' });
    const rejected = await safe(
      client.account.updateLocale({
        locale: 'not a tag' as unknown as SupportedStudioLocale,
      }),
    );
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a supported tag spelled with different case', async () => {
    // BCP 47 tags are case-insensitive, so `EN-gb` does name `en-GB` — and
    // this endpoint still refuses it, deliberately. Accepting case variants
    // would mean widening the contract's input from the supported-locale
    // union to `string`, and the compile-time narrowing is worth more than a
    // spelling the only caller — the typed client, sending tags from its own
    // registry — cannot produce. Leniency belongs where tags are actually
    // uncontrolled: `resolveAppLocale` canonicalises what the browser asks
    // for, and canonicalises the stored value on the way back out.
    await client.account.updateLocale({ locale: 'en' });
    const rejected = await safe(
      client.account.updateLocale({
        locale: 'EN-gb' as unknown as SupportedStudioLocale,
      }),
    );
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedLocale()).toBe('en');
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
