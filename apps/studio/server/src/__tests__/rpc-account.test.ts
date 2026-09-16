// The account namespace: personal, not team-scoped — the caller's own budget
// only, no tenant, and deliberately no audit row (2026-09-04 localization
// design §5.2, decision 7). Runs against the real better-auth service so the
// whole loop closes: account.updateLocale writes user.locale through the plain
// pool, and the next session lookup carries the stored value back out
// through `me`.
import { Cause, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SUPPORTED_STUDIO_LOCALES,
  type SupportedStudioLocale,
} from '@codaco/studio-contract/locales';

import type { Studio } from '../app.ts';
import { readEnv } from '../env.ts';
import { signInWithMagicLink } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const env = readEnv();
const db = await reachableDb();

describe.skipIf(!db)('account.updateLocale', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let studio: Studio;
  let app: Studio['app'];
  let cookie: string;
  let userId: string;
  let client: RpcTestClient;
  let anonymousClient: RpcTestClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    ({ studio, app, cookie } = await signInWithMagicLink(
      env,
      scratch.app,
      'locale',
    ));
    client = await createRpcClient(studio, { cookie });
    anonymousClient = await createRpcClient(studio);
    userId = (await client.call(client.rpc('me', undefined))).userId;
  });
  afterAll(async () => {
    await client.dispose();
    await anonymousClient.dispose();
    await scratch.dispose();
  });

  const me = () => client.call(client.rpc('me', undefined));
  const updateLocale = (locale: SupportedStudioLocale | null) =>
    client.call(client.rpc('account.updateLocale', { locale }));

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
    expect((await me()).locale).toBeNull();

    // Two tags today ('en', 'en-GB'); a registry change must revisit this
    // suite rather than slide through it.
    expect(SUPPORTED_STUDIO_LOCALES).toEqual(['en', 'en-GB']);
    for (const locale of SUPPORTED_STUDIO_LOCALES) {
      expect(await updateLocale(locale)).toEqual({ locale });
      // The row itself, not just the echo …
      expect(await storedLocale()).toBe(locale);
      // … and the value the client's LocaleSync will actually watch.
      expect((await me()).locale).toBe(locale);
    }
  });

  it('clears the preference with null', async () => {
    await updateLocale('en-GB');
    expect(await updateLocale(null)).toEqual({ locale: null });
    expect(await storedLocale()).toBeNull();
    expect((await me()).locale).toBeNull();
  });

  it('refuses an unknown tag as a validation error, storing nothing', async () => {
    await updateLocale('en');
    // The contract type refuses this at compile time; the server must refuse
    // it at runtime too — unknown tags are a validation error, never a
    // silent store (§5.2). The cast exists precisely to defeat that
    // narrowing, which is the point of the schema.
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'fr' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected);
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a malformed tag the same way it refuses an unknown one', async () => {
    // "Not a tag at all" and "a tag we do not offer" must fail identically:
    // one payload rejection, no write. Same cast, same reason.
    await updateLocale('en');
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'not a tag' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected);
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
    await updateLocale('en');
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'EN-gb' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected);
    expect(await storedLocale()).toBe('en');
  });

  it('requires a signed-in user', async () => {
    await expectRpcFailure(
      anonymousClient.callExit(
        anonymousClient.rpc('account.updateLocale', { locale: 'en' }),
      ),
      'Unauthorized',
    );
  });

  it('cannot be written through better-auth’s own update endpoint', async () => {
    // input: false on the additionalField declaration is what keeps
    // update-user from accepting the field; dropping it must fail here.
    if (!env.auth) throw new Error('dev env must configure auth');
    await updateLocale('en');
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
    await updateLocale('en-GB');
    const events = await scratch.pool.query('select id from audit_events');
    expect(events.rows).toEqual([]);
  });
});

/**
 * A payload the contract's schema refuses never reaches a handler, so it is not
 * a declared error: the rpc server answers the decode failure itself and the
 * call dies rather than failing with one of the procedure's tags. What the
 * cases above assert is that the refusal happened before any write.
 */
function expectPayloadRejected(exit: Exit.Exit<unknown, unknown>): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.hasDies(exit.cause)).toBe(true);
  }
}
