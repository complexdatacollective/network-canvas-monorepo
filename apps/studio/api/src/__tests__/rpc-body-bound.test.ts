import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';

import { createStudio } from '../app.ts';
import { readEnv } from '../env.ts';
import { authServiceStub } from './support/auth.ts';
import { startStudioServer } from './support/serve.ts';

const BOUND = 64 * 1024;
const OVERSIZED = 1024 * 1024;

describe('the /rpc body bound', () => {
  let sessionLookups = 0;
  let server: Awaited<ReturnType<typeof startStudioServer>>;

  beforeAll(async () => {
    const env = readEnv();
    server = await startStudioServer(
      env,
      createStudio(env, {
        auth: authServiceStub({
          getSession: () =>
            Effect.sync(() => {
              sessionLookups += 1;
            }).pipe(Effect.andThen(Effect.succeedNone)),
        }),
      }),
      undefined,
      undefined,
      { unaryBodyLimit: BOUND },
    );
  });
  afterAll(() => server.dispose());

  const post = (tag: string, payload: unknown, padding: number) =>
    fetch(`${server.origin}${RPC_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/ndjson',
        'sec-fetch-site': 'same-origin',
      },
      body: `${JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [], padding: 'x'.repeat(padding) })}\n`,
    }).then(
      async (response) => ({
        status: response.status,
        body: await response.text(),
      }),
      (error: unknown) => ({ refused: error }),
    );

  it('stops reading a /rpc body over the bound', async () => {
    const oversized = await post('status', null, OVERSIZED);
    expect(oversized).toHaveProperty('refused');

    const normal = await post('status', null, 0);
    expect(normal).toMatchObject({ status: 200 });
    expect(normal).toHaveProperty(
      'body',
      expect.stringContaining('"_tag":"Success"'),
    );
  });

  it('refuses an oversized anonymous /rpc body before any session lookup', async () => {
    const payload = { teamId: 'any-team' };
    sessionLookups = 0;
    const oversized = await post('studies.list', payload, OVERSIZED);
    expect(oversized).toHaveProperty('refused');
    expect(sessionLookups).toBe(0);

    const normal = await post('studies.list', payload, 0);
    expect(normal).toMatchObject({ status: 200 });
    expect(normal).toHaveProperty(
      'body',
      expect.stringContaining('Unauthorized'),
    );
    expect(sessionLookups).toBeGreaterThan(0);
  });
});
