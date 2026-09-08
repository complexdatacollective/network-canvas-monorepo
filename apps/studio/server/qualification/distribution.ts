import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { Pool } from 'pg';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import {
  createTemplateArtifact,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';

import { privateDirectory } from '../../deployment/installer/files.mjs';
import { executeOperation } from '../../deployment/installer/operation.mjs';
import { sha256 } from '../../deployment/installer/release.mjs';
import { createMaintenancePool, createPool } from '../src/db/pool.ts';
import recoveryFixture from './combined-recovery.fixture.json' with { type: 'json' };
import { owner, populate, rpc } from './data.ts';

const DEADLINE = 300_000;

function numericProperty(value: unknown, name: string) {
  if (!value || typeof value !== 'object')
    throw new Error('Combined qualification count evidence is invalid.');
  const property = Reflect.get(value, name);
  if (typeof property !== 'number')
    throw new Error('Combined qualification count evidence is invalid.');
  return property;
}

export function assertRecoveredDistributionEvidence({
  studioCanary,
  registryCanary,
  studioWriterLoginsClosed,
  registryWriterLoginsClosed,
  runningServices,
}: {
  studioCanary: string;
  registryCanary: string;
  studioWriterLoginsClosed: string;
  registryWriterLoginsClosed: string;
  runningServices: string[];
}) {
  let registry: unknown;
  try {
    registry = JSON.parse(registryCanary);
  } catch {
    throw new Error('Combined qualification restore evidence is invalid.');
  }
  if (
    studioCanary !== recoveryFixture.studio.participantCode ||
    numericProperty(registry, 'entries') !== 1 ||
    numericProperty(registry, 'sessions') !== 0 ||
    numericProperty(registry, 'verifications') !== 0 ||
    numericProperty(registry, 'activeCredentials') !== 0 ||
    studioWriterLoginsClosed !== 't' ||
    registryWriterLoginsClosed !== 't' ||
    runningServices.toSorted().join(',') !==
      'minio,postgres,registry-minio,registry-postgres'
  )
    throw new Error('Combined qualification restore evidence is invalid.');
}

export function assertDistributionUpgradeCanaries(
  observed: {
    ownerId: string | undefined;
    ownerEmail: string | undefined;
    teamId: string | undefined;
    participantCode: string | undefined;
    objectBytes: Uint8Array;
  },
  expected: { ownerId: string; teamId: string },
) {
  if (
    observed.ownerId !== expected.ownerId ||
    observed.ownerEmail !== owner.email ||
    observed.teamId !== expected.teamId ||
    observed.participantCode !== recoveryFixture.studio.participantCode ||
    !Buffer.from(observed.objectBytes).equals(
      Buffer.from(recoveryFixture.studio.object.bytesBase64, 'base64'),
    )
  )
    throw new Error('Distribution upgrade lost a populated canary.');
}

export function executeDistributionRestore(
  execute: (
    program: string,
    args: string[],
    options?: ExecutionOptions,
  ) => string,
  {
    script,
    backup,
    keyCustody,
    registryCustody,
    reconciliation,
    reconciliationSha256,
    directory,
    project,
  }: {
    script: string;
    backup: string;
    keyCustody: string;
    registryCustody: string;
    reconciliation: string;
    reconciliationSha256: string;
    directory: string;
    project: string;
  },
) {
  return execute(
    'sh',
    [
      script,
      backup,
      keyCustody,
      registryCustody,
      reconciliation,
      reconciliationSha256,
    ],
    { cwd: directory, env: { COMPOSE_PROJECT_NAME: project } },
  );
}

type ExecutionOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  timeout?: number;
  killSignal?: NodeJS.Signals | number;
};

function localPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Local qualification port allocation failed.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function dockerEnvironment(root: string, overlay: string) {
  const socket = execFileSync(
    'docker',
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
    { encoding: 'utf8', timeout: 30_000 },
  ).trim();
  if (!socket.startsWith('unix://'))
    throw new Error('Distribution qualification requires local Unix Docker.');
  const plugins: unknown = JSON.parse(
    execFileSync(
      'docker',
      ['info', '--format', '{{json .ClientInfo.Plugins}}'],
      { encoding: 'utf8', timeout: 30_000 },
    ),
  );
  if (!Array.isArray(plugins))
    throw new Error('Distribution qualification requires Docker Compose.');
  const compose = plugins.find(
    (plugin: unknown) =>
      plugin !== null &&
      typeof plugin === 'object' &&
      'Name' in plugin &&
      plugin.Name === 'compose' &&
      'Path' in plugin &&
      typeof plugin.Path === 'string',
  );
  if (!compose || typeof compose !== 'object' || !('Path' in compose))
    throw new Error('Distribution qualification requires Docker Compose.');
  const configuration = join(root, 'docker');
  mkdirSync(join(configuration, 'cli-plugins'), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(join(configuration, 'config.json'), '{}\n', {
    flag: 'wx',
    mode: 0o600,
  });
  symlinkSync(
    String(compose.Path),
    join(configuration, 'cli-plugins/docker-compose'),
  );
  const realDocker = execFileSync('which', ['docker'], {
    encoding: 'utf8',
    timeout: 30_000,
  }).trim();
  const bin = join(root, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  symlinkSync(
    fileURLToPath(
      new URL(
        '../../../../scripts/studio-local-docker-wrapper.mjs',
        import.meta.url,
      ),
    ),
    join(bin, 'docker'),
  );
  return {
    PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    DOCKER_HOST: socket,
    DOCKER_CONFIG: configuration,
    STUDIO_QUALIFICATION_DOCKER: realDocker,
    STUDIO_QUALIFICATION_COMPOSE_OVERLAY: overlay,
  };
}

async function waitForReady(origin: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if (
        (
          await fetch(`${origin}/readyz`, {
            signal: AbortSignal.timeout(1_000),
          })
        ).status === 200
      )
        return;
    } catch {
      // A new container has a bounded connection-refused interval.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Distribution qualification service did not become ready.');
}

async function scenario(label: string, cosign: string) {
  const root = mkdtempSync(join(tmpdir(), `studio-distribution-${label}-`));
  chmodSync(root, 0o700);
  const installation = privateDirectory(join(root, 'installation'));
  const backups = privateDirectory(join(root, 'backups'));
  const keys = privateDirectory(join(root, 'keys'));
  const credentials = join(root, 'credentials.json');
  writeFileSync(
    credentials,
    `${JSON.stringify({ email: owner.email, password: owner.password })}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  const project = `studio-${sha256(installation).slice(0, 24)}`;
  const webPort = await localPort();
  const databasePort = await localPort();
  const registryDatabasePort = await localPort();
  const origin = `http://127.0.0.1:${webPort}`;
  const overlay = join(root, 'qualification.yml');
  writeFileSync(
    overlay,
    `services:
  studio:
    ports: !override ["127.0.0.1:${webPort}:3000"]
    environment:
      PUBLIC_URL: ${origin}
      STUDIO_TELEMETRY: 'off'
      GOOGLE_CLIENT_ID: synthetic-qualification-client
      GOOGLE_CLIENT_SECRET: synthetic-qualification-secret
  worker:
    environment:
      STUDIO_TELEMETRY: 'off'
  postgres:
    ports: !override ["127.0.0.1:${databasePort}:5432"]
  registry-postgres:
    ports: !override ["127.0.0.1:${registryDatabasePort}:5432"]
  traefik:
    ports: !reset []
`,
    { flag: 'wx', mode: 0o600 },
  );
  const environment = dockerEnvironment(root, overlay);
  const extraCleanup: (() => void)[] = [];
  const configurations = new Set<string>();
  const execute = (
    program: string,
    args: string[],
    options: ExecutionOptions = {},
  ) => {
    const selectedProgram = program === 'cosign' ? cosign : program;
    const selectedArgs = [...args];
    return execFileSync(selectedProgram, selectedArgs, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: DEADLINE,
      killSignal: 'SIGKILL',
      ...options,
      env: {
        ...options.env,
        ...environment,
      },
    });
  };
  const compose = (
    configuration: string,
    args: string[],
    options: ExecutionOptions = {},
  ) =>
    execute(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '--env-file',
        join(configuration, '.env'),
        '--env-file',
        join(configuration, 'registry.env'),
        '-f',
        join(configuration, 'docker-compose.yml'),
        '-f',
        join(configuration, 'deployment/registry/compose.yml'),
        '-f',
        join(configuration, 'deployment/release-images.yml'),
        '--profile',
        '*',
        ...args,
      ],
      options,
    );
  const operationOptions = (bundleDirectory: string, digest: string) => ({
    directory: installation,
    bundleDirectory,
    expectedDigest: digest,
    domain: 'studio.example.test',
    email: 'operator@example.test',
    registryDomain: 'registry.example.test',
    registryMailFrom: 'Registry <registry@example.test>',
    registrySmtpUrl: 'smtp://127.0.0.1:2525',
    credentialsFile: credentials,
    backupDirectory: backups,
    keyCustodyDirectory: keys,
  });
  async function setup(result: ReturnType<typeof executeOperation>) {
    if (
      !result.setup ||
      typeof result.setup !== 'object' ||
      !('bootstrapToken' in result.setup) ||
      typeof result.setup.bootstrapToken !== 'string' ||
      !result.setup.bootstrapToken
    )
      throw new Error('Fresh qualification did not return bootstrap custody.');
    await waitForReady(origin);
    const client = rpc(origin);
    const completed = await client.setup.complete({
      token: result.setup.bootstrapToken,
      instanceName: 'Local distribution qualification',
      ownerName: owner.name,
      ownerEmail: owner.email,
      ownerPassword: owner.password,
    });
    if (completed?.state !== 'complete')
      throw new Error('Fresh qualification setup was incomplete.');
  }
  async function deployment(configuration: string) {
    const values = {
      ...parseEnv(readFileSync(join(configuration, '.env'), 'utf8')),
      ...parseEnv(
        readFileSync(join(configuration, 'deployment/encryption.env'), 'utf8'),
      ),
    };
    return {
      origin,
      configuration: async () => values,
      pools: async () => {
        const address = `127.0.0.1:${databasePort}/studio`;
        const db = {
          url: `postgresql://studio_runtime:${values.STUDIO_DATABASE_PASSWORD}@${address}`,
        };
        const admin = new Pool({
          connectionString: `postgresql://postgres:${values.POSTGRES_PASSWORD}@${address}`,
          connectionTimeoutMillis: 10_000,
        });
        const app = createPool(db);
        const maintenance = createMaintenancePool(db);
        return {
          admin,
          app,
          maintenance,
          close: async () => {
            await Promise.all([admin.end(), app.end(), maintenance.end()]);
          },
        };
      },
    };
  }
  return {
    root,
    installation,
    backups,
    keys,
    credentials,
    project,
    origin,
    registryDatabasePort,
    execute,
    compose,
    operationOptions,
    setup,
    deployment,
    registerConfiguration: (configuration: string) =>
      configurations.add(configuration),
    registerCleanup: (cleanup: () => void) => extraCleanup.push(cleanup),
    dispose: () => {
      for (const cleanup of extraCleanup.toReversed()) {
        try {
          cleanup();
        } catch {
          // Continue cleaning independently named qualification projects.
        }
      }
      for (const configuration of [...configurations].toReversed()) {
        try {
          compose(configuration, ['down', '--volumes', '--remove-orphans']);
        } catch {
          // Another generation may already have removed the shared project.
        }
      }
      try {
        execute('docker', [
          'compose',
          '--project-name',
          project,
          '-f',
          overlay,
          '--profile',
          '*',
          'down',
          '--volumes',
          '--remove-orphans',
        ]);
      } catch {
        // Preserve the original failure; the randomized project remains named.
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

async function exerciseInstall(
  selected: { bundleDirectory: string; current: { digest: string } },
  candidate: { bundleDirectory: string; current: { digest: string } },
  cosign: string,
  populateCandidate: boolean,
) {
  const fixture = await scenario(randomBytes(4).toString('hex'), cosign);
  try {
    const first = executeOperation(
      fixture.operationOptions(
        selected.bundleDirectory,
        selected.current.digest,
      ),
      fixture.execute,
    );
    fixture.registerConfiguration(first.configuration);
    await fixture.setup(first);
    const response = await fetch(`${fixture.origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'origin': fixture.origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: owner.email, password: owner.password }),
    });
    if (response.status !== 200)
      throw new Error('Populated qualification could not authenticate owner.');
    const cookie = response.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');
    const populated = await populate(
      await fixture.deployment(first.configuration),
      cookie,
      {
        protocolId: recoveryFixture.studio.protocolId,
        studyId: recoveryFixture.studio.studyId,
        participantId: recoveryFixture.studio.participantId,
        participantCode: recoveryFixture.studio.participantCode,
        asset: Buffer.from(recoveryFixture.studio.object.bytesBase64, 'base64'),
      },
    );
    if (populateCandidate) {
      // Combined recovery is deliberately a separate helper below; reaching
      // this point proves the source estate contains database and object data.
      await exerciseCombinedRecovery(fixture, first.configuration);
    } else if (selected.current.digest !== candidate.current.digest) {
      const updated = executeOperation(
        fixture.operationOptions(
          candidate.bundleDirectory,
          candidate.current.digest,
        ),
        fixture.execute,
      );
      fixture.registerConfiguration(updated.configuration);
      if (updated.release !== candidate.current.digest)
        throw new Error('Distribution upgrade selected the wrong release.');
      await waitForReady(fixture.origin);
      await assertUpgradeCanaries(
        fixture,
        updated.configuration,
        populated.owner,
        populated.team,
        populated.participantId,
        populated.assetHash,
      );
    }
  } finally {
    fixture.dispose();
  }
}

async function assertUpgradeCanaries(
  fixture: Awaited<ReturnType<typeof scenario>>,
  configuration: string,
  ownerId: string,
  teamId: string,
  participantId: string,
  assetHash: string,
) {
  const deployment = await fixture.deployment(configuration);
  const pools = await deployment.pools();
  try {
    const result = await pools.admin.query<{
      owner_id: string;
      owner_email: string;
      team_id: string;
      participant_code: string;
    }>(
      `SELECT instance.initial_owner_user_id AS owner_id,
              owner.email AS owner_email,
              instance.initial_team_id AS team_id,
              participant.participant_code
         FROM studio_instance AS instance
         JOIN public."user" AS owner
           ON owner.id = instance.initial_owner_user_id
         JOIN teams AS team ON team.id = instance.initial_team_id
         JOIN participants AS participant
           ON participant.id = $1 AND participant.team_id = team.id`,
      [participantId],
    );
    if (result.rows.length !== 1)
      throw new Error('Distribution upgrade lost a populated canary.');
    const object = await fetch(`${fixture.origin}/storage/${assetHash}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (object.status !== 200)
      throw new Error('Distribution upgrade lost a populated canary.');
    assertDistributionUpgradeCanaries(
      {
        ownerId: result.rows[0]?.owner_id,
        ownerEmail: result.rows[0]?.owner_email,
        teamId: result.rows[0]?.team_id,
        participantCode: result.rows[0]?.participant_code,
        objectBytes: new Uint8Array(await object.arrayBuffer()),
      },
      { ownerId, teamId },
    );
  } finally {
    await pools.close();
  }
}

async function exerciseCombinedRecovery(
  fixture: Awaited<ReturnType<typeof scenario>>,
  configuration: string,
) {
  const artifact = await createTemplateArtifact({
    template: { name: 'Recovery qualification', kind: 'protocol', version: 1 },
    metadata: {
      schema_version: 1,
      authors: [{ name: 'Qualification operator' }],
      description: 'Synthetic local distribution recovery evidence.',
      keywords: ['recovery'],
    },
    license: 'CC0-1.0',
    sections: {
      'settings': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: 'Recovery qualification',
      },
      'stageOrder': { stages: ['welcome'] },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'text', type: 'text', content: 'Synthetic recovery.' }],
      },
    },
    assets: [
      {
        source: recoveryFixture.registry.object.key,
        media_type: 'application/octet-stream',
        media_class: 'dataset',
        bytes: Buffer.from(
          recoveryFixture.registry.object.bytesBase64,
          'base64',
        ),
      },
    ],
  });
  const rawHash = templateBytesHash(artifact.bytes);
  const artifactRoot = artifact.artifact.manifest.merkle_root;
  const registryEnv = parseEnv(
    readFileSync(join(configuration, 'registry.env'), 'utf8'),
  );
  const registryAdmin = new Pool({
    connectionString: `postgresql://postgres:${registryEnv.REGISTRY_POSTGRES_PASSWORD}@127.0.0.1:${fixture.registryDatabasePort}/registry`,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await registryAdmin.query(
      `INSERT INTO registry_auth_user(id, name, email, email_verified)
         VALUES ($1, $2, $3, true);
       INSERT INTO registry_publishers(id, user_id, name) VALUES ($4, $1, $5);
       INSERT INTO registry_auth_session(id, expires_at, token, updated_at, user_id)
         VALUES ('recovery-session', statement_timestamp() + interval '1 hour',
           'synthetic-recovery-session', statement_timestamp(), $1);
       INSERT INTO registry_auth_verification(id, identifier, value, expires_at)
         VALUES ('recovery-magic-link', $3, 'synthetic-magic-link',
           statement_timestamp() + interval '1 hour');
       INSERT INTO registry_credentials(id, publisher_id, token_hash, name, scopes, expires_at)
         VALUES ('66666666-6666-4666-8666-666666666666', $4, $12,
           'Recovery PAT', ARRAY['publish'], statement_timestamp() + interval '1 hour');
       INSERT INTO registry_artifacts(root, raw_hash, byte_size)
         VALUES ($6, $7, $8);
       INSERT INTO registry_artifact_content(root, template, metadata, license)
         VALUES ($6, $9, $10, $11);
       INSERT INTO registry_entries(id, publisher_id, artifact_root)
         VALUES ('55555555-5555-4555-8555-555555555555', $4, $6)`,
      [
        recoveryFixture.registry.userId,
        'Recovery publisher',
        recoveryFixture.registry.email,
        recoveryFixture.registry.publisherId,
        recoveryFixture.registry.publisherName,
        artifactRoot,
        rawHash,
        artifact.bytes.byteLength,
        artifact.artifact.manifest.template,
        artifact.artifact.metadata,
        artifact.artifact.license,
        sha256('synthetic-recovery-pat'),
      ],
    );
  } finally {
    await registryAdmin.end();
  }
  fixture.compose(
    configuration,
    [
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '--entrypoint',
      '/bin/sh',
      'registry-minio-init',
      '-c',
      `mc alias set local http://registry-minio:9000 "$REGISTRY_MINIO_ROOT_USER" "$REGISTRY_MINIO_ROOT_PASSWORD" >/dev/null && mc pipe local/registry/template-artifacts/${rawHash}`,
    ],
    { input: Buffer.from(artifact.bytes) },
  );
  const dataBackup = join(fixture.backups, 'candidate-populated');
  const keyCustody = join(fixture.keys, 'candidate-encryption.env');
  const registryCustody = join(fixture.keys, 'candidate-registry.env');
  fixture.execute(
    'sh',
    [
      join(configuration, 'deployment/backup.sh'),
      dataBackup,
      keyCustody,
      registryCustody,
    ],
    {
      cwd: configuration,
      env: {
        COMPOSE_PROJECT_NAME: fixture.project,
        STUDIO_ENCRYPTION_FILE: join(
          configuration,
          'deployment/encryption.env',
        ),
      },
    },
  );
  const studioCounts: unknown = JSON.parse(
    readFileSync(join(dataBackup, 'counts.json'), 'utf8'),
  );
  const registryCounts: unknown = JSON.parse(
    readFileSync(join(dataBackup, 'registry-counts.json'), 'utf8'),
  );
  if (
    numericProperty(studioCounts, 'assetReferences') < 1 ||
    numericProperty(registryCounts, 'publishers') !== 1 ||
    numericProperty(registryCounts, 'artifacts') !== 1 ||
    numericProperty(registryCounts, 'entries') !== 1
  )
    throw new Error('Combined qualification backup is not populated.');
  fixture.compose(configuration, ['down', '--remove-orphans']);
  const restored = join(fixture.root, 'restored');
  cpSync(dataBackup, restored, { recursive: true });
  const reconciliation = join(fixture.keys, 'reconciliation.json');
  const reconciliationBytes = Buffer.from(
    `${JSON.stringify({
      format: 'template-registry-recovery-reconciliation',
      version: 1,
      users: [
        {
          id: recoveryFixture.registry.userId,
          publisher: 'active',
          operator: false,
        },
      ],
    })}\n`,
  );
  writeFileSync(reconciliation, reconciliationBytes, {
    flag: 'wx',
    mode: 0o600,
  });
  const restoredProject = `${fixture.project}-restored`;
  fixture.registerCleanup(() =>
    fixture.execute('docker', [
      'compose',
      '--project-name',
      restoredProject,
      '--env-file',
      join(restored, '.env'),
      '--env-file',
      join(restored, 'registry.env'),
      '-f',
      join(restored, 'docker-compose.yml'),
      '-f',
      join(restored, 'deployment/registry/compose.yml'),
      '-f',
      join(restored, 'deployment/recovery-images.yml'),
      '--profile',
      '*',
      'down',
      '--volumes',
      '--remove-orphans',
    ]),
  );
  executeDistributionRestore(fixture.execute, {
    script: join(restored, 'deployment/restore.sh'),
    backup: dataBackup,
    keyCustody,
    registryCustody,
    reconciliation,
    reconciliationSha256: sha256(reconciliationBytes),
    directory: restored,
    project: restoredProject,
  });
  const restoredCompose = (args: string[], options: ExecutionOptions = {}) =>
    fixture.execute(
      'docker',
      [
        'compose',
        '--project-name',
        restoredProject,
        '--env-file',
        join(restored, '.env'),
        '--env-file',
        join(restored, 'registry.env'),
        '-f',
        join(restored, 'docker-compose.yml'),
        '-f',
        join(restored, 'deployment/registry/compose.yml'),
        '-f',
        join(restored, 'deployment/recovery-images.yml'),
        '--profile',
        '*',
        ...args,
      ],
      options,
    );
  restoredCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    'ALTER ROLE studio_migrator LOGIN',
  ]);
  try {
    restoredCompose([
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '--entrypoint',
      'node',
      'migrate',
      'dist/recovery-assets.js',
    ]);
  } finally {
    restoredCompose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      'ALTER ROLE studio_migrator NOLOGIN',
    ]);
  }
  const studioCanary = restoredCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-qAt',
    '-U',
    'postgres',
    '-d',
    'studio',
    '-c',
    `SELECT participant_code FROM participants WHERE id = '${recoveryFixture.studio.participantId}'`,
  ]).trim();
  const registryCanary = restoredCompose([
    'exec',
    '-T',
    'registry-postgres',
    'psql',
    '-X',
    '-qAt',
    '-U',
    'postgres',
    '-d',
    'registry',
    '-c',
    `SELECT json_build_object(
      'entries', (SELECT count(*) FROM registry_entries WHERE artifact_root = '${artifactRoot}'),
      'sessions', (SELECT count(*) FROM registry_auth_session),
      'verifications', (SELECT count(*) FROM registry_auth_verification),
      'activeCredentials', (SELECT count(*) FROM registry_credentials WHERE revoked_at IS NULL))`,
  ]).trim();
  const quarantine = restoredCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-qAt',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    `SELECT bool_and(NOT rolcanlogin) FROM pg_roles
      WHERE rolname IN ('studio_runtime','studio_maintenance_runtime','studio_migrator')`,
  ]).trim();
  const registryQuarantine = restoredCompose([
    'exec',
    '-T',
    'registry-postgres',
    'psql',
    '-X',
    '-qAt',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    `SELECT bool_and(NOT rolcanlogin) FROM pg_roles
      WHERE rolname IN ('registry_runtime','registry_operations','registry_migrator')`,
  ]).trim();
  const running = restoredCompose([
    'ps',
    '--services',
    '--filter',
    'status=running',
  ])
    .trim()
    .split('\n')
    .filter(Boolean)
    .toSorted();
  assertRecoveredDistributionEvidence({
    studioCanary,
    registryCanary,
    studioWriterLoginsClosed: quarantine,
    registryWriterLoginsClosed: registryQuarantine,
    runningServices: running,
  });
  restoredCompose(['down', '--volumes', '--remove-orphans']);
}

export async function runLocalStudioDistributionQualification({
  candidate,
  sources,
  cosign,
}: {
  candidate: { bundleDirectory: string; current: { digest: string } };
  sources: { bundleDirectory: string; current: { digest: string } }[];
  cosign: string;
}) {
  await exerciseInstall(candidate, candidate, cosign, true);
  for (const source of sources)
    await exerciseInstall(source, candidate, cosign, false);
}
