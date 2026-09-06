import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import {
  cp,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { request } from 'node:http';
import {
  createServer as httpsServer,
  request as httpsRequest,
} from 'node:https';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { resolveEncryptionEnv } from '../src/env/encryption.ts';
import { initializeEncryption } from '../src/pii/initialize.ts';
import type { KeysetConfiguration } from '../src/pii/keys.ts';
import { readParticipantPiiField } from '../src/pii/participants.ts';
import { isContactSuppressed } from '../src/pii/suppression.ts';
import { readWebhookSecret } from '../src/pii/webhooks.ts';
import { localDeployment, type Deployment } from './compose.ts';
import {
  canaries,
  commandContext,
  owner,
  populate,
  recordAsset,
  rpc,
  signIn,
} from './data.ts';

async function counts(deployment: Deployment) {
  const pools = await deployment.pools();
  try {
    return (
      await pools.admin.query<{
        instance: number;
        audit: number;
        credentials: number;
        migrations: number;
        refs: number;
      }>(`SELECT
      (SELECT count(*)::int FROM studio_instance) AS instance,
      (SELECT count(*)::int FROM audit_events) AS audit,
      (SELECT count(*)::int FROM credential_audit_events) AS credentials,
      (SELECT count(*)::int FROM studio_migrations.history) AS migrations,
      (SELECT count(*)::int FROM asset_references) AS refs`)
    ).rows[0]!;
  } finally {
    await pools.close();
  }
}

async function appendCurrentKeys(deployment: Deployment) {
  const values = await deployment.configuration();
  const keyset = JSON.parse(
    values.STUDIO_ENCRYPTION_KEYSET!,
  ) as KeysetConfiguration;
  const roots: Record<string, string> = {};
  for (const [namespace, prefix] of [
    ['pii', 'PII'],
    ['integration', 'INTEGRATION'],
    ['blindIndex', 'INDEX'],
  ] as const) {
    const reference = `STUDIO_ENCRYPTION_ROOT_${prefix}_V2`;
    const id = `${prefix.toLowerCase()}-v2`;
    keyset.roots.push({ id: `${id}-root`, reference });
    keyset[namespace].keys.push({ id, rootId: `${id}-root` });
    keyset[namespace].current = id;
    roots[reference] = randomBytes(32).toString('base64');
  }
  const content =
    Object.entries({
      ...Object.fromEntries(
        Object.entries(values).filter(([key]) =>
          key.startsWith('STUDIO_ENCRYPTION_ROOT_'),
        ),
      ),
      ...roots,
      STUDIO_ENCRYPTION_KEYSET: JSON.stringify(keyset),
    })
      .map(([key, value]) => `${key}='${value}'`)
      .join('\n') + '\n';
  await writeFile(
    join(deployment.directory, 'deployment/encryption.env'),
    content,
    { mode: 0o600 },
  );
  await deployment.compose([
    'run',
    '--rm',
    '--no-deps',
    'studio',
    'encryption',
    'verify',
  ]);
  return keyset;
}

async function overlapUploadAndBackup(
  deployment: Deployment,
  data: Awaited<ReturnType<typeof populate>>,
  cookie: string,
  backup: string,
  custody: string,
) {
  const bytes = Buffer.from(
    'A committed asset reference whose bytes finish during admission drain.',
  );
  const pools = await deployment.pools();
  // Model a committed reference with a still-active content-addressed upload.
  // Capturing the DB before that writer drains would restore a dangling ref.
  const hash = await recordAsset(pools.admin, data.team, data.owner, bytes);
  await pools.close();
  const ws = new WebSocket(`${deployment.origin.replace('http:', 'ws:')}/ws`, {
    headers: { cookie, origin: deployment.origin },
  });
  await once(ws, 'open');
  const echo = once(ws, 'message');
  ws.send('recovery-drain-barrier');
  expect(String((await echo)[0])).toBe('recovery-drain-barrier');
  const closed = once(ws, 'close');
  const upload = request(`${deployment.origin}/storage`, {
    method: 'POST',
    headers: {
      cookie,
      'origin': deployment.origin,
      'content-type': 'application/octet-stream',
    },
  });
  const result = new Promise<number | undefined>((resolve, reject) => {
    upload.on('response', (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    upload.on('error', reject);
  });
  // Cleanup may abort this request after a different assertion has failed.
  // Keep the original rejecting promise for the actual success assertion.
  void result.catch(() => undefined);
  upload.write(bytes.subarray(0, 4));
  await once(upload, 'socket');
  expect((await fetch(`${deployment.origin}/healthz`)).status).toBe(200);
  const captured = deployment.execute('sh', [
    'deployment/backup.sh',
    backup,
    custody,
  ]);
  try {
    const signal = await Promise.race([
      closed,
      captured.then(() => {
        throw new Error('Backup completed before admission drain.');
      }),
    ]);
    expect(
      signal[0],
      'WebSocket closure proves admission drain has begun',
    ).toBe(1001);
    upload.end(bytes.subarray(4));
    expect(
      await result,
      'the upload active at drain must finish before capture',
    ).toBe(201);
    await captured;
    return hash;
  } finally {
    ws.terminate();
    upload.destroy();
  }
}

async function syntheticWebhook(
  deployment: Deployment,
  data: Awaited<ReturnType<typeof populate>>,
) {
  const certificate = join(deployment.root, 'sink.crt');
  const privateKey = join(deployment.root, 'sink.key');
  await deployment.execute('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    privateKey,
    '-out',
    certificate,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ]);
  let verified = 0;
  const sink = httpsServer(
    { key: await readFile(privateKey), cert: await readFile(certificate) },
    (incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const payload = Buffer.concat(chunks).toString();
        const id = incoming.headers['webhook-id'];
        const timestamp = incoming.headers['webhook-timestamp'];
        if (typeof id !== 'string' || typeof timestamp !== 'string') {
          response.writeHead(400).end();
          return;
        }
        const expected = createHmac('sha256', canaries.webhook)
          .update(`${id}.${timestamp}.${payload}`)
          .digest('base64');
        if (
          incoming.headers['webhook-signature'] === `v1,${expected}` &&
          payload === '{"type":"interview.completed"}'
        )
          verified++;
        response.writeHead(verified === 1 ? 204 : 401).end();
      });
    },
  );
  sink.listen(0, '127.0.0.1');
  await once(sink, 'listening');
  const address = sink.address();
  if (!address || typeof address === 'string')
    throw new Error('No synthetic sink port');
  const pools = await deployment.pools();
  try {
    const keys = await initializeEncryption({
      maintenancePool: pools.maintenance,
      ...resolveEncryptionEnv(await deployment.configuration()),
    });
    const deliveryId = randomUUID();
    const leaseOwner = randomUUID();
    await pools.admin.query(
      "INSERT INTO webhook_deliveries (id, team_id, subscription_id, webhook_id, event_type, payload, lease_owner, lease_expires_at) VALUES ($1, $2, $3, $4, 'interview.completed', $5, $6, now() + interval '1 minute')",
      [
        deliveryId,
        data.team,
        data.subscriptionId,
        deliveryId,
        { type: 'interview.completed' },
        leaseOwner,
      ],
    );
    const secret = await readWebhookSecret(keys, data.subscriptionId, {
      kind: 'delivery',
      maintenancePool: pools.maintenance,
      teamId: data.team,
      deliveryId,
      leaseOwner,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = '{"type":"interview.completed"}';
    const signature = createHmac('sha256', secret)
      .update(`${deliveryId}.${timestamp}.${payload}`)
      .digest('base64');
    secret.fill(0);
    const ca = await readFile(certificate);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = httpsRequest(
        `https://127.0.0.1:${address.port}`,
        {
          method: 'POST',
          ca,
          headers: {
            'webhook-id': deliveryId,
            'webhook-timestamp': timestamp,
            'webhook-signature': `v1,${signature}`,
          },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        },
      );
      outgoing.on('error', reject);
      outgoing.end(payload);
    });
    expect(status).toBe(204);
    expect(verified).toBe(1);
  } finally {
    await pools.close();
    await new Promise<void>((resolve) => sink.close(() => resolve()));
  }
}

