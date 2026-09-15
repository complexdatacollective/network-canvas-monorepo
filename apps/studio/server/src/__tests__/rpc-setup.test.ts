// First-run bootstrap end to end (#1909): the public `setup.complete`
// procedure against the real better-auth service, the real installation row,
// and the real cookie plane — the session it returns is carried back in as a
// cookie and asked to answer `me`, because a set-cookie header that does not
// sign anybody in is the failure this exists to catch.
import { safe } from '@orpc/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import { createBetterAuthService } from '../auth/better-auth.ts';
import { readEnv } from '../env.ts';
import { issueBootstrapToken, readInstallation } from '../setup/bootstrap.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const env = readEnv();
const db = await reachableDb();

const INSTANCE_NAME = 'Department of Social Research';

describe.skipIf(!db)('setup.complete', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let app: ReturnType<typeof createApp>;
  let client: ReturnType<typeof createRpcClient>;
  let token: string;
  let sequence = 0;

  /**
   * The RPC transport as a browser speaks it, so the response — and its
   * `set-cookie` — can be read. The typed client hands back the procedure's
   * output and nothing else, which is exactly what the cookie is not.
   */
  const completeOverHttp = async (input: {
    token: string;
    instanceName: string;
    owner: { name: string; email: string; password: string };
  }) =>
    await app.request('/rpc/setup/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ json: input }),
    });

  const owner = (password = 'first-owner-password') => {
    sequence += 1;
    return {
      name: 'First Owner',
      email: `owner-${Date.now()}-${sequence}@example.test`,
      password,
    };
  };

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    if (!env.auth) throw new Error('dev env must configure auth');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    const auth = createBetterAuthService(env.auth, scratch.app, () =>
      Promise.resolve(),
    );
    app = createApp(env, { auth, pool: scratch.app });
    client = createRpcClient(app);
  });
  afterAll(async () => {
    await scratch.dispose();
  });

  beforeEach(async () => {
    // Back to the state the schema step leaves: one ownerless installation
    // with a token outstanding. Accounts from earlier cases stay, which is
    // why each takes a fresh address.
    await scratch.pool.query('delete from installation');
    const issued = await issueBootstrapToken(scratch.pool);
    if (issued.kind !== 'issued') throw new Error('expected a token');
    token = issued.token;
  });

  it('reports setup as required while nobody owns the instance', async () => {
    const status = await client.status();

    expect(status.setup).toEqual({ required: true });
    // No stored name yet, so the product name stands in.
    expect(status.name).toBe('Network Canvas Studio');
  });

  it('refuses a wrong token, and says no more than that', async () => {
    const wrong = await safe(
      client.setup.complete({
        token: 'not-the-token',
        instanceName: INSTANCE_NAME,
        owner: owner(),
      }),
    );
    expect(wrong.error).toMatchObject({ code: 'UNAUTHORIZED' });

    // A refusal writes nothing: no owner, and the real token still works.
    const installation = await readInstallation(scratch.pool);
    expect(installation?.ownerUserId).toBeNull();
    expect(installation?.name).toBeNull();
    expect((await client.status()).setup.required).toBe(true);
  });

  it('creates the owner, names the instance, and signs the browser in', async () => {
    const account = owner();

    const response = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: account,
    });

    expect(response.status).toBe(200);
    const setCookie = response.headers.getSetCookie();
    expect(setCookie.length).toBeGreaterThan(0);

    // The cookie is a working session, not just a header: carried back in, it
    // answers `me` as the account that was just created.
    const cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
    const me = await createRpcClient(app, { cookie }).me();
    expect(me.email).toBe(account.email);
    expect(me.name).toBe(account.name);
    // A brand-new owner belongs to no team yet; the landing resolution takes
    // them to `/no-team`, and team creation is #1256's.
    expect(me.teams).toEqual([]);

    const installation = await readInstallation(scratch.pool);
    expect(installation).toEqual({
      name: INSTANCE_NAME,
      ownerUserId: me.userId,
      // Spent: the token that completed setup can never be presented again.
      bootstrapTokenHash: null,
    });

    const status = await client.status();
    expect(status.setup).toEqual({ required: false });
    expect(status.name).toBe(INSTANCE_NAME);
  });

  it('is not there once the instance has an owner', async () => {
    const first = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: owner(),
    });
    expect(first.status).toBe(200);

    const second = await safe(
      client.setup.complete({
        token,
        instanceName: 'A second instance name',
        owner: owner(),
      }),
    );

    // NOT_FOUND, which is what `/setup` renders as its not-found screen: the
    // procedure is gone, not merely refusing this caller.
    expect(second.error).toMatchObject({ code: 'NOT_FOUND' });
    expect((await readInstallation(scratch.pool))?.name).toBe(INSTANCE_NAME);
  });

  it('adopts the account an interrupted setup left behind', async () => {
    // The recoverable window: the account was created and the ownership mark
    // was not. Standing in for it with the provider's own sign-up endpoint,
    // which is exactly what the procedure calls.
    const account = owner();
    const signedUp = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth?.baseUrl ?? '',
      },
      body: JSON.stringify(account),
    });
    expect(signedUp.status).toBe(200);
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();

    const response = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: account,
    });

    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const me = await createRpcClient(app, { cookie }).me();
    expect(me.email).toBe(account.email);
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBe(me.userId);
  });

  it('refuses an address whose password the caller cannot produce', async () => {
    const account = owner();
    const signedUp = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth?.baseUrl ?? '',
      },
      body: JSON.stringify(account),
    });
    expect(signedUp.status).toBe(200);

    const refused = await safe(
      client.setup.complete({
        token,
        instanceName: INSTANCE_NAME,
        owner: { ...account, password: 'a-different-password' },
      }),
    );

    // Holding the bootstrap token does not confer somebody else's account.
    expect(refused.error).toMatchObject({ code: 'CONFLICT' });
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();
  });

  it('refuses input the contract does not allow', async () => {
    const rejected = await safe(
      client.setup.complete({
        token,
        instanceName: '   ',
        owner: owner(),
      }),
    );
    expect(rejected.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();

    const shortPassword = await safe(
      client.setup.complete({
        token,
        instanceName: INSTANCE_NAME,
        owner: owner('short'),
      }),
    );
    expect(shortPassword.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();
  });
});
