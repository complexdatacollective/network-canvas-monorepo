import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRestore = join(repository, 'apps/studio/deployment/restore.sh');
const restoreSource = process.env.STUDIO_RESTORE_SCRIPT ?? defaultRestore;
const checksumSource = join(repository, 'apps/studio/deployment/checksum.sh');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writerRoles = [
  'studio_runtime',
  'studio_maintenance_runtime',
  'studio_migrator',
  'registry_runtime',
  'registry_operations',
  'registry_migrator',
];

async function makeHarness({ failAt, mutateOriginal = false, symlinkInput }) {
  const scratch = await mkdtemp(join(tmpdir(), 'studio-restore-test-'));
  const root = join(scratch, 'studio');
  const deployment = join(root, 'deployment');
  const backup = join(scratch, 'backup');
  const fakeBin = join(scratch, 'bin');
  await Promise.all([
    mkdir(join(deployment, 'registry'), { recursive: true }),
    mkdir(join(backup, 'deployment'), { recursive: true }),
    mkdir(fakeBin),
  ]);
  await Promise.all([
    cp(restoreSource, join(deployment, 'restore.sh')),
    cp(checksumSource, join(deployment, 'checksum.sh')),
    writeFile(join(root, '.env'), 'FIXTURE=1\n'),
    writeFile(join(deployment, 'postgres-privileges.sql'), 'SELECT 1;\n'),
    writeFile(
      join(deployment, 'registry/postgres-privileges.sql'),
      'SELECT 1;\n',
    ),
    writeFile(join(root, 'docker-compose.yml'), 'services: {}\n'),
    writeFile(join(deployment, 'registry/compose.yml'), 'services: {}\n'),
    writeFile(join(deployment, 'registry/recovery.yml'), 'services: {}\n'),
  ]);

  const custody = join(scratch, 'keys.env');
  const registryCustody = join(scratch, 'registry.env');
  const reconciliation = join(scratch, 'reconciliation.json');
  const imageId = `sha256:${'a'.repeat(64)}`;
  const artifacts = {
    'COMPLETE': 'Studio quiesced backup v1\n',
    'studio.dump': 'studio dump',
    'registry.dump': 'registry dump',
    'minio.tar': 'studio objects',
    'registry-minio.tar': 'registry objects',
    'client-assets.tar': 'client assets',
    'images.tar': 'images',
    'images.txt': 'fixture-image\n',
    'images.ids': `${imageId}\n`,
    'deployment/recovery-images.yml': 'services: {}\n',
    'deployment/postgres-privileges.sql': 'SELECT 1;\n',
  };
  await writeFile(custody, 'STUDIO_KEY=fixture\n');
  await writeFile(
    registryCustody,
    'REGISTRY_MIGRATION_PASSWORD=fixture\nREGISTRY_BACKUP_PASSWORD=fixture\n',
  );
  await writeFile(reconciliation, '{}\n');
  await writeFile(
    join(backup, 'encryption.sha256'),
    `${digest(await readFile(custody))}\n`,
  );
  await writeFile(
    join(backup, 'registry-configuration.sha256'),
    `${digest(await readFile(registryCustody))}\n`,
  );
  for (const [name, bytes] of Object.entries(artifacts)) {
    await mkdir(dirname(join(backup, name)), { recursive: true });
    await writeFile(join(backup, name), bytes);
  }
  const checksumNames = [
    ...Object.keys(artifacts).filter((name) => name !== 'COMPLETE'),
    'encryption.sha256',
    'registry-configuration.sha256',
  ];
  const sums = [];
  for (const name of checksumNames) {
    sums.push(`${digest(await readFile(join(backup, name)))}  ${name}`);
  }
  await writeFile(join(backup, 'SHA256SUMS'), `${sums.join('\n')}\n`);

  const config = {
    name: 'audit_target',
    volumes: {
      pg: { name: 'audit_target_pg', driver: 'local' },
      minio: { name: 'audit_target_minio', driver: 'local' },
      registry_pg: { name: 'audit_target_registry_pg', driver: 'local' },
      registry_minio: {
        name: 'audit_target_registry_minio',
        driver: 'local',
      },
      assets: { name: 'audit_target_assets', driver: 'local' },
    },
    networks: { data: { name: 'audit_target_data', driver: 'bridge' } },
    services: {
      'postgres': {
        volumes: [
          { type: 'volume', source: 'pg', target: '/var/lib/postgresql' },
        ],
      },
      'minio': {
        volumes: [{ type: 'volume', source: 'minio', target: '/data' }],
      },
      'registry-postgres': {
        volumes: [
          {
            type: 'volume',
            source: 'registry_pg',
            target: '/var/lib/postgresql',
          },
        ],
      },
      'registry-minio': {
        volumes: [
          { type: 'volume', source: 'registry_minio', target: '/data' },
        ],
      },
      'client-assets': {
        volumes: [
          {
            type: 'volume',
            source: 'assets',
            target: '/retained-assets',
          },
        ],
      },
      'studio': {
        volumes: [
          {
            type: 'volume',
            source: 'assets',
            target: '/retained-assets',
          },
        ],
      },
    },
  };
  const configPath = join(scratch, 'config.json');
  const logPath = join(scratch, 'docker.log');
  const roleStatePath = join(scratch, 'roles');
  await writeFile(
    roleStatePath,
    `${writerRoles.map((role) => `${role}=true`).join('\n')}\n`,
  );
  await writeFile(configPath, JSON.stringify(config));
  const docker = join(fakeBin, 'docker');
  await writeFile(
    docker,
    `#!/bin/sh
payload=$(cat)
printf 'ARGS:%s\\nSTDIN:%s\\n' "$*" "$payload" >> "$FAKE_DOCKER_LOG"
case "$*:$payload" in
  *"exec -T postgres psql"*"pg_terminate_backend"*)
    [ "$FAIL_AT" = studio-terminate ] && exit 33
    ;;
  *"exec -T registry-postgres psql"*"pg_terminate_backend"*)
    [ "$FAIL_AT" = registry-terminate ] && exit 34
    ;;
esac
case "$payload" in
  *"COMMIT;"*)
    for role in ${writerRoles.join(' ')}; do
      case "$payload" in
        *"ALTER ROLE $role NOLOGIN;"*)
          awk -F= -v selected="$role" '{ print $1 "=" ($1 == selected ? "false" : $2) }' "$FAKE_ROLE_STATE" > "$FAKE_ROLE_STATE.tmp"
          mv "$FAKE_ROLE_STATE.tmp" "$FAKE_ROLE_STATE"
          ;;
      esac
    done
    ;;
esac
case "$*" in
  *" config --format json"*)
    if [ "$MUTATE_ORIGINAL" = 1 ]; then
      printf 'substituted after snapshot' > "$ORIGINAL_IMAGES"
      MUTATE_ORIGINAL=0
    fi
    cat "$FAKE_CONFIG"
    ;;
  "image load --input "*)
    shasum -a 256 "\${4}" | awk '{print "LOADED_SHA:" $1}' >> "$FAKE_DOCKER_LOG"
    printf 'Loaded image ID: ${imageId}\\n'
    ;;
  "image inspect "*) printf '${imageId}\\n' ;;
  *"registry-postgres pg_restore"*) [ "$FAIL_AT" = registry-pg-restore ] && exit 31 || exit 0 ;;
  *"registry-recover-verify"*)
    if [ "$FAIL_AT" = registry-recover-signal ]; then kill -TERM "$PPID"; exit 0; fi
    [ "$FAIL_AT" = registry-recover ] && exit 32 || exit 0 ;;
esac
exit 0
`,
  );
  await chmod(docker, 0o755);
  const argumentsByName = {
    backup,
    custody,
    registryCustody,
    reconciliation,
  };
  if (symlinkInput) {
    const link = join(scratch, `${symlinkInput}-link`);
    await symlink(argumentsByName[symlinkInput], link);
    argumentsByName[symlinkInput] = link;
  }
  const result = spawnSync(
    'sh',
    [
      join(deployment, 'restore.sh'),
      argumentsByName.backup,
      argumentsByName.custody,
      argumentsByName.registryCustody,
      argumentsByName.reconciliation,
      digest(await readFile(reconciliation)),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_DOCKER_LOG: logPath,
        FAKE_CONFIG: configPath,
        FAKE_ROLE_STATE: roleStatePath,
        FAIL_AT: failAt,
        MUTATE_ORIGINAL: mutateOriginal ? '1' : '0',
        ORIGINAL_IMAGES: join(backup, 'images.tar'),
      },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  let log = '';
  try {
    log = await readFile(logPath, 'utf8');
  } catch {}
  const roleState = await readFile(roleStatePath, 'utf8');
  return { result, log, backup, roleState };
}

function assertEveryWriterClosed(log) {
  for (const role of writerRoles) {
    assert.match(log, new RegExp(`ALTER ROLE ${role} NOLOGIN;`));
  }
}

function assertEveryWriterStateClosed(roleState) {
  assert.equal(
    roleState,
    `${writerRoles.map((role) => `${role}=false`).join('\n')}\n`,
  );
}

test('a failure before the owner window leaves every writer quarantined', async () => {
  const { result, log } = await makeHarness({ failAt: 'registry-pg-restore' });
  assert.equal(result.status, 31);
  assertEveryWriterClosed(log);
  assert.doesNotMatch(log, /ALTER ROLE registry_(runtime|operations) LOGIN;/);
});

test('a failure or signal after opening the owner closes every writer', async (t) => {
  for (const failAt of ['registry-recover', 'registry-recover-signal']) {
    await t.test(failAt, async () => {
      const { result, log } = await makeHarness({ failAt });
      assert.notEqual(result.status, 0);
      assert.match(log, /ALTER ROLE registry_migrator LOGIN;/);
      assertEveryWriterClosed(
        log.slice(log.lastIndexOf('ALTER ROLE registry_migrator LOGIN;')),
      );
      assert.doesNotMatch(
        log,
        /ALTER ROLE registry_(runtime|operations) LOGIN;/,
      );
    });
  }
});

test('a termination failure cannot roll committed writer NOLOGIN state back', async (t) => {
  for (const failAt of ['studio-terminate', 'registry-terminate']) {
    await t.test(failAt, async () => {
      const { result, roleState } = await makeHarness({ failAt });
      assert.notEqual(result.status, 0);
      assertEveryWriterStateClosed(roleState);
    });
  }
});

test('restore rejects symlinked operator inputs before loading images', async (t) => {
  for (const symlinkInput of [
    'backup',
    'custody',
    'registryCustody',
    'reconciliation',
  ]) {
    await t.test(symlinkInput, async () => {
      const { result, log } = await makeHarness({
        failAt: 'registry-pg-restore',
        symlinkInput,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must not be symbolic links/);
      assert.doesNotMatch(log, /image load/);
    });
  }
});

test('restore consumes one verified private snapshot and removes it on failure', async () => {
  const { result, log, backup } = await makeHarness({
    failAt: 'registry-pg-restore',
    mutateOriginal: true,
  });
  assert.equal(result.status, 31);
  const loadedPath = log.match(
    /image load --input ([^\n]+)\/backup\/images\.tar/,
  )?.[1];
  assert.ok(loadedPath);
  assert.notEqual(loadedPath, backup);
  assert.match(log, new RegExp(`LOADED_SHA:${digest('images')}`));
  await assert.rejects(access(loadedPath));
});
