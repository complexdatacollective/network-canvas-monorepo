import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { escapeIdentifier, escapeLiteral } from 'pg';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { contract } from '@codaco/studio-rpc';
import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createPool } from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';
import { completeSetup } from '../../instance/bootstrap.ts';
import { configuration, rootOne } from '../../pii/__tests__/fixtures.ts';
import { enqueueInvitationDelivery } from '../../team/invitation-delivery-store.ts';

const database = await reachableDb();
const entry = fileURLToPath(new URL('../../index.ts', import.meta.url));
const ownerPassword = 'test-only runtime owner password';
const token = randomBytes(32).toString('base64url');

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function launch(
  db: DbEnv & { allowedLogins?: readonly string[] },
  port: number,
  role: string,
  smtp?: string,
  clientDist?: string,
) {
  const keyset = configuration();
  keyset.roots = keyset.roots.map((root) => ({
    ...root,
    reference: `STUDIO_ENCRYPTION_ROOT_${root.reference}`,
  }));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [entry], {
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      STUDIO_ROLE: role,
      STUDIO_TELEMETRY: 'false',
      STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(db.allowedLogins ?? []),
      DATABASE_URL: db.url,
      PUBLIC_URL: origin,
      BETTER_AUTH_SECRET: 'synthetic-runtime-signing-secret-value',
      STUDIO_BOOTSTRAP_TOKEN: token,
      STUDIO_ENCRYPTION_KEYSET: JSON.stringify(keyset),
      STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE: rootOne.toString('base64'),
      STUDIO_ENCRYPTION_ROOT_TEST_ROOT_TWO: rootOne.toString('base64'),
      ...(clientDist ? { CLIENT_DIST: clientDist } : {}),
      ...(smtp ? { SMTP_URL: smtp, EMAIL_FROM: 'studio@example.test' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  let resolveStarted: (value: boolean) => void = () => undefined;
  const started = new Promise<boolean>((resolve) => {
    resolveStarted = resolve;
  });
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
    if (output.includes('"code":"STUDIO_SERVER_STARTED"')) resolveStarted(true);
  });
  child.stderr.on('data', (data: Buffer) => {
    errors += data.toString();
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 20_000);
  const finished = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(deadline);
      resolveStarted(false);
      resolve(code);
    });
  });
  return {
    child,
    started,
    finished,
    origin,
    records: () =>
      output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    errors: () => errors,
    async stop() {
      if (child.exitCode === null) child.kill('SIGTERM');
      return finished;
    },
  };
}

