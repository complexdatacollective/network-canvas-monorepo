// First-run bootstrap end to end (#1909): the public `setup.complete`
// procedure against the real better-auth service, the real installation row,
// and the real cookie plane — the session it returns is carried back in as a
// cookie and asked to answer `me`, because a set-cookie header that does not
// sign anybody in is the failure this exists to catch.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createStudio, type Studio } from '../app.ts';
import { createBetterAuthService } from '../auth/better-auth.ts';
import { readEnv } from '../env.ts';
import { issueBootstrapToken, readInstallation } from '../setup/bootstrap.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import {
  createRpcClient,
  expectPayloadRejected,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { testCipher } from './support/secrets.ts';
import { composeStudio } from './support/serve.ts';

const env = readEnv();
const db = await reachableDb();

const INSTANCE_NAME = 'Department of Social Research';

type SetupInput = {
  token: string;
  instanceName: string;
  owner: { name: string; email: string; password: string };
};

describe.skipIf(!db)('setup.complete', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let studio: Studio;
  let composed: ReturnType<typeof composeStudio>;
  let client: RpcTestClient;
  let token: string;
  let sequence = 0;

  /**
   * The RPC transport as a browser speaks it, so the response — and its
   * `set-cookie` — can be read. The in-process client hands back the
   * procedure's output and nothing else, which is exactly what the cookie is
   * not.
   *
   * The body is one ndjson frame, which is what `RpcSerialization.layerNdjson`
   * decodes: a `Request` envelope naming the tag and carrying the payload.
   */
  const completeOverHttp = (input: SetupInput) =>
    composed.request('/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ndjson',
        'sec-fetch-site': 'same-origin',
      },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: 1,
        tag: 'setup.complete',
        payload: input,
        headers: [],
      })}\n`,
    });

  /** Any other procedure over the same transport, for the holder proof below. */
  const statusOverHttp = () =>
    composed.request('/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ndjson',
        'sec-fetch-site': 'same-origin',
      },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: 1,
        tag: 'status',
        // `null`, not `undefined`: `status` takes `Schema.Void`, whose wire
        // form is `null`, and `JSON.stringify` drops an `undefined` value
        // entirely — a request with no payload key at all dies on decode
        // before the handler, while the transport still answers 200.
        payload: null,
        headers: [],
      })}\n`,
    });

  /** The one `Exit` frame in an ndjson response body. */
  const exitFrameOf = async (response: Response): Promise<unknown> => {
    const frames = (await response.text())
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line: string): unknown => JSON.parse(line));
    const exit = frames.find(
      (frame): frame is { _tag: 'Exit'; exit: { value?: unknown } } =>
        typeof frame === 'object' &&
        frame !== null &&
        '_tag' in frame &&
        frame._tag === 'Exit',
    );
    if (!exit) throw new Error(`no Exit frame in ${JSON.stringify(frames)}`);
    return exit.exit.value;
  };

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
    const auth = createBetterAuthService(
      env.auth,
      scratch.app,
      () => Promise.resolve(),
      testCipher(),
    );
    studio = createStudio(env, { auth, pool: scratch.app });
    composed = composeStudio(env, studio);
    client = await createRpcClient(studio);
  });
  afterAll(async () => {
    await client.dispose();
    await composed.dispose();
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

  const status = () => client.call(client.rpc('status', undefined));

  it('reports setup as required while nobody owns the instance', async () => {
    const reported = await status();

    expect(reported.setup).toEqual({ required: true });
    // No stored name yet, so the product name stands in.
    expect(reported.name).toBe('Network Canvas Studio');
  });

  it('refuses a wrong token, and says no more than that', async () => {
    await expectRpcFailure(
      client.callExit(
        client.rpc('setup.complete', {
          token: 'not-the-token',
          instanceName: INSTANCE_NAME,
          owner: owner(),
        }),
      ),
      'Unauthorized',
    );

    // A refusal writes nothing: no owner, and the real token still works.
    const installation = await readInstallation(scratch.pool);
    expect(installation?.ownerUserId).toBeNull();
    expect(installation?.name).toBeNull();
    expect((await status()).setup.required).toBe(true);
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
    // The flag is what the shell branches on, and it must agree with the
    // header: a response that carried no cookie must not claim it signed
    // anybody in.
    expect(await exitFrameOf(response)).toEqual({
      instanceName: INSTANCE_NAME,
      signedIn: true,
    });

    // The cookie is a working session, not just a header: carried back in, it
    // answers `me` as the account that was just created.
    const cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
    const signedIn = await createRpcClient(studio, { cookie });
    const me = await signedIn.call(signedIn.rpc('me', undefined));
    expect(me.email).toBe(account.email);
    expect(me.name).toBe(account.name);
    // A brand-new owner belongs to no team yet; the landing resolution takes
    // them to `/no-team`, and team creation is #1256's.
    expect(me.teams).toEqual([]);
    await signedIn.dispose();

    const installation = await readInstallation(scratch.pool);
    expect(installation).toEqual({
      name: INSTANCE_NAME,
      ownerUserId: me.userId,
      // Spent: the token that completed setup can never be presented again.
      bootstrapTokenHash: null,
    });

    const reported = await status();
    expect(reported.setup).toEqual({ required: false });
    expect(reported.name).toBe(INSTANCE_NAME);
  });

  it('refuses a call that cannot show it came from our own origin', async () => {
    // The cookie plane's CSRF gate, now a route middleware on `/rpc` rather
    // than a Hono one (#1248). `setup.complete` is the procedure a forged
    // cross-origin POST would most like to reach, since it takes no session.
    const forged = await composed.request('/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ndjson',
        'sec-fetch-site': 'cross-site',
      },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: 1,
        tag: 'setup.complete',
        payload: {
          token,
          instanceName: INSTANCE_NAME,
          owner: owner(),
        },
        headers: [],
      })}\n`,
    });

    expect(forged.status).toBe(403);
    expect(forged.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();
  });

  it('gives every request its own cookie holder', async () => {
    // The holder is allocated by the effect the route middleware runs per
    // request. One built when the route was registered would be shared by the
    // whole process, and the cookie minted for this caller would be set on
    // whoever's response came next.
    const signedUp = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: owner(),
    });
    expect(signedUp.headers.getSetCookie().length).toBeGreaterThan(0);

    const next = await statusOverHttp();
    expect(next.status).toBe(200);
    // The 200 is the transport's verdict, not the call's: a request the rpc
    // server refuses is answered 200 with a failing exit frame. Asserting the
    // answer — and that it is the answer of a `status` handler that read the
    // installation the request before it wrote — is what keeps the
    // set-cookie assertion below about a served call.
    expect(await exitFrameOf(next)).toMatchObject({
      setup: { required: false },
    });
    expect(next.headers.getSetCookie()).toEqual([]);
  });

  it('reports signedIn false for a call with no response to set a cookie on', async () => {
    // The in-process client has no HTTP response, so the `/rpc` route's
    // `SetCookies` holder is absent — exactly the position a call arriving
    // over the WebSocket is in. The owner is created either way; what the
    // caller is told is that it was not signed in, which is what sends them to
    // sign in rather than into the app.
    const account = owner();

    const completed = await client.call(
      client.rpc('setup.complete', {
        token,
        instanceName: INSTANCE_NAME,
        owner: account,
      }),
    );

    expect(completed).toEqual({
      instanceName: INSTANCE_NAME,
      signedIn: false,
    });
    expect((await readInstallation(scratch.pool))?.name).toBe(INSTANCE_NAME);
  });

  it('is not there once the instance has an owner', async () => {
    const first = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: owner(),
    });
    expect(first.status).toBe(200);

    // NOT_FOUND, which is what `/setup` renders as its not-found screen: the
    // procedure is gone, not merely refusing this caller.
    await expectRpcFailure(
      client.callExit(
        client.rpc('setup.complete', {
          token,
          instanceName: 'A second instance name',
          owner: owner(),
        }),
      ),
      'NotFound',
    );
    expect((await readInstallation(scratch.pool))?.name).toBe(INSTANCE_NAME);
  });

  it('adopts the account an interrupted setup left behind', async () => {
    // The recoverable window: the account was created and the ownership mark
    // was not. Standing in for it with the provider's own sign-up endpoint,
    // which is exactly what the procedure calls.
    const account = owner();
    const signedUp = await studio.app.request('/api/auth/sign-up/email', {
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
    const signedIn = await createRpcClient(studio, { cookie });
    const me = await signedIn.call(signedIn.rpc('me', undefined));
    expect(me.email).toBe(account.email);
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBe(me.userId);
    await signedIn.dispose();
  });

  it('refuses an address whose password the caller cannot produce', async () => {
    const account = owner();
    const signedUp = await studio.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth?.baseUrl ?? '',
      },
      body: JSON.stringify(account),
    });
    expect(signedUp.status).toBe(200);

    // Holding the bootstrap token does not confer somebody else's account.
    // The reason is machine-readable now, where the oRPC boundary had only the
    // CONFLICT code: `/setup` can say which conflict it was.
    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('setup.complete', {
          token,
          instanceName: INSTANCE_NAME,
          owner: { ...account, password: 'a-different-password' },
        }),
      ),
      'Conflict',
    );
    expect(refused.reason).toBe('emailTaken');
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();
  });

  it('refuses input the contract does not allow', async () => {
    const blankName = await client.callExit(
      client.rpc('setup.complete', {
        token,
        instanceName: '   ',
        owner: owner(),
      }),
    );
    expectPayloadRejected(blankName);
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();

    const shortPassword = await client.callExit(
      client.rpc('setup.complete', {
        token,
        instanceName: INSTANCE_NAME,
        owner: owner('short'),
      }),
    );
    expectPayloadRejected(shortPassword);
    expect((await readInstallation(scratch.pool))?.ownerUserId).toBeNull();
  });
});
