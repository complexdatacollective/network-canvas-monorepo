import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, test } from 'vitest';

// apps/studio/scripts/upgrade.sh against a stub Compose that keeps the state a
// real stack would: which image each API replica runs, whether it is stopped,
// the maintenance flag, and which release the database's schema belongs to.
// Each case fails one step and checks what the script leaves behind.

const SCRIPT = fileURLToPath(
  new URL('../../apps/studio/scripts/upgrade.sh', import.meta.url),
);
const digest = (char) => char.repeat(64);
const OLD_API = `ghcr.io/complexdatacollective/studio-api@sha256:${digest('a')}`;
const OLD_WEB = `ghcr.io/complexdatacollective/studio-web@sha256:${digest('b')}`;
const NEW_API = `ghcr.io/complexdatacollective/studio-api@sha256:${digest('c')}`;
const NEW_WEB = `ghcr.io/complexdatacollective/studio-web@sha256:${digest('d')}`;

const STUB = fileURLToPath(
  new URL('./studio-upgrade-compose-stub.sh', import.meta.url),
);

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const ENV_FILE = [
  '# Studio',
  'STUDIO_HOSTNAME=studio.example.org',
  `STUDIO_API_IMAGE=${OLD_API}`,
  'POSTGRES_USER=studio',
  `STUDIO_WEB_IMAGE=${OLD_WEB}`,
  'STACK_SUBNET=172.31.240.0/24',
  '',
].join('\n');

function stack({ stuck = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'studio-upgrade-script-'));
  dirs.push(root);
  const dir = join(root, 'stack');
  const state = join(root, 'state');
  mkdirSync(dir);
  mkdirSync(state);
  writeFileSync(join(dir, '.env'), ENV_FILE);
  chmodSync(join(dir, '.env'), 0o600);
  writeFileSync(join(state, 'db'), 'old\n');
  writeFileSync(join(state, 'maintenance'), 'off\n');
  writeFileSync(join(state, 'calls.log'), '');
  for (const api of ['api', 'api-b']) {
    writeFileSync(join(state, `image-${api}`), `${OLD_API}\n`);
  }
  for (const api of stuck) writeFileSync(join(state, `stuck-${api}`), '');
  return { dir, state };
}

function upgrade(s, { args, env = {}, cwd } = {}) {
  const result = spawnSync(SCRIPT, args ?? ['--dir', s.dir, NEW_API, NEW_WEB], {
    cwd: cwd ?? s.state,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      COMPOSE: `${STUB} compose`,
      STUB_STATE: s.state,
      STUB_NEW_API: NEW_API,
      STUDIO_UPGRADE_MAINTENANCE_TIMEOUT: '1',
      STUDIO_UPGRADE_SCHEMA_TIMEOUT: '1',
      STUDIO_UPGRADE_POLL_INTERVAL: '0.05',
      ...env,
    },
  });
  const read = (name) =>
    existsSync(join(s.state, name))
      ? readFileSync(join(s.state, name), 'utf8').trim()
      : null;
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    stdout: result.stdout,
    calls: read('calls.log')
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('exec ')),
    env: readFileSync(join(s.dir, '.env'), 'utf8'),
    maintenance: read('maintenance'),
    db: read('db'),
    images: { 'api': read('image-api'), 'api-b': read('image-api-b') },
  };
}

const lastLine = (stdout) => stdout.trim().split('\n').at(-1);
const envWith = (api, web) =>
  ENV_FILE.replace(OLD_API, api).replace(OLD_WEB, web);

const SEQUENCE = [
  'config --services',
  'run --rm --no-deps api maintenance on',
  'stop api api-b worker',
  'pull',
  'up -d web api api-b worker',
  'run --rm migrate',
  'run --rm --no-deps api maintenance off',
];

function assertRolledBack(r, failedStep) {
  assert.equal(r.status, 3, r.output);
  assert.equal(
    lastLine(r.stdout),
    '[studio-upgrade] result=rolled-back exit=3',
  );
  assert.match(
    r.output,
    new RegExp(`failed step=${failedStep} before migrate`),
  );
  assert.equal(r.env, ENV_FILE, '.env names the previous images again');
  assert.equal(r.db, 'old', 'the database is unchanged');
  assert.equal(r.maintenance, 'off', 'the instance is open again');
  assert.deepEqual(r.images, { 'api': OLD_API, 'api-b': OLD_API });
  assert.deepEqual(r.calls.slice(-2), [
    'up -d web api api-b worker',
    'run --rm --no-deps api maintenance off',
  ]);
}

test('runs the guide’s sequence against every API replica and ends open on the new images', () => {
  const s = stack();
  const r = upgrade(s);
  assert.equal(r.status, 0, r.output);
  assert.equal(lastLine(r.stdout), '[studio-upgrade] result=upgraded exit=0');
  assert.deepEqual(r.calls, SEQUENCE);
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
  assert.equal(statSync(join(s.dir, '.env')).mode & 0o777, 0o600);
  assert.equal(r.db, 'new');
  assert.equal(r.maintenance, 'off');
  assert.deepEqual(r.images, { 'api': NEW_API, 'api-b': NEW_API });
  assert.match(r.output, /this script takes no backup/);
});

test('uses the stack directory it is run from when no --dir is given', () => {
  const s = stack();
  const r = upgrade(s, { args: [NEW_API, NEW_WEB], cwd: s.dir });
  assert.equal(r.status, 0, r.output);
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
});

