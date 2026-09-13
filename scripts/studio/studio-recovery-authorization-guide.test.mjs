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
