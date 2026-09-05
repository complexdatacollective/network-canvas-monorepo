import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createRouterClient } from '@orpc/server';
import { verifyPassword } from 'better-auth/crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

import type { CompleteSetupInput } from '@codaco/studio-rpc';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import {
  createScratchDatabase,
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createRpcClient } from '../../__tests__/support/rpc.ts';
import { createApp } from '../../app.ts';
import { createBetterAuthService } from '../../auth/better-auth.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createPool } from '../../db/pool.ts';
import { readEnv } from '../../env.ts';
import { createRpcRouter } from '../../rpc.ts';
import { completeSetup, getSetupStatus } from '../bootstrap.ts';

const db = await reachableDb();
const token = randomBytes(32).toString('base64url');
const input: CompleteSetupInput = {
  token,
  instanceName: '  Field research  ',
  ownerName: '  Initial Owner  ',
  ownerEmail: 'Owner@Example.com',
  ownerPassword: 'test-only setup password',
};

async function fixture() {
  if (!db) throw new Error('Database unavailable');
  const scratch = await createScratchSchema(db);
  await provisionScratchSchema(scratch.pool);
  return scratch;
}

async function counts(pool: pg.Pool) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM "user") AS users,
    (SELECT count(*)::int FROM account) AS accounts,
    (SELECT count(*)::int FROM teams) AS teams,
    (SELECT count(*)::int FROM team_members) AS members,
    (SELECT count(*)::int FROM studio_instance) AS instances,
    (SELECT count(*)::int FROM audit_events) AS events`);
  return result.rows[0] as Record<string, number>;
}

const empty = {
  users: 0,
  accounts: 0,
  teams: 0,
  members: 0,
  instances: 0,
  events: 0,
};
const completed = {
  users: 1,
  accounts: 1,
  teams: 1,
  members: 1,
  instances: 1,
  events: 1,
};

function rpc(
  pool?: pg.Pool,
  mode: 'managed' | 'self-hosted' = 'self-hosted',
  bootstrapToken?: string,
) {
  return createRouterClient(
    createRpcRouter(
      {
        enabled: true,
        emailAndPassword: true,
        magicLink: false,
        socialProviders: [],
      },
      {
        auth: stubAuthService(),
        deployment: { mode, billing: false },
        pool,
        bootstrapToken,
        invitationDeliveryAvailable: false,
      },
    ),
    { context: { principal: null, requestId: randomUUID() } },
  );
}

it('does not expose setup RPCs on managed deployments, even without a database', async () => {
  const client = rpc(undefined, 'managed', token);
  await expect(client.setup.status()).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(client.setup.complete(input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(await rpc().setup.status()).toEqual({ state: 'unavailable' });
  await expect(rpc().setup.complete(input)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  const app = createApp(
    { ...readEnv(), deploymentMode: 'managed' },
    { auth: stubAuthService() },
  );
  expect(
    (
      await app.request('/rpc/setup/status', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    ).status,
  ).toBe(404);
  // Completing setup stays on the same-origin RPC plane even without a session.
  expect(
    (
      await app.request('/rpc/setup/complete', {
        method: 'POST',
        headers: { origin: 'https://untrusted.example' },
      })
    ).status,
  ).toBe(403);
});

describe.skipIf(!db)('self-hosted first-run bootstrap', () => {
  it('forwards the configured token through the real app and commits audited completion', async () => {
    const scratch = await fixture();
    try {
      const app = createApp(
        { ...readEnv(), deploymentMode: 'self-hosted', bootstrapToken: token },
        { pool: scratch.app, auth: stubAuthService() },
      );
      const client = createRpcClient(app);
      expect(await client.setup.status()).toEqual({ state: 'ready' });
      await expect(
        client.setup.complete({
          ...input,
          token: randomBytes(32).toString('base64url'),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await counts(scratch.pool)).toEqual(empty);
      expect(await client.setup.complete(input)).toEqual({ state: 'complete' });
      expect(await client.setup.status()).toEqual({ state: 'complete' });
      expect(await counts(scratch.pool)).toEqual(completed);
    } finally {
      await scratch.dispose();
    }
  });

  it.each(['fresh', 'upgrade'] as const)(
    'completes first run after the shipped %s migration path with runtime grants and immutable completion',
    async (path) => {
      if (!db) throw new Error('A local database is required.');
      const migrations = await readMigrations(
        fileURLToPath(new URL('../../../migrations', import.meta.url)),
      );
      const bootstrap = migrations.find(
        (migration) => migration.manifest.id === '0003_instance_bootstrap',
      );
      if (!bootstrap)
        throw new Error('The shipped bootstrap migration is missing.');
      const scratch = await createScratchDatabase(db);
      const app = createPool(scratch.db);
      try {
        if (path === 'upgrade') {
          const previous = migrations.slice(0, 2);
          const fingerprint = previous.at(-1)?.manifest.fingerprint;
          if (!fingerprint)
            throw new Error('The predecessor migration is missing.');
          await migrateDatabase(scratch.pool, previous, fingerprint);
          expect(
            (
              await scratch.pool.query(
                "SELECT to_regclass('public.studio_instance') AS instance",
              )
            ).rows,
          ).toEqual([{ instance: null }]);
        }
        expect(
          await migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT),
        ).toEqual(
          (path === 'fresh' ? migrations : migrations.slice(2)).map(
            (migration) => migration.manifest.id,
          ),
        );
        expect(await getSetupStatus(app, token)).toEqual({ state: 'ready' });
        await completeSetup(app, token, input, randomUUID());
        expect(await counts(scratch.pool)).toEqual(completed);
        expect(
          await migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT),
        ).toEqual([]);
        await expect(
          app.query('DELETE FROM studio_instance'),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          scratch.pool.query('TRUNCATE studio_instance'),
        ).rejects.toThrow('First-run completion cannot be removed');
        await expect(
          completeSetup(app, token, input, randomUUID()),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(await counts(scratch.pool)).toEqual(completed);
      } finally {
        await app.end();
        await scratch.dispose();
      }
    },
  );

  it('serves the typed unauthenticated RPC with a token gate and replay refusal', async () => {
    const scratch = await fixture();
    try {
      const client = rpc(scratch.app, 'self-hosted', token);
      expect(await client.setup.status()).toEqual({ state: 'ready' });
      await expect(
        client.setup.complete({
          ...input,
          token: randomBytes(32).toString('base64url'),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await counts(scratch.pool)).toEqual(empty);
      expect(await client.setup.complete(input)).toEqual({ state: 'complete' });
      await expect(client.setup.complete(input)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await client.setup.status()).toEqual({ state: 'complete' });
      expect(await counts(scratch.pool)).toEqual(completed);
    } finally {
      await scratch.dispose();
    }
  });
  it('creates one owner, credential, team and completion record with an atomic audit event', async () => {
    const scratch = await fixture();
    try {
      expect(await getSetupStatus(scratch.app, token)).toEqual({
        state: 'ready',
      });
      const requestId = randomUUID();
      expect(await completeSetup(scratch.app, token, input, requestId)).toEqual(
        { state: 'complete' },
      );
      expect(await counts(scratch.pool)).toEqual(completed);
      const owner = (
        await scratch.pool
          .query(`SELECT u.id, u.name, u.email, u."emailVerified", a.password, m.role,
        i.name AS "instanceName", i.initial_owner_user_id AS "ownerId", i.initial_team_id AS "teamId"
        FROM "user" u JOIN account a ON a."userId" = u.id JOIN team_members m ON m.user_id = u.id
        CROSS JOIN studio_instance i`)
      ).rows[0] as {
        id: string;
        password: string;
        ownerId: string;
        teamId: string;
      };
      expect(owner).toMatchObject({
        name: 'Initial Owner',
        email: 'owner@example.com',
        emailVerified: true,
        role: 'owner',
        instanceName: 'Field research',
      });
      expect(owner.ownerId).toBe(owner.id);
      expect(
        await verifyPassword({
          hash: owner.password,
          password: input.ownerPassword,
        }),
      ).toBe(true);
      expect(owner.password).not.toContain(input.ownerPassword);
      const event = (
        await scratch.pool.query(
          'SELECT event_type, team_id, actor_id, request_id, details FROM audit_events',
        )
      ).rows[0];
      expect(event).toEqual({
        event_type: 'team.created',
        team_id: owner.teamId,
        actor_id: owner.id,
        request_id: requestId,
        details: { source: 'instance_setup' },
      });
      expect(JSON.stringify(event)).not.toContain(token);
      expect(JSON.stringify(event)).not.toContain(input.ownerPassword);
      expect(await getSetupStatus(scratch.app)).toEqual({ state: 'complete' });

      // Querying the hash alone would miss a wrong issuer/accountId shape.
      // Exercise Better Auth's actual password endpoint against the new row.
      const env = readEnv();
      if (!env.auth) throw new Error('Auth fixture unavailable');
      const auth = createBetterAuthService(env.auth, scratch.app, {
        sendMagicLink: async () => undefined,
      });
      const response = await auth.handler(
        new Request(`${env.auth.baseUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'origin': env.auth.baseUrl,
          },
          body: JSON.stringify({
            email: 'owner@example.com',
            password: input.ownerPassword,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('session_token=');
    } finally {
      await scratch.dispose();
    }
  });

  it('has one winner under concurrent setup attempts and refuses replay after restart', async () => {
    const scratch = await fixture();
    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          completeSetup(
            scratch.app,
            token,
            { ...input, ownerEmail: `owner${i}@example.com` },
            randomUUID(),
          ),
        ),
      );
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const failures = attempts.filter(
        (attempt) => attempt.status === 'rejected',
      );
      expect(failures).toHaveLength(3);
      for (const failure of failures)
        expect(failure.reason).toMatchObject({ code: 'CONFLICT' });
      expect(await counts(scratch.pool)).toEqual(completed);
      const restarted = new pg.Pool(scratch.app.options);
      try {
        expect(await getSetupStatus(restarted, token)).toEqual({
          state: 'complete',
        });
        await expect(
          completeSetup(restarted, token, input, randomUUID()),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        await restarted.end();
      }
      expect(await counts(scratch.pool)).toEqual(completed);
    } finally {
      await scratch.dispose();
    }
  });

  it('refuses wrong and missing tokens and invalid fields without any identity writes', async () => {
    const scratch = await fixture();
    try {
      expect(await getSetupStatus(scratch.app)).toEqual({
        state: 'unavailable',
      });
      await expect(
        completeSetup(scratch.app, undefined, input, randomUUID()),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await expect(
        completeSetup(
          scratch.app,
          randomBytes(32).toString('base64url'),
          input,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        completeSetup(
          scratch.app,
          token,
          { ...input, ownerPassword: 'short' },
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect(await counts(scratch.pool)).toEqual(empty);
    } finally {
      await scratch.dispose();
    }
  });

  it('rolls every write back if the final audit append fails, leaving the token usable', async () => {
    const scratch = await fixture();
    try {
      await scratch.pool
        .query(`CREATE FUNCTION reject_setup_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
        CREATE TRIGGER reject_setup_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_setup_audit()`);
      await expect(
        completeSetup(scratch.app, token, input, randomUUID()),
      ).rejects.toThrow('injected audit failure');
      expect(await counts(scratch.pool)).toEqual(empty);
      expect(await getSetupStatus(scratch.app, token)).toEqual({
        state: 'ready',
      });
      await scratch.pool.query(
        'DROP TRIGGER reject_setup_audit ON audit_events',
      );
      await completeSetup(scratch.app, token, input, randomUUID());
      expect(await counts(scratch.pool)).toEqual(completed);
    } finally {
      await scratch.dispose();
    }
  });

  it('never claims an existing populated database, including a development seed without a singleton', async () => {
    const scratch = await fixture();
    try {
      // Empty-table CASCADE truncation remains available to the development
      // seed workflow; it cannot erase an actual completed installation.
      await scratch.pool.query('TRUNCATE "user" CASCADE');
      await scratch.pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('existing', 'Existing owner', 'existing@example.com', true)`,
      );
      expect(await getSetupStatus(scratch.app, token)).toEqual({
        state: 'unavailable',
      });
      await expect(
        completeSetup(scratch.app, token, input, randomUUID()),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(await counts(scratch.pool)).toEqual({ ...empty, users: 1 });
    } finally {
      await scratch.dispose();
    }
  });

  it('preserves completion after initial owner and team erasure and refuses setup in a fresh pool', async () => {
    const scratch = await fixture();
    try {
      await completeSetup(scratch.app, token, input, randomUUID());
      await scratch.app.query('DELETE FROM "user"');
      await scratch.app.query('DELETE FROM teams');
      const instance = (
        await scratch.pool.query(
          'SELECT initial_owner_user_id, initial_team_id FROM studio_instance',
        )
      ).rows[0];
      expect(instance).toEqual({
        initial_owner_user_id: null,
        initial_team_id: null,
      });
      expect(await counts(scratch.pool)).toEqual({
        ...empty,
        instances: 1,
        events: 1,
      });
      const restarted = new pg.Pool(scratch.app.options);
      try {
        expect(await getSetupStatus(restarted, token)).toEqual({
          state: 'complete',
        });
        await expect(
          completeSetup(restarted, token, input, randomUUID()),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        await restarted.end();
      }
      await expect(
        scratch.app.query('DELETE FROM studio_instance'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        scratch.pool.query('DELETE FROM studio_instance'),
      ).rejects.toThrow('First-run completion cannot be removed');
      await expect(
        scratch.pool.query('TRUNCATE "user" CASCADE'),
      ).rejects.toThrow('First-run completion cannot be removed');
      expect(await getSetupStatus(scratch.app, token)).toEqual({
        state: 'complete',
      });
    } finally {
      await scratch.dispose();
    }
  });
});