async function fixture() {
  if (!database) throw new Error('A local PostgreSQL instance is required.');
  const scratch = await createScratchDatabase(database);
  const allowedLogins = await enrollMigrationTestDatabase(
    scratch.pool,
    database,
  );
  await migrateDatabase(
    scratch.pool,
    await readMigrations(
      fileURLToPath(new URL('../../../migrations', import.meta.url)),
    ),
    SCHEMA_FINGERPRINT,
    allowedLogins,
  );
  const login = `runtime_process_${randomUUID().replaceAll('-', '')}`;
  const password = 'runtime-process-isolated-only';
  const runtimeUrl = new URL(scratch.db.url);
  await scratch.pool
    .query(`CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD ${escapeLiteral(password)};
    GRANT studio_app, studio_maintenance TO ${escapeIdentifier(login)} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE;
    GRANT CONNECT ON DATABASE ${escapeIdentifier(runtimeUrl.pathname.slice(1))} TO ${escapeIdentifier(login)}`);
  runtimeUrl.username = login;
  runtimeUrl.password = password;
  const app = createPool(scratch.db);
  const clientDist = await mkdtemp(join(tmpdir(), 'studio-runtime-client-'));
  await writeFile(
    join(clientDist, 'index.html'),
    '<!doctype html><title>Studio runtime test shell</title>',
  );
  await completeSetup(
    app,
    token,
    {
      token,
      instanceName: 'Runtime test',
      ownerName: 'Owner',
      ownerEmail: 'runtime-owner@example.test',
      ownerPassword,
    },
    randomUUID(),
  );
  const ids = (
    await scratch.pool.query<{ owner: string; team: string }>(
      'SELECT initial_owner_user_id AS owner, initial_team_id AS team FROM studio_instance',
    )
  ).rows[0]!;
  return {
    ...scratch,
    db: { url: runtimeUrl.href, allowedLogins: [...allowedLogins, login] },
    ownerDb: { ...scratch.db, allowedLogins: [...allowedLogins, login] },
    app,
    clientDist,
    async enqueue() {
      const id = randomUUID();
      const email = `${id}@example.test`;
      const expiresAt = new Date(Date.now() + 60_000);
      await scratch.pool.query(
        `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id) VALUES ($1, $2, $3, 'member', 'pending', $4, $5)`,
        [id, ids.team, email, expiresAt, ids.owner],
      );
      await createTenantDb(app, ids.team).transaction((client) =>
        enqueueInvitationDelivery(client, {
          invitationId: id,
          teamId: ids.team,
          email,
          expiresAt,
          role: 'member',
          teamLabel: 'Runtime test',
          inviterLabel: 'Owner',
        }),
      );
      return id;
    },
    async dispose() {
      await app.end();
      await scratch.pool
        .query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(runtimeUrl.pathname.slice(1))} FROM ${escapeIdentifier(login)};
        DROP ROLE ${escapeIdentifier(login)}`);
      await scratch.dispose();
      await rm(clientDist, { recursive: true });
    },
  };
}

/** Real SMTP transport with its final acceptance response controlled by the test. */
async function smtpServer() {
  const connections = new Set<Socket>();
  const messages: { accept(): void }[] = [];
  const server = createServer((socket) => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
    socket.on('error', () => undefined);
    socket.write('220 studio.test ESMTP\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            data = false;
            messages.push({ accept: () => socket.write('250 accepted\r\n') });
          }
        } else if (line.startsWith('EHLO') || line.startsWith('HELO'))
          socket.write('250 studio.test\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 send message\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No SMTP port');
  return {
    url: `smtp://127.0.0.1:${address.port}`,
    messages,
    async stop() {
      for (const socket of connections) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('actual runtime role separation and drain', () => {
  it.each(['web', 'worker', 'both'])(
    'refuses an owner-backed %s before keys, workers or HTTP admission',
    async (role) => {
      const scratch = await fixture();
      const runtime = launch(scratch.ownerDb, await unusedPort(), role);
      try {
        expect(await runtime.started).toBe(false);
        expect(await runtime.finished).toBe(1);
        expect(runtime.records().at(-1)?.code).toBe(
          'STUDIO_DATABASE_IDENTITY_UNSAFE',
        );
        expect(runtime.errors()).toBe('');
      } finally {
        await runtime.stop();
        await scratch.dispose();
      }
    },
  );

  it('serves one web replica, keeps its queue untouched, and lets a worker deliver without exposing researcher routes', async () => {
    const scratch = await fixture();
    const smtp = await smtpServer();
    const invitationId = await scratch.enqueue();
    const web = launch(
      scratch.db,
      await unusedPort(),
      'web',
      smtp.url,
      scratch.clientDist,
    );
    let worker: ReturnType<typeof launch> | undefined;
    let duplicate: ReturnType<typeof launch> | undefined;
    try {
      expect(await web.started, JSON.stringify(web.records())).toBe(true);
      const client = createORPCClient<ContractRouterClient<typeof contract>>(
        new RPCLink({
          origin: web.origin,
          url: '/rpc',
          headers: { origin: web.origin },
        }),
      );
      expect((await client.status()).deployment.mode).toBe('self-hosted');
      const shell = await fetch(web.origin);
      expect(shell.status).toBe(200);
      expect(await shell.text()).toContain('Studio runtime test shell');
      for (const path of ['/setup', '/Setup/', '//setup'])
        expect((await fetch(`${web.origin}${path}`)).status).toBe(404);
      // An accidentally started worker polls immediately. There is no event for
      // an untouched row; pair this bounded absence with real delivery below.
      await delay(200);
      expect(
        (
          await scratch.pool.query(
            'SELECT attempt_count FROM team_invitation_deliveries WHERE invitation_id=$1',
            [invitationId],
          )
        ).rows[0],
      ).toEqual({ attempt_count: 0 });
      expect(smtp.messages).toHaveLength(0);
      duplicate = launch(scratch.db, await unusedPort(), 'both');
      expect(await duplicate.started).toBe(false);
      expect(await duplicate.finished).toBe(1);
      expect(duplicate.records().at(-1)?.code).toBe(
        'STUDIO_WEB_REPLICA_REFUSED',
      );
      worker = launch(
        scratch.db,
        await unusedPort(),
        'worker',
        smtp.url,
        scratch.clientDist,
      );
      expect(await worker.started, JSON.stringify(worker.records())).toBe(true);
      expect((await fetch(`${worker.origin}/healthz`)).status).toBe(200);
      for (const path of [
        '/rpc/status',
        '/api/auth/get-session',
        '/ws',
        '/setup',
        '/',
      ])
        expect((await fetch(`${worker.origin}${path}`)).status).toBe(404);
      await expect.poll(() => smtp.messages.length).toBe(1);
      smtp.messages[0]!.accept();
      await expect
        .poll(
          async () =>
            (
              await scratch.pool.query(
                'SELECT sent_at IS NOT NULL AS sent FROM team_invitation_deliveries WHERE invitation_id=$1',
                [invitationId],
              )
            ).rows[0]?.sent,
        )
        .toBe(true);
      expect(await worker.stop()).toBe(0);
      expect(await web.stop()).toBe(0);
      const replacement = launch(scratch.db, await unusedPort(), 'web');
      try {
        expect(
          await replacement.started,
          JSON.stringify(replacement.records()),
        ).toBe(true);
      } finally {
        await replacement.stop();
      }
    } finally {
      await Promise.all([worker?.stop(), duplicate?.stop(), web.stop()]);
      await smtp.stop();
      await scratch.dispose();
    }
  });

  it('closes actual WebSockets with 1001 and stops claims before waiting for HTTP and SMTP to drain', async () => {
    const scratch = await fixture();
    const smtp = await smtpServer();
    const first = await scratch.enqueue();
    const runtime = launch(scratch.db, await unusedPort(), 'both', smtp.url);
    let ws: WebSocket | undefined;
    let slow: ReturnType<typeof request> | undefined;
    try {
      expect(await runtime.started, JSON.stringify(runtime.records())).toBe(
        true,
      );
      await expect.poll(() => smtp.messages.length).toBe(1);
      const signIn = await fetch(`${runtime.origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'origin': runtime.origin,
        },
        body: JSON.stringify({
          email: 'runtime-owner@example.test',
          password: ownerPassword,
        }),
      });
      expect(signIn.status).toBe(200);
      const cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(cookie).not.toBe('');
      ws = new WebSocket(runtime.origin.replace('http:', 'ws:') + '/ws', {
        headers: { cookie, origin: runtime.origin },
      });
      await once(ws, 'open');
      const echo = once(ws, 'message');
      ws.send('runtime-drain-positive-control');
      expect(String((await echo)[0])).toBe('runtime-drain-positive-control');
      const wsClosed = once(ws, 'close');
      // This real request is intentionally incomplete so HTTP drain cannot
      // finish until the test releases it; a late worker stop would claim next.
      slow = request(`${runtime.origin}/rpc/status`, {
        method: 'POST',
        headers: {
          'origin': runtime.origin,
          'content-type': 'application/json',
        },
      });
      slow.on('error', () => undefined);
      slow.write('{"json":');
      await once(slow, 'socket');
      expect((await fetch(`${runtime.origin}/healthz`)).status).toBe(200);
      const second = await scratch.enqueue();
      runtime.child.kill('SIGTERM');
      expect((await wsClosed)[0]).toBe(1001);
      await expect
        .poll(
          async () =>
            (
              await scratch.pool.query(
                'SELECT uncertain_at IS NOT NULL AS uncertain, sent_at, last_error FROM team_invitation_deliveries WHERE invitation_id=$1',
                [first],
              )
            ).rows[0],
        )
        .toEqual({
          uncertain: true,
          sent_at: null,
          last_error: 'EMAIL_DELIVERY_UNCERTAIN',
        });
      // Cancellation after DATA persists a terminal uncertainty outcome. This
      // is the positive barrier before checking that no second claim occurs.
      await delay(200);
      expect(
        (
          await scratch.pool.query(
            'SELECT attempt_count FROM team_invitation_deliveries WHERE invitation_id=$1',
            [second],
          )
        ).rows[0],
      ).toEqual({ attempt_count: 0 });
      expect(smtp.messages).toHaveLength(1);
      slow.destroy();
      expect(await runtime.finished).toBe(0);
      expect(runtime.errors()).toBe('');
    } finally {
      slow?.destroy();
      ws?.terminate();
      await runtime.stop();
      await smtp.stop();
      await scratch.dispose();
    }
  });

  it('stops a web process when PostgreSQL releases its dedicated lock connection', async () => {
    const scratch = await fixture();
    const runtime = launch(scratch.db, await unusedPort(), 'web');
    try {
      expect(await runtime.started, JSON.stringify(runtime.records())).toBe(
        true,
      );
      const killed = await scratch.pool.query(
        `SELECT pg_terminate_backend(pid) AS killed FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
      );
      expect(killed.rows).toEqual([{ killed: true }]);
      expect(await runtime.finished).toBe(1);
      expect(runtime.records().at(-1)?.code).toBe('STUDIO_WEB_LEASE_LOST');
    } finally {
      await runtime.stop();
      await scratch.dispose();
    }
  });
});