for (const [name, fail] of [
  ['maintenance-on', 'maintenance-on'],
  ['stop', 'stop'],
  ['pull', 'pull'],
  ['up', 'up:1'],
  ['migrate', 'migrate'],
]) {
  test(`rolls back when ${name} fails`, () => {
    const r = upgrade(stack(), { env: { STUB_FAIL: fail } });
    assertRolledBack(r, name);
  });
}

test('rolls back when maintenance mode never lands on every replica', () => {
  const r = upgrade(stack(), { env: { STUB_IGNORE_FLAG: '1' } });
  assertRolledBack(r, 'maintenance-wait');
  assert.ok(
    !r.calls.includes('stop api api-b worker'),
    'nothing is stopped while the instance is open',
  );
});

test('rolls back when migrate refuses a database a newer release migrated', () => {
  const s = stack();
  writeFileSync(join(s.state, 'db'), 'new\n');
  for (const api of ['api', 'api-b']) {
    writeFileSync(join(s.state, `image-${api}`), `${NEW_API}\n`);
  }
  writeFileSync(join(s.dir, '.env'), envWith(NEW_API, NEW_WEB));
  const r = upgrade(s, { args: ['--dir', s.dir, OLD_API, OLD_WEB] });
  assert.equal(r.status, 3, r.output);
  assert.match(r.output, /failed step=migrate before migrate/);
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
  assert.equal(r.db, 'new');
  assert.equal(r.maintenance, 'off');
  assert.deepEqual(r.images, { 'api': NEW_API, 'api-b': NEW_API });
});

test('reports a failed rollback when the previous images cannot be started', () => {
  const r = upgrade(stack(), { env: { STUB_FAIL: 'pull,up:1' } });
  assert.equal(r.status, 4, r.output);
  assert.equal(
    lastLine(r.stdout),
    '[studio-upgrade] result=rollback-failed exit=4',
  );
  assert.equal(r.env, ENV_FILE);
  assert.equal(
    r.maintenance,
    'on',
    'maintenance mode stays on when the previous images did not start',
  );
});

test('reports a failed rollback when migrate failed after changing the database', () => {
  const r = upgrade(stack(), { env: { STUB_FAIL: 'migrate-commit' } });
  assert.equal(r.status, 4, r.output);
  assert.match(r.output, /rollback failed/);
  assert.equal(r.db, 'new');
});

test('leaves maintenance on and the new images in place when a replica never reports its schema ok', () => {
  const r = upgrade(stack({ stuck: ['api-b'] }), {
    env: { STUB_STUCK_FOREVER: '1' },
  });
  assert.equal(r.status, 5, r.output);
  assert.equal(
    lastLine(r.stdout),
    '[studio-upgrade] result=fix-forward exit=5',
  );
  assert.match(
    r.output,
    /failed step=schema-wait after migrate changed the database/,
  );
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
  assert.equal(r.db, 'new');
  assert.equal(r.maintenance, 'on');
  assert.ok(!r.calls.includes('run --rm --no-deps api maintenance off'));
  assert.equal(r.calls.at(-1), 'up -d api-b');
});

test('recreates a replica that has not seen the migration, as the guide’s step 6 says, and finishes', () => {
  const r = upgrade(stack({ stuck: ['api-b'] }));
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(r.calls, [
    ...SEQUENCE.slice(0, -1),
    'up -d api-b',
    SEQUENCE.at(-1),
  ]);
});

test('leaves maintenance on when maintenance off fails after migrate', () => {
  const r = upgrade(stack(), { env: { STUB_FAIL: 'maintenance-off' } });
  assert.equal(r.status, 5, r.output);
  assert.match(r.output, /failed step=maintenance-off after migrate/);
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
  assert.equal(r.maintenance, 'on');
});

test('turns maintenance back on when a replica does not reopen after maintenance off', () => {
  const r = upgrade(stack(), { env: { STUB_STICKY_FLAG: '1' } });
  assert.equal(r.status, 5, r.output);
  assert.match(r.output, /failed step=reopen-wait after migrate/);
  assert.match(r.output, /maintenance mode was turned back on/);
  assert.equal(r.env, envWith(NEW_API, NEW_WEB));
  assert.equal(r.maintenance, 'on');
  assert.equal(r.calls.at(-1), 'run --rm --no-deps api maintenance on');
});

test('refuses, changing nothing, when the arguments or the stack are wrong', () => {
  for (const [args, env, message] of [
    [[NEW_API], {}, /expected two arguments/],
    [
      ['ghcr.io/complexdatacollective/studio-api:1.0.0', NEW_WEB],
      {},
      /api image is not pinned by digest/,
    ],
    [[NEW_API, NEW_WEB.slice(0, -1)], {}, /web image is not pinned by digest/],
    [[NEW_API, NEW_WEB], { STUDIO_API_IMAGE: NEW_API }, /override \.env/],
  ]) {
    const s = stack();
    const r = upgrade(s, { args: ['--dir', s.dir, ...args], env });
    assert.equal(r.status, 2, r.output);
    assert.equal(
      lastLine(r.stdout),
      '[studio-upgrade] result=not-started exit=2',
    );
    assert.match(r.output, message);
    assert.equal(r.env, ENV_FILE);
    assert.deepEqual(r.calls, []);
  }
  const s = stack();
  writeFileSync(
    join(s.dir, '.env'),
    ENV_FILE.replace(/^STUDIO_WEB_IMAGE=.*\n/m, ''),
  );
  const r = upgrade(s);
  assert.equal(r.status, 2, r.output);
  assert.match(r.output, /STUDIO_WEB_IMAGE on exactly one line/);
});
