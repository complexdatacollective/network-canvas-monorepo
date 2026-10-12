import { Effect, Option, Redacted } from 'effect';

import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';

import { createStudio } from '../../app.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { readEnv } from '../../env.ts';
import { MaintenanceTriggers } from '../../http/middleware/maintenance.ts';
import { authServiceStub } from './auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  uniqueTeamId,
} from './database.ts';
import { type Observed, observe } from './observe.ts';
import { startStudioServer } from './serve.ts';

export type ObservedServer = {
  readonly teamId: string;
  readonly principal: SessionPrincipal;
  readonly observed: Observed;
  readonly database: TestDatabaseRuntime;
  readonly rpc: (
    tag: string,
    payload: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>;
  readonly dispose: () => Promise<void>;
};

export async function startObservedServer(
  slug: string,
): Promise<ObservedServer> {
  const teamId = uniqueTeamId(`${slug}-team`);
  const principal: SessionPrincipal = {
    kind: 'user',
    userId: `${teamId}-user`,
    email: Redacted.make(`${teamId}@example.com`),
    emailVerified: true,
    name: Redacted.make(`Researcher ${teamId}`),
    locale: null,
    sessionId: `${teamId}-session`,
  };
  const database = await openTestDatabase();
  await database.run(insertTeam(teamId));
  await database.run(
    ownerAffected(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [
        principal.userId,
        Redacted.value(principal.name),
        Redacted.value(principal.email),
      ],
    ),
  );
  await database.run(
    ownerAffected(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      [`${teamId}-member`, teamId, principal.userId],
    ),
  );
  const auth = authServiceStub({
    getSession: () => Effect.succeedSome(principal),
    getMembership: (_userId, requested) =>
      Effect.succeed(
        Option.fromNullishOr(requested === teamId ? { role: 'owner' } : null),
      ),
    listMemberships: () => Effect.succeed([{ teamId, role: 'owner' }]),
  });
  const observed = observe();
  const env = readEnv();
  const studio = createStudio(env, { auth, services: database.services });
  const server = await startStudioServer(
    env,
    studio,
    studio.checks,
    MaintenanceTriggers.layerOpen,
    { observability: observed.layer },
  );
  return {
    teamId,
    principal,
    observed,
    database,
    rpc: (tag, payload, headers = {}) =>
      fetch(`${server.origin}${RPC_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/ndjson',
          'sec-fetch-site': 'same-origin',
          ...headers,
        },
        body: `${JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] })}\n`,
      }),
    dispose: async () => {
      await server.dispose();
      await database.dispose();
    },
  };
}