it('runs recovery commands without inherited primary-account credentials or Docker credential helpers', async () => {
  vi.stubEnv(
    'STUDIO_PRIMARY_ACCOUNT_RECOVERY_TOKEN',
    'synthetic-unavailable-token',
  );
  try {
    const deployment = await localDeployment('custody-environment');
    const result = await deployment.execute('node', [
      '-e',
      // macOS adds its text-encoding hint to child processes independently of
      // the supplied environment; it is not an inherited account credential.
      "process.stdout.write(JSON.stringify(Object.keys(process.env).filter((key) => key !== '__CF_USER_TEXT_ENCODING').sort()))",
    ]);
    expect(JSON.parse(result.stdout.toString())).toEqual([
      'COMPOSE_FILE',
      'COMPOSE_PROJECT_NAME',
      'DOCKER_CONFIG',
      'DOCKER_HOST',
      'MINIO_IMAGE',
      'PATH',
      'STUDIO_IMAGE',
      'STUDIO_PROXY_IP',
      'STUDIO_PROXY_SUBNET',
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(deployment.root, 'credential-free-docker/config.json'),
          'utf8',
        ),
      ),
    ).toEqual({});
  } finally {
    vi.unstubAllEnvs();
  }
});

it('installs an immutable built image, drains a populated backup and restores all historical key purposes and referenced bytes into fresh volumes', async () => {
  const source = await localDeployment('source');
  const restored = await localDeployment('restore');
  const backup = join(source.root, 'backup');
  const custody = join(source.root, 'independent-custody', 'encryption.env');
  try {
    const token = await source.configure();
    await source.overlay();
    await source.compose(['config', '--quiet']);
    await source.compose(['up', '-d', '--wait', 'postgres']);
    await source.compose(['up', '-d', 'minio-init']);
    await source.compose([
      '-f',
      'deployment/migrate.yml',
      'run',
      '--rm',
      '--no-deps',
      'studio',
      'migrate',
    ]);
    await source.compose([
      'run',
      '--rm',
      '--no-deps',
      'studio',
      'encryption',
      'verify',
    ]);
    await source.compose(['up', '-d', 'studio', 'probe']);
    await source.ready();
    const initialPools = await source.pools();
    try {
      expect(
        (
          await initialPools.app.query(
            "SELECT current_setting('shared_buffers') AS buffers, current_setting('work_mem') AS work, current_setting('max_connections') AS connections",
          )
        ).rows,
      ).toEqual([{ buffers: '1GB', work: '256MB', connections: '50' }]);
      const flags = (
        await initialPools.admin.query<{
          rolname: string;
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolbypassrls: boolean;
          rolreplication: boolean;
          rolinherit: boolean;
        }>(
          "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication, rolinherit FROM pg_roles WHERE rolname IN ('studio_runtime', 'studio_migrator', 'studio_backup_login') ORDER BY rolname",
        )
      ).rows;
      expect(flags).toHaveLength(3);
      for (const row of flags)
        expect(row).toMatchObject({
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
          rolreplication: false,
          rolinherit: false,
        });
      await expect(
        initialPools.app.query(
          'CREATE TABLE forbidden_runtime_ddl (id integer)',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        initialPools.app.query('SELECT * FROM studio_migrations.history'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        initialPools.maintenance.query(
          'UPDATE "schemaFingerprint" SET fingerprint = fingerprint',
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await initialPools.close();
    }
    expect((await fetch(`${source.origin}/setup`)).status).toBe(200);
    expect(await rpc(source.origin).setup.status()).toEqual({ state: 'ready' });
    expect(
      await rpc(source.origin).setup.complete({
        token,
        instanceName: 'Qualification instance',
        ownerName: owner.name,
        ownerEmail: owner.email,
        ownerPassword: owner.password,
      }),
    ).toEqual({ state: 'complete' });
    expect((await fetch(`${source.origin}/setup`)).status).toBe(404);
    const cookie = await signIn(source.origin);
    expect((await rpc(source.origin, cookie).me()).email).toBe(owner.email);
    const unsafeSignup = await fetch(
      `${source.origin}/api/auth/sign-up/email`,
      {
        method: 'POST',
        headers: {
          'origin': source.origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ...owner, email: 'uninvited@example.test' }),
      },
    );
    expect(unsafeSignup.status).toBe(400);
    const outsidePools = await source.pools();
    const outside = await outsidePools.admin.connect();
    const refusedBackup = join(source.root, 'refused-active-writer');
    try {
      // NOLOGIN does not evict an already connected operator. Retaining this
      // real session proves the capture guard catches that separate boundary.
      await outside.query('SELECT current_database()');
      const refused = await source.execute(
        'sh',
        [
          'deployment/backup.sh',
          refusedBackup,
          join(source.root, 'refused-active-writer-keys.env'),
        ],
        { failure: true },
      );
      expect(refused.code).not.toBe(0);
      expect(refused.stderr.toString()).toContain(
        'Backup refused: an outside database session remains',
      );
      await expect(stat(join(refusedBackup, 'COMPLETE'))).rejects.toMatchObject(
        { code: 'ENOENT' },
      );
      await outside.query(
        'ALTER ROLE studio_migrator LOGIN; ALTER ROLE studio_runtime LOGIN',
      );
    } finally {
      outside.release();
      await outsidePools.close();
    }
    await source.compose(['up', '-d', 'studio']);
    await source.ready();
    const data = await populate(source, cookie);
    const historical = await appendCurrentKeys(source);
    const baseline = await counts(source);
    expect(baseline.instance).toBe(1);
    expect(baseline.audit).toBeGreaterThan(0);
    expect(baseline.credentials).toBeGreaterThan(0);
    expect(baseline.migrations).toBeGreaterThanOrEqual(5);
    expect(baseline.refs).toBe(1);
    const overlapHash = await overlapUploadAndBackup(
      source,
      data,
      cookie,
      backup,
      custody,
    );
    expect(await readFile(join(backup, 'COMPLETE'), 'utf8')).toContain(
      'quiesced backup',
    );
    expect((await stat(custody)).mode & 0o777).toBe(0o600);
    const sourceConfiguration = await source.configuration();
    const roots = Object.entries(sourceConfiguration)
      .filter(([name]) => name.startsWith('STUDIO_ENCRYPTION_ROOT_'))
      .map(([, value]) => {
        if (!value) throw new Error('A configured recovery root is missing.');
        return value;
      });
    expect(roots).toHaveLength(6);
    const files = await readdir(backup, {
      recursive: true,
      withFileTypes: true,
    });
    const dataFiles = files.filter((entry) => entry.isFile());
    expect(dataFiles.length).toBeGreaterThan(10);
    const forbiddenBytes = roots.flatMap((root) => [
      Buffer.from(root),
      Buffer.from(root, 'base64'),
    ]);
    const retainedBytes =
      Math.max(...forbiddenBytes.map((bytes) => bytes.length)) - 1;
    for (const entry of dataFiles) {
      // Image archives are large. Include boundary-spanning matches without
      // loading the whole recovery artifact into the test process's memory.
      let tail = Buffer.alloc(0);
      let found = false;
      for await (const chunk of createReadStream(
        join(entry.parentPath, entry.name),
      )) {
        if (!Buffer.isBuffer(chunk)) throw new Error('Expected backup bytes.');
        const bytes = Buffer.concat([tail, chunk]);
        if (forbiddenBytes.some((secret) => bytes.includes(secret))) {
          found = true;
          break;
        }
        tail = bytes.subarray(-retainedBytes);
      }
      expect(found, `Recovery roots must be absent from ${entry.name}`).toBe(
        false,
      );
    }
    expect((await stat(join(backup, 'images.tar'))).size).toBeGreaterThan(
      100 * 1024 ** 2,
    );
    const imageReferences = (await readFile(join(backup, 'images.txt'), 'utf8'))
      .trim()
      .split('\n');
    expect(imageReferences.length).toBeGreaterThanOrEqual(5);
    expect(imageReferences).toEqual(
      expect.arrayContaining([source.images.studio, source.images.minio]),
    );
    const imageIds = (await readFile(join(backup, 'images.ids'), 'utf8'))
      .trim()
      .split('\n');
    expect(imageIds.length).toBeGreaterThanOrEqual(5);
    expect(imageIds.every((id) => /^sha256:[a-f0-9]{64}$/.test(id))).toBe(true);
    expect(files.some((entry) => entry.name === 'encryption.env')).toBe(false);
    const dataOnlyConfiguration = parseEnv(
      await readFile(join(backup, '.env'), 'utf8'),
    );
    expect(() => resolveEncryptionEnv(dataOnlyConfiguration)).toThrow();
    const rendered = await source.compose(
      [
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '--entrypoint',
        'pg_restore',
        '--volume',
        `${backup}:/backup:ro`,
        'postgres',
        '-f',
        '-',
        '/backup/studio.dump',
      ],
      { privateOutput: true },
    );
    expect(rendered.stdout.includes(Buffer.from(data.participantId))).toBe(
      true,
    );
    for (const protectedValue of [
      canaries.contact,
      canaries.oauth,
      canaries.webhook.toString(),
    ]) {
      expect(rendered.stdout.includes(Buffer.from(protectedValue))).toBe(false);
      expect(
        rendered.stdout.includes(
          Buffer.from(Buffer.from(protectedValue).toString('hex')),
        ),
      ).toBe(false);
    }
    // Restore the same key/configuration backup in a second, empty project.
    for (const name of [
      '.env',
      'docker-compose.yml',
      'SELF_HOSTING.md',
      'MIGRATIONS.md',
      'BACKUPS.md',
      'deployment',
    ])
      await cp(join(backup, name), join(restored.directory, name), {
        recursive: true,
      });
    await restored.overlay();
    const missingCustody = await restored.execute(
      'sh',
      ['deployment/restore.sh', backup, join(source.root, 'missing-keys.env')],
      { failure: true },
    );
    expect(missingCustody.code).not.toBe(0);
    const wrongCustody = join(source.root, 'wrong-custody.env');
    await writeFile(wrongCustody, 'STUDIO_ENCRYPTION_KEYSET=wrong\n', {
      mode: 0o600,
    });
    const wrongKeyCopy = await restored.execute(
      'sh',
      ['deployment/restore.sh', backup, wrongCustody],
      { failure: true },
    );
    expect(wrongKeyCopy.code).not.toBe(0);
    expect(wrongKeyCopy.stderr.toString()).toContain(
      'independent key custody does not match',
    );
    // No PostgreSQL process may start before custody is authenticated.
    expect(
      (
        await restored.execute(
          'docker',
          [
            'ps',
            '--filter',
            `label=com.docker.compose.project=${restored.project}`,
            '--format',
            '{{.Names}}',
          ],
          { privateOutput: true },
        )
      ).stdout
        .toString()
        .trim(),
    ).toBe('');
    const originalDump = await readFile(join(backup, 'studio.dump'));
    await writeFile(
      join(backup, 'studio.dump'),
      originalDump.subarray(0, originalDump.length - 1),
    );
    const truncated = await restored.execute(
      'sh',
      ['deployment/restore.sh', backup, custody],
      { failure: true },
    );
    expect(truncated.code).not.toBe(0);
    expect(truncated.stdout.toString()).toContain('studio.dump: FAILED');
    // Replace the damaged inode atomically. Docker Desktop can retain a bind
    // mount's truncated pages when the host repairs that same inode in place.
    const repairedDump = join(backup, 'studio.dump.repaired');
    await writeFile(repairedDump, originalDump);
    await rename(repairedDump, join(backup, 'studio.dump'));
    // All source images are still warm in this Docker daemon. A valid archive
    // containing only PostgreSQL must fail before any target process starts;
    // merely inspecting the expected image names would pass from that cache.
    const completeImages = join(source.root, 'complete-images.tar');
    const imageArchive = join(backup, 'images.tar');
    const checksumPath = join(backup, 'SHA256SUMS');
    const originalChecksums = await readFile(checksumPath, 'utf8');
    await rename(imageArchive, completeImages);
    try {
      const postgresImage = (
        await source.compose(['config', '--images', 'postgres'])
      ).stdout
        .toString()
        .trim();
      expect(imageReferences).toContain(postgresImage);
      await source.execute('docker', [
        'image',
        'save',
        '--output',
        imageArchive,
        postgresImage,
      ]);
      const subsetHash = createHash('sha256');
      for await (const chunk of createReadStream(imageArchive))
        subsetHash.update(chunk);
      const archiveEntry = /^[a-f0-9]{64}(  \.\/images\.tar)$/m;
      expect(originalChecksums.match(archiveEntry)).not.toBeNull();
      await writeFile(
        checksumPath,
        originalChecksums.replace(
          archiveEntry,
          `${subsetHash.digest('hex')}$1`,
        ),
      );
      const incomplete = await restored.execute(
        'sh',
        ['deployment/restore.sh', backup, custody],
        { failure: true },
      );
      expect(incomplete.code).not.toBe(0);
      expect(incomplete.stderr.toString()).toContain(
        'retained image archive is incomplete or mismatched',
      );
      expect(
        (
          await restored.execute('docker', [
            'ps',
            '-a',
            '--filter',
            `label=com.docker.compose.project=${restored.project}`,
            '--format',
            '{{.Names}}',
          ])
        ).stdout
          .toString()
          .trim(),
      ).toBe('');
    } finally {
      await rename(completeImages, imageArchive);
      await writeFile(checksumPath, originalChecksums);
    }
    const restoredResult = await restored.execute('sh', [
      'deployment/restore.sh',
      backup,
      custody,
    ]);
    expect(restoredResult.stdout.toString()).toMatch(/Loaded image(?: ID)?:/);
    expect(await counts(restored)).toEqual({ ...baseline, refs: 2 });
    const populatedRestore = await restored.execute(
      'sh',
      ['deployment/restore.sh', backup, custody],
      { failure: true },
    );
    expect(populatedRestore.code).not.toBe(0);
    expect(populatedRestore.stderr.toString()).toContain(
      'Restore requires an empty database',
    );
    expect(await counts(restored)).toEqual({ ...baseline, refs: 2 });
    const quarantine = [
      '-f',
      'deployment/recovery-images.yml',
      '-f',
      'deployment/quarantine.yml',
    ];
    const recoveredImages = await restored.compose([
      ...quarantine,
      'config',
      '--images',
    ]);
    expect(
      [...new Set(recoveredImages.stdout.toString().trim().split('\n'))].sort(),
    ).toEqual([...imageIds].sort());
    for (const namespace of ['pii', 'integration', 'blindIndex'] as const) {
      const missing = structuredClone(historical);
      missing[namespace].keys = missing[namespace].keys.filter(
        ({ id }) => !id.endsWith('-v1'),
      );
      const failed = await restored.compose(
        [
          ...quarantine,
          'run',
          '--rm',
          '--no-deps',
          '-e',
          `STUDIO_ENCRYPTION_KEYSET=${JSON.stringify(missing)}`,
          'studio',
          'serve',
        ],
        { failure: true },
      );
      expect(
        failed.code,
        `missing historical ${namespace} must refuse built-image startup`,
      ).not.toBe(0);
      expect(failed.stdout.toString()).toContain('STUDIO_ENCRYPTION_INVALID');
      expect(failed.stdout.toString()).not.toContain('STUDIO_SERVER_STARTED');
    }
    for (const purpose of ['PII', 'INTEGRATION', 'INDEX']) {
      const failed = await restored.compose(
        [
          ...quarantine,
          'run',
          '--rm',
          '--no-deps',
          '-e',
          `STUDIO_ENCRYPTION_ROOT_${purpose}_V1=${Buffer.alloc(32, 7).toString('base64')}`,
          'studio',
          'serve',
        ],
        { failure: true },
      );
      expect(
        failed.code,
        `wrong historical ${purpose} root must refuse built-image startup`,
      ).not.toBe(0);
      expect(failed.stdout.toString()).toContain('STUDIO_ENCRYPTION_INVALID');
      expect(failed.stdout.toString()).not.toContain('STUDIO_SERVER_STARTED');
    }
    await restored.compose([
      ...quarantine,
      'run',
      '--rm',
      '--no-deps',
      'studio',
      'encryption',
      'verify',
    ]);
    await restored.compose([...quarantine, 'up', '-d', 'studio', 'probe']);
    await restored.ready();
    expect((await fetch(`${restored.origin}/setup`)).status).toBe(404);
    const recoveredCookie = await signIn(restored.origin);
    const oauth = await fetch(`${restored.origin}/api/auth/get-access-token`, {
      method: 'POST',
      headers: {
        'origin': restored.origin,
        'cookie': recoveredCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accountId: data.accountId }),
    });
    expect(oauth.status).toBe(200);
    expect(await oauth.json()).toMatchObject({ accessToken: canaries.oauth });
    const pools = await restored.pools();
    try {
      const keys = await initializeEncryption({
        maintenancePool: pools.maintenance,
        ...resolveEncryptionEnv(await restored.configuration()),
      });
      expect(
        (
          await readParticipantPiiField(
            keys,
            commandContext(pools.app, data.team, data.owner),
            {
              studyId: data.studyId,
              participantId: data.participantId,
              column: 'email_ciphertext',
            },
          )
        )?.toString(),
      ).toBe(canaries.contact);
      expect(
        await isContactSuppressed(pools.maintenance, keys, {
          kind: 'email',
          value: canaries.contact,
        }),
      ).toBe(true);
      const references = (
        await pools.admin.query<{ asset_hash: string }>(
          'SELECT asset_hash FROM asset_references',
        )
      ).rows;
      expect(references).toHaveLength(2);
      expect(new Set(references.map((item) => item.asset_hash))).toEqual(
        new Set([data.assetHash, overlapHash]),
      );
      for (const { asset_hash: hash } of references) {
        const bytes = await fetch(`${restored.origin}/storage/${hash}`);
        expect(bytes.status).toBe(200);
        expect(
          createHash('sha256')
            .update(Buffer.from(await bytes.arrayBuffer()))
            .digest('hex'),
        ).toBe(hash);
      }
    } finally {
      await pools.close();
    }
    await syntheticWebhook(restored, data);
    const recoveredCounts = await counts(restored);
    expect(recoveredCounts.credentials).toBeGreaterThan(baseline.credentials);
    expect(recoveredCounts.audit).toBeGreaterThan(baseline.audit);
    await writeFile(
      join(source.root, 'result.json'),
      JSON.stringify(
        {
          source: source.project,
          restored: restored.project,
          baseline,
          recoveredCounts,
          historicalPurposes: 3,
          referencedAssets: 2,
          signedSyntheticWebhook: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([source.dispose(), restored.dispose()]);
  }
});
