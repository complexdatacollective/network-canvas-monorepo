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
const restoreSource =
  process.env.STUDIO_RESTORE_SCRIPT ??
  join(repository, 'apps/studio/deployment/restore.sh');
const checksumSource = join(repository, 'apps/studio/deployment/checksum.sh');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writerRoles = [
  'studio_runtime',
  'studio_maintenance_runtime',
  'studio_migrator',
];

async function makeHarness({
  failAt = '',
  mutateOriginal = false,
  symlinkInput,
  collision = '',
} = {}) {
  const scratch = await mkdtemp(join(tmpdir(), 'studio-restore-test-'));
  const root = join(scratch, 'studio');
  const deployment = join(root, 'deployment');
  const backup = join(scratch, 'backup');
  const fakeBin = join(scratch, 'bin');
  await Promise.all([
    mkdir(deployment, { recursive: true }),
    mkdir(join(backup, 'deployment'), { recursive: true }),
    mkdir(fakeBin),
  ]);
  const privilegeSql = 'SELECT 1;\n';
  await Promise.all([
    cp(restoreSource, join(deployment, 'restore.sh')),
    cp(checksumSource, join(deployment, 'checksum.sh')),
    writeFile(join(root, 'docker-compose.yml'), 'services: {}\n'),
    writeFile(join(root, '.env'), 'FIXTURE=1\n'),
    writeFile(join(deployment, 'postgres-privileges.sql'), privilegeSql),
  ]);

  const custody = join(scratch, 'keys.env');
  const imageId = `sha256:${'a'.repeat(64)}`;
  const artifacts = {
    'COMPLETE': 'Studio quiesced backup v1\n',
    'studio.dump': 'studio dump',
    'minio.tar': 'studio objects',
    'images.tar': 'images',
    'images.txt': 'fixture-image\n',
    'images.ids': `${imageId}\n`,
    'deployment/recovery-images.yml': 'services: {}\n',
    'deployment/postgres-privileges.sql': privilegeSql,
  };
  await writeFile(custody, 'STUDIO_KEY=fixture\n');
  await writeFile(
    join(backup, 'encryption.sha256'),
    `${digest(await readFile(custody))}\n`,
  );
  for (const [name, bytes] of Object.entries(artifacts))
    await writeFile(join(backup, name), bytes);
  const checksumNames = [
    ...Object.keys(artifacts).filter((name) => name !== 'COMPLETE'),
    'encryption.sha256',
  ];
  const sums = await Promise.all(
    checksumNames.map(
      async (name) => `${digest(await readFile(join(backup, name)))}  ${name}`,
    ),
  );
  await writeFile(join(backup, 'SHA256SUMS'), `${sums.join('\n')}\n`);

  const logPath = join(scratch, 'docker.log');
  const configPath = join(scratch, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'fixture_target',
      volumes: {
        pg: { name: 'fixture_target_pg', driver: 'local' },
        minio: { name: 'fixture_target_minio', driver: 'local' },
      },
      networks: {
        data: { name: 'fixture_target_data', driver: 'bridge' },
      },
      services: {
        postgres: {
          volumes: [
            {
              type: 'volume',
              source: 'pg',
              target: '/var/lib/postgresql',
            },
          ],
        },
        minio: {
          volumes: [{ type: 'volume', source: 'minio', target: '/data' }],
        },
      },
    }),
  );
  const roleStatePath = join(scratch, 'roles');
  await writeFile(
    roleStatePath,
    `${writerRoles.map((role) => `${role}=true`).join('\n')}\n`,
  );
  const docker = join(fakeBin, 'docker');
  await writeFile(
    docker,
    `#!/bin/sh
payload=$(cat)
printf 'ARGS:%s\\nSTDIN:%s\\n' "$*" "$payload" >> "$FAKE_DOCKER_LOG"
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
case "$*:$payload" in
  *"exec -T postgres psql"*"pg_terminate_backend"*)
    [ "$FAIL_AT" = terminate ] && exit 33
    ;;
esac
case "$*" in
  *"config --format json"*) cat "$FAKE_CONFIG" ;;
  "ps --all --quiet --filter label=com.docker.compose.project=fixture_target")
    [ "$COLLISION" = project ] && printf 'existing-container\\n'
    ;;
  "network ls --format {{.ID}} --filter label=com.docker.compose.project=fixture_target")
    [ "$COLLISION" = project ] && printf 'existing-network-id\\n'
    ;;
  "network ls --format {{.Name}}")
    [ "$COLLISION" = network ] && printf 'fixture_target_data\\n'
    ;;
  "volume ls --format {{.Name}} --filter label=com.docker.compose.project=fixture_target")
    [ "$COLLISION" = project ] && printf 'fixture_target_pg\\n'
    ;;
  "volume ls --format {{.Name}}")
    [ "$COLLISION" = volume ] && printf 'fixture_target_pg\\n'
    ;;
  "image load --input "*)
    if [ "$MUTATE_ORIGINAL" = 1 ]; then
      printf 'substituted after snapshot' > "$ORIGINAL_IMAGES"
    fi
    shasum -a 256 "$4" | awk '{print "LOADED_SHA:" $1}' >> "$FAKE_DOCKER_LOG"
    printf 'Loaded image ID: ${imageId}\\n'
    ;;
  "image inspect "*) printf '${imageId}\\n' ;;
  *"postgres pg_restore"*) [ "$FAIL_AT" = pg-restore ] && exit 31 || exit 0 ;;
  *"minio-init"*)
    if [ "$FAIL_AT" = signal ]; then kill -TERM "$PPID"; fi
    [ "$FAIL_AT" = minio-init ] && exit 35
    ;;
esac
exit 0
`,
  );
  await chmod(docker, 0o755);

  const inputs = { backup, custody };
  if (symlinkInput) {
    const link = join(scratch, `${symlinkInput}-link`);
    await symlink(inputs[symlinkInput], link);
    inputs[symlinkInput] = link;
  }
  const result = spawnSync(
    'sh',
    [join(deployment, 'restore.sh'), inputs.backup, inputs.custody],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_DOCKER_LOG: logPath,
        FAKE_CONFIG: configPath,
        FAKE_ROLE_STATE: roleStatePath,
        COLLISION: collision,
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
  return {
    result,
    log,
    backup,
    roleState: await readFile(roleStatePath, 'utf8'),
  };
}

