import { Redacted } from 'effect';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createStudio, type Studio } from '../app.ts';
import { OwnerScope } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { issueBootstrapToken, readInstallation } from '../setup/bootstrap.ts';
import { liveAuthService } from './support/auth.ts';
import {
  openTestDatabase,
  ownerAffected,
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

const INSTANCE_NAME = 'Department of Social Research';

type SetupInput = {
  token: string;
  instanceName: string;
  owner: { name: string; email: string; password: string };
};

const asPayload = (input: SetupInput) => ({
  token: Redacted.make(input.token),
  instanceName: input.instanceName,
  owner: {
    name: Redacted.make(input.owner.name),
    email: Redacted.make(input.owner.email),
    password: Redacted.make(input.owner.password),
  },
});

describe.skipIf(!testDb)('setup.complete', () => {
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let composed: ReturnType<typeof composeStudio>;
  let client: RpcTestClient;
  let token: string;
  let sequence = 0;

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
        // `null`, not `undefined`: `JSON.stringify` drops an `undefined` value
        // entirely, and a request with no payload key dies on decode.
        payload: null,
        headers: [],
      })}\n`,
    });

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
    if (!env.auth) throw new Error('dev env must configure auth');
    database = await openTestDatabase();
    studio = createStudio(env, {
      auth: liveAuthService(env, database.services),
      services: database.services,
    });
    composed = composeStudio(env, studio);
    client = await createRpcClient(studio);
  });
  afterAll(async () => {
    await client.dispose();
    await composed.dispose();
    await database.dispose();
  });

  beforeEach(async () => {
    await database.run(ownerAffected('delete from installation'));
    const issued = await database.run(OwnerScope.open(issueBootstrapToken()));
    if (issued.kind !== 'issued') throw new Error('expected a token');
    token = Redacted.value(issued.token);
  });

  const status = () => client.call(client.rpc('status', undefined));

  it('reports setup as required while nobody owns the instance', async () => {
    const reported = await status();

    expect(reported.setup).toEqual({ required: true });
    expect(reported.name).toBe('Network Canvas Studio');
  });

  it('refuses a wrong token, and says no more than that', async () => {
    await expectRpcFailure(
      client.callExit(
        client.rpc(
          'setup.complete',
          asPayload({
            token: 'not-the-token',
            instanceName: INSTANCE_NAME,
            owner: owner(),
          }),
        ),
      ),
      'Unauthorized',
    );

    const installation = await database.run(
      OwnerScope.open(readInstallation()),
    );
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
    expect(await exitFrameOf(response)).toEqual({
      instanceName: INSTANCE_NAME,
      signedIn: true,
    });

    const cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
    const signedIn = await createRpcClient(studio, { cookie });
    const me = await signedIn.call(signedIn.rpc('me', undefined));
    expect(Redacted.value(me.email)).toBe(account.email);
    expect(Redacted.value(me.name)).toBe(account.name);
    expect(me.teams).toEqual([]);
    await signedIn.dispose();

    const installation = await database.run(
      OwnerScope.open(readInstallation()),
    );
    expect(installation).toEqual({
      name: INSTANCE_NAME,
      ownerUserId: me.userId,
      bootstrapTokenHash: null,
    });

    const reported = await status();
    expect(reported.setup).toEqual({ required: false });
    expect(reported.name).toBe(INSTANCE_NAME);
  });

  it('refuses a call that cannot show it came from our own origin', async () => {
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
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBeNull();
  });

  it('gives every request its own cookie holder', async () => {
    const signedUp = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: owner(),
    });
    expect(signedUp.headers.getSetCookie().length).toBeGreaterThan(0);

    const next = await statusOverHttp();
    expect(next.status).toBe(200);
    expect(await exitFrameOf(next)).toMatchObject({
      setup: { required: false },
    });
    expect(next.headers.getSetCookie()).toEqual([]);
  });

  it('reports signedIn false for a call with no response to set a cookie on', async () => {
    const account = owner();

    const completed = await client.call(
      client.rpc(
        'setup.complete',
        asPayload({
          token,
          instanceName: INSTANCE_NAME,
          owner: account,
        }),
      ),
    );

    expect(completed).toEqual({
      instanceName: INSTANCE_NAME,
      signedIn: false,
    });
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.name,
    ).toBe(INSTANCE_NAME);
  });

  it('is not there once the instance has an owner', async () => {
    const first = await completeOverHttp({
      token,
      instanceName: INSTANCE_NAME,
      owner: owner(),
    });
    expect(first.status).toBe(200);

    await expectRpcFailure(
      client.callExit(
        client.rpc(
          'setup.complete',
          asPayload({
            token,
            instanceName: 'A second instance name',
            owner: owner(),
          }),
        ),
      ),
      'NotFound',
    );
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.name,
    ).toBe(INSTANCE_NAME);
  });

  it('adopts the account an interrupted setup left behind', async () => {
    const account = owner();
    const signedUp = await composed.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth?.baseUrl ?? '',
      },
      body: JSON.stringify(account),
    });
    expect(signedUp.status).toBe(200);
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBeNull();

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
    expect(Redacted.value(me.email)).toBe(account.email);
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBe(me.userId);
    await signedIn.dispose();
  });

  it('refuses an address whose password the caller cannot produce', async () => {
    const account = owner();
    const signedUp = await composed.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth?.baseUrl ?? '',
      },
      body: JSON.stringify(account),
    });
    expect(signedUp.status).toBe(200);

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc(
          'setup.complete',
          asPayload({
            token,
            instanceName: INSTANCE_NAME,
            owner: { ...account, password: 'a-different-password' },
          }),
        ),
      ),
      'Conflict',
    );
    expect(refused.reason).toBe('emailTaken');
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBeNull();
  });

  it('refuses input the contract does not allow', async () => {
    const blankName = await client.callExit(
      client.rpc(
        'setup.complete',
        asPayload({
          token,
          instanceName: '   ',
          owner: owner(),
        }),
      ),
    );
    expectPayloadRejected(blankName, 'instanceName');
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBeNull();

    const shortPassword = await client.callExit(
      client.rpc(
        'setup.complete',
        asPayload({
          token,
          instanceName: INSTANCE_NAME,
          owner: owner('short'),
        }),
      ),
    );
    expectPayloadRejected(shortPassword, 'owner.password.value');
    expect(
      (await database.run(OwnerScope.open(readInstallation())))?.ownerUserId,
    ).toBeNull();
  });
});
