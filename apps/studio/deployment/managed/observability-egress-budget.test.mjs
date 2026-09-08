import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EgressBudgetError,
  createEgressBudgetOperations,
} from './observability-egress-budget.mjs';

const configurationIdentity = 'c'.repeat(64);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'studio-egress-budget-'));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  const flock = join(bin, 'flock');
  writeFileSync(
    flock,
    `#!/usr/bin/perl
use strict;
use warnings;
use Fcntl qw(LOCK_EX LOCK_NB);
open(my $lock, '+<&=3') or exit 73;
flock($lock, LOCK_EX | LOCK_NB) or exit 75;
exit 0;
`,
    { mode: 0o700 },
  );
  const directory = join(root, 'state');
  const options = {
    accountIdentity: 'synthetic-free-account',
    configurationIdentity,
    directory,
    finalSignalReserveBytes: 100,
    monthlyLimitBytes: 1_000,
  };
  const launch = (_program, args, spawnOptions) =>
    spawnSync(flock, args, spawnOptions);
  return { bin, directory, launch, options, root };
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof EgressBudgetError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

function readPayload(path) {
  return JSON.parse(readFileSync(path)).payload;
}

test('explicit bootstrap creates private bound state and reservations survive restart', (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({
    launch: f.launch,
    now: () => new Date('2026-09-08T12:00:00.000Z'),
  });
  mkdirSync(f.directory, { mode: 0o700 });
  expectCode(() => operations.open(f.options), 'EGRESS_BUDGET_STATE_MISSING');
  const initialized = operations.bootstrap(f.options);
  assert.deepEqual(initialized, {
    bindingSha256: initialized.bindingSha256,
    monthUtc: '2026-09',
    payloadLimitBytes: 900,
  });
  assert.match(initialized.bindingSha256, /^[a-f0-9]{64}$/);
  assert.equal(lstatSync(f.directory).mode & 0o777, 0o700);
  for (const name of [
    'egress-budget-identity.json',
    'egress-budget-state.json',
    'egress-budget.lock',
  ])
    assert.equal(lstatSync(join(f.directory, name)).mode & 0o777, 0o600);

  const serialized = readFileSync(
    join(f.directory, 'egress-budget-identity.json'),
    'utf8',
  );
  assert.equal(serialized.includes(f.options.accountIdentity), false);
  assert.equal(serialized.includes(f.options.configurationIdentity), false);

  const first = operations.open(f.options);
  assert.deepEqual(first.reserveEstimatedIngest(400), {
    attemptedEstimatedBytes: 400,
    bindingSha256: initialized.bindingSha256,
    exhausted: false,
    kind: 'estimated-ingest',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadRemainingBytes: 500,
    reservationSequence: 1,
  });
  first.close();
  expectCode(() => first.reserveEstimatedIngest(1), 'EGRESS_BUDGET_CLOSED');

  const restarted = operations.open(f.options);
  const second = restarted.reserveEstimatedIngest(500);
  assert.equal(second.payloadRemainingBytes, 0);
  assert.equal(second.exhausted, true);
  assert.equal(second.reservationSequence, 2);
  const signal = restarted.reserveFinalExhaustionSignal(80);
  assert.equal(signal.kind, 'final-exhaustion-signal');
  assert.equal(signal.reservationSequence, 3);
  expectCode(
    () => restarted.reserveFinalExhaustionSignal(1),
    'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  );
  restarted.close();

  const state = readPayload(join(f.directory, 'egress-budget-state.json'));
  assert.equal(state.payloadAttemptedBytes, 900);
  assert.equal(state.finalSignalAttemptedBytes, 80);
});

test('exhaustion is durable and reserves the final signal outside payload capacity', (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({
    launch: f.launch,
    now: () => new Date('2026-09-08T12:00:00.000Z'),
  });
  operations.bootstrap(f.options);
  const budget = operations.open(f.options);
  budget.reserveEstimatedIngest(899);
  expectCode(() => budget.reserveEstimatedIngest(2), 'EGRESS_BUDGET_EXHAUSTED');
  expectCode(() => budget.reserveEstimatedIngest(1), 'EGRESS_BUDGET_EXHAUSTED');
  expectCode(
    () => budget.reserveFinalExhaustionSignal(101),
    'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  );
  const signal = budget.reserveFinalExhaustionSignal(100);
  assert.equal(signal.attemptedEstimatedBytes, 100);
  budget.close();

  const state = readPayload(join(f.directory, 'egress-budget-state.json'));
  assert.equal(state.exhausted, true);
  assert.equal(state.payloadAttemptedBytes, 899);
  assert.equal(state.finalSignalAttemptedBytes, 100);
});

test('configuration cannot raise the local gate above the measured 50 GB forecast bound', (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({ launch: f.launch });
  expectCode(
    () =>
      operations.bootstrap({
        ...f.options,
        monthlyLimitBytes: 50_000_000_001,
      }),
    'EGRESS_BUDGET_INPUT_INVALID',
  );
});

test('month rollover is monotonic and a clock rollback closes admission', (t) => {
  const f = fixture(t);
  let instant = new Date('2026-09-30T23:59:59.000Z');
  const operations = createEgressBudgetOperations({
    launch: f.launch,
    now: () => instant,
  });
  operations.bootstrap(f.options);
  const budget = operations.open(f.options);
  budget.reserveEstimatedIngest(300);
  instant = new Date('2026-10-01T00:00:01.000Z');
  const October = budget.reserveEstimatedIngest(100);
  assert.equal(October.monthUtc, '2026-10');
  assert.equal(October.monthSequence, 2);
  assert.equal(October.payloadRemainingBytes, 800);
  instant = new Date('2026-09-30T23:59:58.000Z');
  expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOCK_ROLLBACK',
  );
  budget.close();
});

test('a state-write refusal poisons the held view before it can overwrite uncertainty', (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({ launch: f.launch });
  operations.bootstrap(f.options);
  const budget = operations.open(f.options);
  const statePath = join(f.directory, 'egress-budget-state.json');
  chmodSync(statePath, 0o644);
  expectCode(
    () => budget.reserveEstimatedIngest(100),
    'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
  );
  expectCode(() => budget.reserveEstimatedIngest(1), 'EGRESS_BUDGET_CLOSED');
  chmodSync(statePath, 0o600);
  const recovered = operations.open(f.options);
  assert.equal(recovered.reserveEstimatedIngest(1).payloadRemainingBytes, 899);
  recovered.close();
});

test('missing, corrupt, unbound and replaced private state all fail closed', async (t) => {
  await t.test('lost state cannot be bootstrapped back to zero', (context) => {
    const f = fixture(context);
    const operations = createEgressBudgetOperations({ launch: f.launch });
    operations.bootstrap(f.options);
    unlinkSync(join(f.directory, 'egress-budget-state.json'));
    expectCode(() => operations.open(f.options), 'EGRESS_BUDGET_STATE_CORRUPT');
    expectCode(
      () => operations.bootstrap(f.options),
      'EGRESS_BUDGET_ALREADY_BOOTSTRAPPED',
    );
  });

  await t.test(
    'truncated, digest-invalid and impossible state is refused',
    (context) => {
      const f = fixture(context);
      const operations = createEgressBudgetOperations({ launch: f.launch });
      operations.bootstrap(f.options);
      const statePath = join(f.directory, 'egress-budget-state.json');
      const original = JSON.parse(readFileSync(statePath));
      writeFileSync(statePath, '{', {
        mode: 0o600,
      });
      expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
      writeFileSync(
        statePath,
        JSON.stringify({ ...original, sha256: '0'.repeat(64) }),
      );
      expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
      const impossible = {
        ...original.payload,
        exhausted: true,
        payloadAttemptedBytes: 901,
        reservationSequence: 1,
      };
      writeFileSync(
        statePath,
        JSON.stringify({
          ...original,
          payload: impossible,
          sha256: createHash('sha256')
            .update(JSON.stringify(impossible))
            .digest('hex'),
        }),
      );
      expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
    },
  );

  await t.test(
    'a different account, policy or limit cannot reuse state',
    (context) => {
      const f = fixture(context);
      const operations = createEgressBudgetOperations({ launch: f.launch });
      operations.bootstrap(f.options);
      for (const changed of [
        { accountIdentity: 'different-free-account' },
        { configurationIdentity: 'd'.repeat(64) },
        { monthlyLimitBytes: 999 },
        { finalSignalReserveBytes: 99 },
      ])
        expectCode(
          () => operations.open({ ...f.options, ...changed }),
          'EGRESS_BUDGET_STATE_UNBOUND',
        );
    },
  );

  await t.test('state links and permissive modes are refused', (context) => {
    const f = fixture(context);
    const operations = createEgressBudgetOperations({ launch: f.launch });
    operations.bootstrap(f.options);
    const state = join(f.directory, 'egress-budget-state.json');
    const moved = join(f.directory, 'moved-state.json');
    renameSync(state, moved);
    symlinkSync(moved, state);
    expectCode(() => operations.open(f.options), 'EGRESS_BUDGET_STATE_CORRUPT');
    unlinkSync(state);
    renameSync(moved, state);
    chmodSync(state, 0o644);
    expectCode(
      () => operations.open(f.options),
      'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
    );
  });
});

function childProgram(f) {
  const path = join(f.root, 'child.mjs');
  const moduleUrl = new URL(
    './observability-egress-budget.mjs',
    import.meta.url,
  ).href;
  writeFileSync(
    path,
    `import { openMonthlyEgressBudget } from ${JSON.stringify(moduleUrl)};
const options = JSON.parse(process.argv[2]);
const mode = process.argv[3];
try {
  const budget = openMonthlyEgressBudget(options);
  if (mode === 'reserve') budget.reserveEstimatedIngest(123);
  process.stdout.write(mode === 'reserve' ? 'RESERVED\\n' : 'LOCKED\\n');
  process.stdin.resume();
  process.stdin.once('end', () => {
    budget.close();
  });
} catch (error) {
  process.stdout.write(\`ERROR:\${error?.code ?? 'UNKNOWN'}\\n\`);
  process.exitCode = 1;
}
`,
    { mode: 0o700 },
  );
  return path;
}

function waitForLine(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) resolve(output.trim());
    });
    child.once('error', reject);
    child.once('exit', (status) => {
      if (!output.includes('\n'))
        reject(new Error(`child exited before readiness: ${status}`));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status, signal) => resolve({ signal, status }));
  });
}