function assertEveryWriterClosed(log) {
  for (const role of writerRoles)
    assert.match(log, new RegExp(`ALTER ROLE ${role} NOLOGIN;`));
}

test('restore closes every writer before the first write and on successful exit', async () => {
  const { result, log, roleState } = await makeHarness();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Data restored\. Admission and all workers remain closed\./,
  );
  assertEveryWriterClosed(log);
  assert.ok(log.indexOf('COMMIT;') < log.indexOf('postgres pg_restore'));
  assert.ok(
    log.indexOf('postgres pg_restore') < log.indexOf('STDIN:SELECT 1;'),
  );
  assert.ok(
    log.indexOf('up -d minio') <
      log.indexOf('run --rm --no-deps -T minio-init'),
  );
  assert.doesNotMatch(log, /up -d minio-init/);
  assert.equal(
    roleState,
    `${writerRoles.map((role) => `${role}=false`).join('\n')}\n`,
  );
});

test('restore failure or signal retries quarantine and termination cannot roll it back', async (t) => {
  for (const failAt of ['pg-restore', 'terminate', 'minio-init', 'signal'])
    await t.test(failAt, async () => {
      const { result, log, roleState } = await makeHarness({ failAt });
      assert.notEqual(result.status, 0);
      assertEveryWriterClosed(log);
      assert.equal(
        roleState,
        `${writerRoles.map((role) => `${role}=false`).join('\n')}\n`,
      );
    });
});

test('restore rejects symlinked inputs before loading images', async (t) => {
  for (const symlinkInput of ['backup', 'custody'])
    await t.test(symlinkInput, async () => {
      const { result, log } = await makeHarness({ symlinkInput });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must not be symbolic links/);
      assert.doesNotMatch(log, /image load/);
    });
});

test('restore refuses existing project resources before any SQL or service start', async (t) => {
  for (const collision of ['project', 'volume', 'network'])
    await t.test(collision, async () => {
      const { result, log } = await makeHarness({ collision });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        collision === 'network'
          ? /target Compose network already exists/
          : /target Compose project or named volumes already exist/,
      );
      assert.doesNotMatch(log, /image load|exec -T postgres|up -d/);
    });
});

test('restore consumes one verified private snapshot and removes it', async () => {
  const { result, log, backup } = await makeHarness({ mutateOriginal: true });
  assert.equal(result.status, 0, result.stderr);
  const loadedPath = log.match(
    /image load --input ([^\n]+)\/backup\/images\.tar/,
  )?.[1];
  assert.ok(loadedPath);
  assert.notEqual(loadedPath, backup);
  assert.match(log, new RegExp(`LOADED_SHA:${digest('images')}`));
  await assert.rejects(access(loadedPath));
});
