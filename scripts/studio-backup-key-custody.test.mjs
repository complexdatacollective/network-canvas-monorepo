import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');
const backupSource =
  process.env.STUDIO_BACKUP_SCRIPT ??
  join(repository, 'apps/studio/deployment/backup.sh');
const checksumSource = join(repository, 'apps/studio/deployment/checksum.sh');
const writerRoles = [
  'studio_runtime',
  'studio_maintenance_runtime',
  'studio_migrator',
];

async function makeHarness(
  t,
  {
    failAt = '',
    rotateAfterPreflight = false,
    rotateDuringVerification = false,
  } = {},
) {
  const scratch = await mkdtemp(join(tmpdir(), 'studio-backup-custody-test-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const root = join(scratch, 'studio');
  const deployment = join(root, 'deployment');
  const backup = join(scratch, 'backup');
  const custody = join(scratch, 'custody', 'keys.env');
  const fakeBin = join(scratch, 'bin');
  const privateTmp = join(scratch, 'tmp');
  await Promise.all([
    mkdir(deployment, { recursive: true }),
    mkdir(dirname(custody), { recursive: true }),
    mkdir(fakeBin),
    mkdir(privateTmp),
  ]);

  await Promise.all([
    cp(backupSource, join(deployment, 'backup.sh')),
    cp(checksumSource, join(deployment, 'checksum.sh')),
    writeFile(join(root, '.env'), 'FIXTURE=1\n'),
    writeFile(join(root, 'docker-compose.yml'), 'services: {}\n'),
    writeFile(join(root, 'SELF_HOSTING.md'), 'fixture\n'),
    writeFile(join(root, 'MIGRATIONS.md'), 'fixture\n'),
    writeFile(join(root, 'BACKUPS.md'), 'fixture\n'),
    writeFile(join(deployment, 'encryption.env'), 'FIXTURE_ROOT=key-a\n'),
  ]);
  for (const name of [
    'traefik.yml',
    'migrate.yml',
    'encryption.yml',
    'postgres-init.sql',
    'postgres-privileges.sql',
    'minio-init.sh',
    'minio-policy.json',
    'restore.sh',
    'quarantine.yml',
  ])
    await writeFile(join(deployment, name), 'fixture\n');

  const logPath = join(scratch, 'docker.log');
  const roleStatePath = join(scratch, 'roles');
  const proofStatePath = join(scratch, 'proof');
  const verificationCountPath = join(scratch, 'verification-count');
  await Promise.all([
    writeFile(
      roleStatePath,
      `${writerRoles.map((role) => `${role}=true`).join('\n')}\n`,
    ),
    writeFile(proofStatePath, 'key-a\n'),
    writeFile(verificationCountPath, '0\n'),
  ]);

  const imageId = `sha256:${'a'.repeat(64)}`;
  const docker = join(fakeBin, 'docker');
  await writeFile(
    docker,
    `#!/bin/sh
payload=$(cat)
printf 'ARGS:%s\\nSTDIN:%s\\n' "$*" "$payload" >> "$FAKE_DOCKER_LOG"

set_role() {
  selected=$1
  allowed=$2
  awk -F= -v selected="$selected" -v allowed="$allowed" \
    '{ print $1 "=" ($1 == selected ? allowed : $2) }' \
    "$FAKE_ROLE_STATE" > "$FAKE_ROLE_STATE.tmp"
  mv "$FAKE_ROLE_STATE.tmp" "$FAKE_ROLE_STATE"
}

for role in ${writerRoles.join(' ')}; do
  case "$*:$payload" in
    *"ALTER ROLE $role NOLOGIN"*) set_role "$role" false ;;
    *"ALTER ROLE $role LOGIN"*) set_role "$role" true ;;
  esac
done

case "$*" in
  *"stop studio worker"*)
    if [ "$ROTATE_AFTER_PREFLIGHT" = 1 ]; then
      printf 'key-b\\n' > "$FAKE_PROOF_STATE"
    fi
    ;;
  *"run --rm --no-deps encryption-verify-online"*) exit 0 ;;
  *"run --rm --no-deps encryption-verify"*)
    count=$(cat "$FAKE_VERIFICATION_COUNT")
    count=$((count + 1))
    printf '%s\\n' "$count" > "$FAKE_VERIFICATION_COUNT"
    if [ "$count" -ge 2 ]; then
      if [ "$FAIL_AT" = signal ]; then kill -TERM "$PPID"; exit 44; fi
      if [ "$FAIL_AT" = second-verify ]; then exit 42; fi
      case "$(cat "$STUDIO_ENCRYPTION_FILE"):$(cat "$FAKE_PROOF_STATE")" in
        *key-a*:*key-a*) ;;
        *) exit 43 ;;
      esac
      # Model a second operator that connects and registers a proof before the
      # verifier disconnects. A read-only transaction in the first connection
      # does not prevent this when the shared maintenance LOGIN is open.
      if [ "$ROTATE_DURING_VERIFICATION" = 1 ] && \
        grep -q '^studio_maintenance_runtime=true$' "$FAKE_ROLE_STATE"; then
        printf 'key-b\\n' > "$FAKE_PROOF_STATE"
      fi
    fi
    exit 0
    ;;
  *"config --images"*) printf 'fixture-image\\n'; exit 0 ;;
  *"config --format json"*)
    printf '%s\\n' '{"services":{"studio":{"image":"fixture-image"}}}'
    exit 0
    ;;
  *"image inspect"*) printf '${imageId}\\n'; exit 0 ;;
  *"image save"*) printf 'fixture image archive'; exit 0 ;;
  *"run --rm --no-deps -T --entrypoint tar minio"*)
    printf 'fixture object archive'
    exit 0
    ;;
esac

case "$*:$payload" in
  *"pg_terminate_backend"*)
    [ "$FAIL_AT" = termination ] && exit 33
    ;;
  *"pg_dump"*) printf 'fixture database dump'; exit 0 ;;
  *"studio_backup_login"*) printf '{"instance":1}\\n'; exit 0 ;;
esac
exit 0
`,
  );
  await chmod(docker, 0o755);

  const result = spawnSync(
    'sh',
    [join(deployment, 'backup.sh'), backup, custody],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TMPDIR: privateTmp,
        FAIL_AT: failAt,
        ROTATE_AFTER_PREFLIGHT: rotateAfterPreflight ? '1' : '0',
        ROTATE_DURING_VERIFICATION: rotateDuringVerification ? '1' : '0',
        FAKE_DOCKER_LOG: logPath,
        FAKE_PROOF_STATE: proofStatePath,
        FAKE_ROLE_STATE: roleStatePath,
        FAKE_VERIFICATION_COUNT: verificationCountPath,
      },
      encoding: 'utf8',
      // Complete capture spawns many real shell processes and hashes every
      // artifact. This bounds execution; no sleep substitutes for an oracle.
      timeout: 60_000,
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
    custody,
    roleState: await readFile(roleStatePath, 'utf8'),
    proofState: await readFile(proofStatePath, 'utf8'),
    privateTmp,
  };
}

function assertEveryWriterClosed(roleState) {
  assert.equal(
    roleState,
    `${writerRoles.map((role) => `${role}=false`).join('\n')}\n`,
  );
}

async function assertNoComplete(backup) {
  await assert.rejects(access(join(backup, 'COMPLETE')));
}

test('a key rotation after preflight refuses capture under closed admission', async (t) => {
  const { result, backup, roleState, log } = await makeHarness(t, {
    rotateAfterPreflight: true,
  });
  assert.notEqual(result.status, 0);
  await assertNoComplete(backup);
  assertEveryWriterClosed(roleState);
  assert.match(log, /stop studio worker/);
  assert.equal(
    (log.match(/run --rm --no-deps encryption-verify(?:-backup)?\n/g) ?? [])
      .length,
    2,
  );
});

test('a stable proof captures the complete backup artifact set', async (t) => {
  const { result, backup, custody, roleState } = await makeHarness(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Backup complete/);
  assertEveryWriterClosed(roleState);
  for (const name of [
    'COMPLETE',
    'SHA256SUMS',
    'studio.dump',
    'counts.json',
    'minio.tar',
    'images.tar',
    'images.txt',
    'images.ids',
    'deployment/recovery-images.yml',
  ])
    await access(join(backup, name));
  assert.equal(await readFile(custody, 'utf8'), 'FIXTURE_ROOT=key-a\n');
});

test('second verification failure and signals clean up with every writer closed', async (t) => {
  for (const failAt of ['second-verify', 'signal'])
    await t.test(failAt, async (child) => {
      const { result, backup, roleState, privateTmp } = await makeHarness(
        child,
        { failAt },
      );
      assert.notEqual(result.status, 0);
      await assertNoComplete(backup);
      assertEveryWriterClosed(roleState);
      assert.deepEqual(await readdir(privateTmp), []);
    });
});

test('a second operator cannot rotate keys during the post-drain custody check', async (t) => {
  const { result, backup, roleState, proofState, log } = await makeHarness(t, {
    rotateDuringVerification: true,
  });
  assert.equal(result.status, 0, result.stderr);
  await access(join(backup, 'COMPLETE'));
  assertEveryWriterClosed(roleState);
  assert.equal(proofState, 'key-a\n');
  assert.match(log, /run --rm --no-deps encryption-verify-backup/);
});
