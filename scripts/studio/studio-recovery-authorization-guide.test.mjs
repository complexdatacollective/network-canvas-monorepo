import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

test('recovery operator wrapper opens only the migrator and recloses on every exit', (t) => {
  const guide = readFileSync('apps/studio/RECOVERY_AUTHORIZATION.md', 'utf8');
  const source = guide.match(
    /# BEGIN RECOVERY_AUTHORIZATION_GUARD\n([\s\S]+?)# END RECOVERY_AUTHORIZATION_GUARD/,
  )?.[1];
  assert.ok(source, 'documented recovery guard is missing');
  assert.match(
    guide,
    /RECOVERY_COMPOSE_FILE="\$\{COMPOSE_FILE:-docker-compose\.yml\}"[\s\S]*deployment\/recovery-images\.yml[\s\S]*deployment\/quarantine\.yml/,
    'the guide must retain the verified recovery-images compose overlay',
  );
  assert.match(
    guide,
    /run --user "\$\(id -u\):\$\(id -g\)" \\\n+/,
    'the one-shot command must map the operator UID/GID for private mounts',
  );
  assert.doesNotMatch(
    guide,
    /-f docker-compose\.yml -f deployment\/quarantine\.yml/,
    'an explicit -f list would discard COMPOSE_FILE overlays',
  );

  const root = mkdtempSync(join(tmpdir(), 'studio-recovery-guide-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const guard = join(root, 'guard.sh');
  const docker = join(root, 'docker');
  const operation = join(root, 'operation');
  const state = join(root, 'roles');
  const trace = join(root, 'trace');
  writeFileSync(
    guard,
    `#!/bin/sh\nset -eu\n${source}\nrun_closed_recovery_command "$@"\n`,
  );
  writeFileSync(
    docker,
    `#!/bin/sh
case "$*" in
  *"studio_runtime NOLOGIN"*) printf 'closed\n' > "$ROLE_STATE" ;;
  *"ALTER ROLE studio_migrator LOGIN"*)
    [ "$(cat "$ROLE_STATE")" = closed ] || exit 81
    printf 'migrator-only\n' > "$ROLE_STATE"
    ;;
  *"pg_terminate_backend"*) : ;;
  *"Studio writer session survived"*) [ "$(cat "$ROLE_STATE")" = closed ] || exit 82 ;;
  *"stop studio worker"*) : ;;
  *) exit 83 ;;
esac
`,
  );
  writeFileSync(
    operation,
    `#!/bin/sh
[ "$(cat "$ROLE_STATE")" = migrator-only ] || exit 84
printf '%s:%s\n' "$1" "$(cat "$ROLE_STATE")" >> "$ROLE_TRACE"
case "$1" in
  success) exit 0 ;;
  failure) exit 17 ;;
  signal) kill -TERM "$PPID"; sleep 1; exit 0 ;;
  *) exit 85 ;;
esac
`,
  );
  chmodSync(guard, 0o700);
  chmodSync(docker, 0o700);
  chmodSync(operation, 0o700);

  for (const [mode, expectedStatus] of [
    ['success', 0],
    ['failure', 17],
    ['signal', 1],
  ]) {
    writeFileSync(state, 'unexpected-open-role\n');
    const result = spawnSync('sh', [guard, operation, mode], {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        ROLE_STATE: state,
        ROLE_TRACE: trace,
      },
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.equal(result.status, expectedStatus, `${mode}: ${result.stderr}`);
    assert.equal(readFileSync(state, 'utf8'), 'closed\n', mode);
  }
  assert.equal(
    readFileSync(trace, 'utf8'),
    'success:migrator-only\nfailure:migrator-only\nsignal:migrator-only\n',
  );
});

test('recovery overlay setup is idempotent and preserves retained configuration', () => {
  const guide = readFileSync('apps/studio/RECOVERY_AUTHORIZATION.md', 'utf8');
  const source = guide.match(
    /# BEGIN RECOVERY_COMPOSE_OVERLAYS\n([\s\S]+?)# END RECOVERY_COMPOSE_OVERLAYS/,
  )?.[1];
  assert.ok(source);
  const original =
    'docker-compose.yml:deployment/quarantine.yml:deployment/encryption.yml:deployment/recovery-images.yml';
  const result = spawnSync(
    'sh',
    ['-c', `${source}\n${source}\nprintf '%s' "$COMPOSE_FILE"`],
    {
      env: { ...process.env, COMPOSE_FILE: original },
      encoding: 'utf8',
      timeout: 5_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, original);
});

test('recovery reopening enables enrolled writers and recloses failed smoke checks', (t) => {
  const authorization = readFileSync(
    'apps/studio/RECOVERY_AUTHORIZATION.md',
    'utf8',
  );
  const selfHosting = readFileSync('apps/studio/SELF_HOSTING.md', 'utf8');
  const close = authorization.match(
    /# BEGIN RECOVERY_AUTHORIZATION_GUARD\n([\s\S]+?)# END RECOVERY_AUTHORIZATION_GUARD/,
  )?.[1];
  const reopen = selfHosting.match(
    /# BEGIN RECOVERY_REOPEN_GUARD\n([\s\S]+?)# END RECOVERY_REOPEN_GUARD/,
  )?.[1];
  assert.ok(close);
  assert.ok(reopen);
  const root = mkdtempSync(join(tmpdir(), 'studio-reopen-guide-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const state = join(root, 'roles');
  const trace = join(root, 'trace');
  const guard = join(root, 'guard');
  const docker = join(root, 'docker');
  const smoke = join(root, 'smoke');
  writeFileSync(
    guard,
    `#!/bin/sh\nset -eu\n${close}\n${reopen}\nreopen_recovered_studio "$@"\nprintf 'caller:%s\\n' "$COMPOSE_FILE" >> "$ROLE_TRACE"\n`,
  );
  writeFileSync(
    docker,
    `#!/bin/sh
case "$*" in
  *"studio_runtime NOLOGIN"*) printf 'closed\\n' > "$ROLE_STATE" ;;
  *"ALTER ROLE studio_migrator LOGIN; ALTER ROLE studio_runtime LOGIN; ALTER ROLE studio_maintenance_runtime LOGIN"*)
    [ "$(cat "$ROLE_STATE")" = closed ] || exit 81
    printf 'open\\n' > "$ROLE_STATE" ;;
  *"pg_terminate_backend"*) : ;;
  *"Studio writer session survived"*) [ "$(cat "$ROLE_STATE")" = closed ] || exit 82 ;;
  *"stop studio worker"*|*"stop traefik"*) : ;;
  *"up -d --wait studio traefik worker"*)
    [ "$(cat "$ROLE_STATE")" = open ] || exit 83
    [ "$COMPOSE_FILE" = 'docker-compose.yml:deployment/encryption.yml:deployment/recovery-images.yml' ] || exit 84
    printf '%s\\n' "$COMPOSE_FILE" >> "$ROLE_TRACE"
    [ "$REOPEN_MODE" != startup-failure ] || exit 18 ;;
  *) exit 85 ;;
esac
`,
  );
  writeFileSync(
    smoke,
    `#!/bin/sh
[ "$(cat "$ROLE_STATE")" = open ] || exit 86
case "$REOPEN_MODE" in
  success) exit 0 ;;
  failure) exit 17 ;;
  signal) kill -TERM "$PPID"; sleep 1; exit 0 ;;
  *) exit 87 ;;
esac
`,
  );
  chmodSync(guard, 0o700);
  chmodSync(docker, 0o700);
  chmodSync(smoke, 0o700);
  for (const [mode, status] of [
    ['success', 0],
    ['failure', 17],
    ['startup-failure', 18],
    ['signal', 1],
  ]) {
    writeFileSync(state, 'closed\n');
    const result = spawnSync(
      'sh',
      [guard, smoke, 'studio', 'traefik', 'worker'],
      {
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          ROLE_STATE: state,
          ROLE_TRACE: trace,
          COMPOSE_FILE:
            'docker-compose.yml:deployment/quarantine.yml:deployment/encryption.yml:deployment/recovery-images.yml:deployment/quarantine.yml',
          REOPEN_MODE: mode,
        },
        encoding: 'utf8',
        timeout: 5_000,
      },
    );
    assert.equal(result.status, status, `${mode}: ${result.stderr}`);
    assert.equal(
      readFileSync(state, 'utf8'),
      mode === 'success' ? 'open\n' : 'closed\n',
      mode,
    );
  }
  const entries = readFileSync(trace, 'utf8').trim().split('\n');
  assert.equal(entries.length, 5);
  assert(
    entries.includes(
      'caller:docker-compose.yml:deployment/encryption.yml:deployment/recovery-images.yml',
    ),
  );
});
