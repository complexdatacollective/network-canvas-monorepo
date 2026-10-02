import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SUPPORTED_STUDIO_LOCALES,
  type SupportedStudioLocale,
} from '@codaco/studio-contract/locales';

import type { Studio } from '../app.ts';
import { readEnv } from '../env.ts';
import { signInWithMagicLink } from './support/auth.ts';
import {
  openTestDatabase,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createRpcClient,
  expectPayloadRejected,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { composeStudio } from './support/serve.ts';

const env = readEnv();

describe.skipIf(!testDb)('account.updateLocale', () => {
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let cookie: string;
  let userId: string;
  let client: RpcTestClient;
  let anonymousClient: RpcTestClient;

  beforeAll(async () => {
    database = await openTestDatabase();
    ({ studio, cookie } = await signInWithMagicLink(
      env,
      'locale',
      database.services,
    ));
    client = await createRpcClient(studio, { cookie });
    anonymousClient = await createRpcClient(studio);
    userId = (await client.call(client.rpc('me', undefined))).userId;
  });
  afterAll(async () => {
    await client.dispose();
    await anonymousClient.dispose();
    await database.dispose();
  });

  const me = () => client.call(client.rpc('me', undefined));
  const updateLocale = (locale: SupportedStudioLocale | null) =>
    client.call(client.rpc('account.updateLocale', { locale }));

  const storedLocale = async (): Promise<string | null> => {
    const rows = await database.run(
      ownerRows<{ locale: string | null }>(
        'select locale from "user" where id = $1',
        [userId],
      ),
    );
    expect(rows).toHaveLength(1);
    return rows[0]!.locale;
  };

  it('stores every supported tag and hands it back through me', async () => {
    expect((await me()).locale).toBeNull();

    expect(SUPPORTED_STUDIO_LOCALES).toEqual(['en', 'en-GB']);
    for (const locale of SUPPORTED_STUDIO_LOCALES) {
      expect(await updateLocale(locale)).toEqual({ locale });
      expect(await storedLocale()).toBe(locale);
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
    // it at runtime too.
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'fr' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected, 'locale');
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a malformed tag the same way it refuses an unknown one', async () => {
    await updateLocale('en');
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'not a tag' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected, 'locale');
    expect(await storedLocale()).toBe('en');
  });

  it('refuses a supported tag spelled with different case', async () => {
    // BCP 47 tags are case-insensitive, so `EN-gb` does name `en-GB` — and
    // this endpoint still refuses it, deliberately.
    await updateLocale('en');
    const rejected = await client.callExit(
      client.rpc('account.updateLocale', {
        locale: 'EN-gb' as unknown as SupportedStudioLocale,
      }),
    );
    expectPayloadRejected(rejected, 'locale');
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
    if (!env.auth) throw new Error('dev env must configure auth');
    await updateLocale('en');
    const stack = composeStudio(env, studio);
    const response = await stack
      .request('/api/auth/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': env.auth.baseUrl,
          cookie,
        },
        body: JSON.stringify({ locale: 'en-GB' }),
      })
      .finally(() => stack.dispose());
    expect(response.status).toBeLessThan(500);
    expect(await storedLocale()).toBe('en');
  });

  it('writes no audit row: a personal preference has no tenant', async () => {
    await updateLocale('en-GB');
    const events = await database.run(ownerRows('select id from audit_events'));
    expect(events).toEqual([]);
  });
});
