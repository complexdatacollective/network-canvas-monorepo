import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';

import { createStudio } from '../app.ts';
import { readEnv } from '../env.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import { RATE_LIMITS } from '../rate-limit/scopes.ts';
import { authServiceStub } from './support/auth.ts';
import {
  openTestDatabase,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import { startStudioServer } from './support/serve.ts';

describe.skipIf(!testDb)('a participant redemption over HTTP', () => {
  const charged: string[] = [];
  let database: TestDatabaseRuntime;
  let server: Awaited<ReturnType<typeof startStudioServer>>;

  const limiter: RateLimiter['Service'] = {
    configured: true,
    rules: RATE_LIMITS,
    check: (scope, subject) =>
      Effect.sync(() => {
        charged.push(`${scope}:${subject}`);
        return { allowed: true };
      }),
    consume: () => Effect.succeed({ allowed: true }),
    readiness: Effect.succeed('ok'),
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    const env = readEnv();
    server = await startStudioServer(
      env,
      createStudio(env, {
        auth: authServiceStub(),
        services: database.services,
        limiter,
      }),
    );
  });

  afterAll(async () => {
    await server.dispose();
    await database.dispose();
  });

  it('is charged to the address it arrived from, not to an unknown one', async () => {
    const response = await fetch(`${server.origin}${RPC_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/ndjson',
        'sec-fetch-site': 'same-origin',
      },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: '1',
        tag: 'participant.redeem',
        payload: { linkToken: 'x'.repeat(60) },
        headers: [],
      })}\n`,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Unauthorized');

    const addresses = charged.filter((entry) =>
      entry.startsWith('participant_redeem_address:'),
    );
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatch(/^participant_redeem_address:.*127\.0\.0\.1$/);
  });
});