test('the inherited kernel lock refuses a concurrent process and releases cleanly', async (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({ launch: f.launch });
  operations.bootstrap(f.options);
  const child = spawn(
    process.execPath,
    [childProgram(f), JSON.stringify(f.options), 'hold'],
    {
      env: { PATH: `${f.bin}:${process.env.PATH}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  t.after(() => child.kill('SIGKILL'));
  assert.equal(await waitForLine(child), 'LOCKED');
  expectCode(() => operations.open(f.options), 'EGRESS_BUDGET_LOCKED');
  const exitPromise = waitForExit(child);
  child.stdin.end();
  assert.deepEqual(await exitPromise, { signal: null, status: 0 });
  const reopened = operations.open(f.options);
  reopened.close();
});

test('a crash after reservation cannot refund an ambiguous attempted send', async (t) => {
  const f = fixture(t);
  const operations = createEgressBudgetOperations({ launch: f.launch });
  operations.bootstrap(f.options);
  const child = spawn(
    process.execPath,
    [childProgram(f), JSON.stringify(f.options), 'reserve'],
    {
      env: { PATH: `${f.bin}:${process.env.PATH}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  assert.equal(await waitForLine(child), 'RESERVED');
  const exitPromise = waitForExit(child);
  child.kill('SIGKILL');
  const exit = await exitPromise;
  assert.equal(exit.signal, 'SIGKILL');

  const restarted = operations.open(f.options);
  const next = restarted.reserveEstimatedIngest(1);
  assert.equal(next.reservationSequence, 2);
  assert.equal(next.payloadRemainingBytes, 776);
  restarted.close();
});
