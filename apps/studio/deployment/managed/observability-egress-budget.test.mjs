import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  linkSync,
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
  const anchorPath = join(root, 'independent-anchor.json');
  const monthAuthorization = 'independently-authorized-next-month';
  const anchor = {
    advance(previous, next) {
      assert.deepEqual(this.read(), previous);
      writeFileSync(anchorPath, JSON.stringify(next));
    },
    advanceMonth(previous, next, authorization) {
      assert.equal(authorization, monthAuthorization);
      this.advance(previous, next);
    },
    initialize(next) {
      assert.equal(lstatSync(anchorPath, { throwIfNoEntry: false }), undefined);
      writeFileSync(anchorPath, JSON.stringify(next));
    },
    read() {
      return JSON.parse(readFileSync(anchorPath, 'utf8'));
    },
  };
  const launch = (_program, args, spawnOptions) =>
    spawnSync(
      process.platform === 'linux' ? 'flock' : flock,
      args,
      spawnOptions,
    );
  return {
    anchor,
    anchorPath,
    bin,
    directory,
    launch,
    monthAuthorization,
    options,
    root,
  };
}

const operationsFor = (budgetFixture, overrides = {}) =>
  createEgressBudgetOperations({
    anchor: budgetFixture.anchor,
    launch: budgetFixture.launch,
    ...overrides,
  });

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof EgressBudgetError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

function readPayload(path) {
  return JSON.parse(readFileSync(path)).payload;
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('explicit bootstrap creates private bound state and reservations survive restart', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f, {
    now: () => new Date('2026-09-08T12:00:00.000Z'),
  });
  mkdirSync(f.directory, { mode: 0o700 });
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_STATE_MISSING',
  );
  const initialized = await operations.bootstrap(f.options);
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

  const first = await operations.open(f.options);
  assert.deepEqual(await first.reserveEstimatedIngest(400), {
    attemptedEstimatedBytes: 400,
    bindingSha256: initialized.bindingSha256,
    exhausted: false,
    kind: 'estimated-ingest',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadRemainingBytes: 500,
    reservationSequence: 1,
  });
  await first.close();
  await expectCode(
    () => first.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOSED',
  );

  const restarted = await operations.open(f.options);
  const second = await restarted.reserveEstimatedIngest(500);
  assert.equal(second.payloadRemainingBytes, 0);
  assert.equal(second.exhausted, true);
  assert.equal(second.reservationSequence, 2);
  const signal = await restarted.reserveFinalExhaustionSignal(80);
  assert.equal(signal.kind, 'final-exhaustion-signal');
  assert.equal(signal.reservationSequence, 3);
  await expectCode(
    () => restarted.reserveFinalExhaustionSignal(1),
    'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  );
  await restarted.close();

  const state = readPayload(join(f.directory, 'egress-budget-state.json'));
  assert.equal(state.payloadAttemptedBytes, 900);
  assert.equal(state.finalSignalAttemptedBytes, 80);
});

test('exhaustion is durable and reserves the final signal outside payload capacity', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f, {
    now: () => new Date('2026-09-08T12:00:00.000Z'),
  });
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  await budget.reserveEstimatedIngest(899);
  await expectCode(
    () => budget.reserveEstimatedIngest(2),
    'EGRESS_BUDGET_EXHAUSTED',
  );
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_EXHAUSTED',
  );
  await expectCode(
    () => budget.reserveFinalExhaustionSignal(101),
    'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  );
  const signal = await budget.reserveFinalExhaustionSignal(100);
  assert.equal(signal.attemptedEstimatedBytes, 100);
  await budget.close();

  const state = readPayload(join(f.directory, 'egress-budget-state.json'));
  assert.equal(state.exhausted, true);
  assert.equal(state.payloadAttemptedBytes, 899);
  assert.equal(state.finalSignalAttemptedBytes, 100);
});

test('configuration cannot raise the local gate above the measured 50 GB forecast bound', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await expectCode(
    () =>
      operations.bootstrap({
        ...f.options,
        monthlyLimitBytes: 50_000_000_001,
      }),
    'EGRESS_BUDGET_INPUT_INVALID',
  );
});

test('an independent anchor is mandatory and detects a valid older-state rollback', async (t) => {
  const f = fixture(t);
  await expectCode(
    async () => createEgressBudgetOperations(),
    'EGRESS_BUDGET_ANCHOR_REQUIRED',
  );
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const statePath = join(f.directory, 'egress-budget-state.json');
  const olderState = join(f.root, 'older-state.json');
  copyFileSync(statePath, olderState);
  const budget = await operations.open(f.options);
  await budget.reserveEstimatedIngest(400);
  await budget.close();
  copyFileSync(olderState, statePath);
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_ANCHOR_MISMATCH',
  );
});

test('a missing checkpoint and a mismatched update readback both fail closed', async (t) => {
  await t.test('checkpoint disappearance refuses open', async (context) => {
    const f = fixture(context);
    const operations = operationsFor(f);
    await operations.bootstrap(f.options);
    unlinkSync(f.anchorPath);
    await expectCode(
      () => operations.open(f.options),
      'EGRESS_BUDGET_ANCHOR_UPDATE_FAILED',
    );
  });

  await t.test(
    'wrong readback poisons a completed local write',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      const budget = await operations.open(f.options);
      f.anchor.advance = () => {};
      await expectCode(
        () => budget.reserveEstimatedIngest(100),
        'EGRESS_BUDGET_ANCHOR_MISMATCH',
      );
      await expectCode(
        () => budget.reserveEstimatedIngest(1),
        'EGRESS_BUDGET_CLOSED',
      );
    },
  );
});

test('an ambiguous anchor advance closes the budget before forwarding', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  f.anchor.advance = () => {
    throw new Error('synthetic timeout after an unknown commit point');
  };
  await expectCode(
    () => budget.reserveEstimatedIngest(100),
    'EGRESS_BUDGET_ANCHOR_UPDATE_FAILED',
  );
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOSED',
  );
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_ANCHOR_MISMATCH',
  );
});

test('an anchor commit followed by a transport error still refuses that call and retains the debit', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  f.anchor.advance = function advanceThenLoseResponse(previous, next) {
    assert.deepEqual(this.read(), previous);
    writeFileSync(f.anchorPath, JSON.stringify(next));
    throw new Error('synthetic lost response after commit');
  };
  await expectCode(
    () => budget.reserveEstimatedIngest(100),
    'EGRESS_BUDGET_ANCHOR_UPDATE_FAILED',
  );
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOSED',
  );

  f.anchor.advance = function advance(previous, next) {
    assert.deepEqual(this.read(), previous);
    writeFileSync(f.anchorPath, JSON.stringify(next));
  };
  const restarted = await operations.open(f.options);
  const receipt = await restarted.reserveEstimatedIngest(1);
  assert.equal(receipt.reservationSequence, 2);
  assert.equal(receipt.payloadRemainingBytes, 799);
  await restarted.close();
});

test('a reservation is serialized and withheld until durable CAS acknowledgement', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  const acknowledgement = deferred();
  let calls = 0;
  f.anchor.advance = async function delayedAdvance(previous, next) {
    calls += 1;
    assert.deepEqual(this.read(), previous);
    writeFileSync(f.anchorPath, JSON.stringify(next));
    await acknowledgement.promise;
  };
  let granted = false;
  const first = budget.reserveEstimatedIngest(100).then((value) => {
    granted = true;
    return value;
  });
  const second = budget.reserveEstimatedIngest(200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(granted, false);
  assert.equal(calls, 1);
  assert.equal(
    readPayload(join(f.directory, 'egress-budget-state.json'))
      .payloadAttemptedBytes,
    100,
  );
  acknowledgement.resolve();
  assert.equal((await first).reservationSequence, 1);
  assert.equal((await second).reservationSequence, 2);
  assert.equal(calls, 2);
  await budget.close();
});

test('close drains admitted work and immediately refuses new reservations', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  const acknowledgement = deferred();
  f.anchor.advance = async function delayedAdvance(previous, next) {
    assert.deepEqual(this.read(), previous);
    writeFileSync(f.anchorPath, JSON.stringify(next));
    await acknowledgement.promise;
  };
  const reservation = budget.reserveEstimatedIngest(100);
  const closing = budget.close();
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOSED',
  );
  let closed = false;
  void closing.then(() => {
    closed = true;
    return undefined;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false);
  acknowledgement.resolve();
  assert.equal((await reservation).reservationSequence, 1);
  await closing;
  assert.equal(closed, true);
});

test('month rollover requires an independently authorized transition', async (t) => {
  const f = fixture(t);
  let instant = new Date('2026-09-30T23:59:59.000Z');
  const operations = operationsFor(f, {
    now: () => instant,
  });
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  await budget.reserveEstimatedIngest(300);
  await budget.close();
  instant = new Date('2026-10-01T00:00:01.000Z');
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_MONTH_TRANSITION_REQUIRED',
  );
  await expectCode(
    () =>
      operations.transitionMonth(f.options, {
        authorization: 'invented-local-approval',
        observedAt: instant.toISOString(),
      }),
    'EGRESS_BUDGET_ANCHOR_UPDATE_FAILED',
  );
  // The failed authorization leaves local state ahead of the independent
  // checkpoint, so an operator must reconcile the ambiguous attempt.
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_ANCHOR_MISMATCH',
  );
});

test('an authorized next-month transition resets capacity once', async (t) => {
  const f = fixture(t);
  let instant = new Date('2026-09-30T23:59:59.000Z');
  const operations = operationsFor(f, { now: () => instant });
  await operations.bootstrap(f.options);
  const September = await operations.open(f.options);
  await September.reserveEstimatedIngest(300);
  await September.close();
  instant = new Date('2026-10-01T00:00:01.000Z');
  await operations.transitionMonth(f.options, {
    authorization: f.monthAuthorization,
    observedAt: instant.toISOString(),
  });
  const budget = await operations.open(f.options);
  const October = await budget.reserveEstimatedIngest(100);
  assert.equal(October.monthUtc, '2026-10');
  assert.equal(October.monthSequence, 2);
  assert.equal(October.payloadRemainingBytes, 800);
  instant = new Date('2026-09-30T23:59:58.000Z');
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOCK_ROLLBACK',
  );
  await budget.close();
});

test('opening advances the anchored clock observation before returning', async (t) => {
  const f = fixture(t);
  let instant = new Date('2026-09-08T12:00:00.000Z');
  const operations = operationsFor(f, { now: () => instant });
  await operations.bootstrap(f.options);
  instant = new Date('2026-09-08T13:00:00.000Z');
  await (await operations.open(f.options)).close();
  instant = new Date('2026-09-08T12:30:00.000Z');
  await expectCode(
    () => operations.open(f.options),
    'EGRESS_BUDGET_CLOCK_ROLLBACK',
  );
});

test('a state-write refusal poisons the held view before it can overwrite uncertainty', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const budget = await operations.open(f.options);
  const statePath = join(f.directory, 'egress-budget-state.json');
  chmodSync(statePath, 0o644);
  await expectCode(
    () => budget.reserveEstimatedIngest(100),
    'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
  );
  await expectCode(
    () => budget.reserveEstimatedIngest(1),
    'EGRESS_BUDGET_CLOSED',
  );
  chmodSync(statePath, 0o600);
  const recovered = await operations.open(f.options);
  assert.equal(
    (await recovered.reserveEstimatedIngest(1)).payloadRemainingBytes,
    899,
  );
  await recovered.close();
});

test('hard-linked files and replaced held lock or directory inodes are refused', async (t) => {
  await t.test('state and lock hard links are refused', async (context) => {
    const f = fixture(context);
    const operations = operationsFor(f);
    await operations.bootstrap(f.options);
    const state = join(f.directory, 'egress-budget-state.json');
    linkSync(state, join(f.root, 'state-hard-link.json'));
    await expectCode(
      () => operations.open(f.options),
      'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
    );
    unlinkSync(join(f.root, 'state-hard-link.json'));
    const lock = join(f.directory, 'egress-budget.lock');
    linkSync(lock, join(f.root, 'lock-hard-link'));
    await expectCode(
      () => operations.open(f.options),
      'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
    );
  });

  await t.test(
    'a replaced lock inode poisons the held budget',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      const budget = await operations.open(f.options);
      const lock = join(f.directory, 'egress-budget.lock');
      unlinkSync(lock);
      writeFileSync(lock, '', { mode: 0o600 });
      await expectCode(
        () => budget.reserveEstimatedIngest(1),
        'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
      );
      await budget.close();
    },
  );

  await t.test(
    'a replaced directory inode poisons the held budget',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      const budget = await operations.open(f.options);
      const moved = join(f.root, 'old-state-directory');
      renameSync(f.directory, moved);
      mkdirSync(f.directory, { mode: 0o700 });
      await expectCode(
        () => budget.reserveEstimatedIngest(1),
        'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
      );
      await budget.close();
    },
  );
});

test('flock is bounded and only its explicit conflict exit means contention', async (t) => {
  const f = fixture(t);
  let invocation;
  const operations = operationsFor(f, {
    launch(program, args, options) {
      invocation = { args, options, program };
      return { error: new Error('ETIMEDOUT'), signal: 'SIGKILL', status: null };
    },
  });
  await expectCode(
    () => operations.bootstrap(f.options),
    'EGRESS_BUDGET_IO_FAILED',
  );
  assert.equal(invocation.program, 'flock');
  assert.deepEqual(invocation.args, [
    '--exclusive',
    '--nonblock',
    '--conflict-exit-code',
    '75',
    '3',
  ]);
  assert.equal(invocation.options.timeout, 5_000);
  assert.equal(invocation.options.killSignal, 'SIGKILL');
});

test('a real hanging lock helper is killed at the configured deadline', async (t) => {
  const f = fixture(t);
  const hangingFlock = join(f.root, 'hanging-flock.mjs');
  writeFileSync(hangingFlock, 'setInterval(() => {}, 30_000);\n', {
    mode: 0o700,
  });
  const operations = operationsFor(f, {
    launch(_program, args, options) {
      return spawnSync(process.execPath, [hangingFlock, ...args], options);
    },
  });
  const started = Date.now();
  await expectCode(
    () => operations.bootstrap(f.options),
    'EGRESS_BUDGET_IO_FAILED',
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 4_500, `helper exited too early after ${elapsed}ms`);
  assert.ok(elapsed < 8_000, `helper was not bounded: ${elapsed}ms`);
});

test('missing, corrupt, unbound and replaced private state all fail closed', async (t) => {
  await t.test(
    'lost state cannot be bootstrapped back to zero',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      unlinkSync(join(f.directory, 'egress-budget-state.json'));
      await expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
      await expectCode(
        () => operations.bootstrap(f.options),
        'EGRESS_BUDGET_ALREADY_BOOTSTRAPPED',
      );
    },
  );

  await t.test(
    'truncated, digest-invalid and impossible state is refused',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      const statePath = join(f.directory, 'egress-budget-state.json');
      const original = JSON.parse(readFileSync(statePath));
      writeFileSync(statePath, '{', {
        mode: 0o600,
      });
      await expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
      writeFileSync(
        statePath,
        JSON.stringify({ ...original, sha256: '0'.repeat(64) }),
      );
      await expectCode(
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
      await expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
    },
  );

  await t.test(
    'a different account, policy or limit cannot reuse state',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      for (const changed of [
        { accountIdentity: 'different-free-account' },
        { configurationIdentity: 'd'.repeat(64) },
        { monthlyLimitBytes: 999 },
        { finalSignalReserveBytes: 99 },
      ])
        await expectCode(
          () => operations.open({ ...f.options, ...changed }),
          'EGRESS_BUDGET_STATE_UNBOUND',
        );
    },
  );

  await t.test(
    'state links and permissive modes are refused',
    async (context) => {
      const f = fixture(context);
      const operations = operationsFor(f);
      await operations.bootstrap(f.options);
      const state = join(f.directory, 'egress-budget-state.json');
      const moved = join(f.directory, 'moved-state.json');
      renameSync(state, moved);
      symlinkSync(moved, state);
      await expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_STATE_CORRUPT',
      );
      unlinkSync(state);
      renameSync(moved, state);
      chmodSync(state, 0o644);
      await expectCode(
        () => operations.open(f.options),
        'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
      );
    },
  );
});

function childProgram(f) {
  const path = join(f.root, 'child.mjs');
  const moduleUrl = new URL(
    './observability-egress-budget.mjs',
    import.meta.url,
  ).href;
  writeFileSync(
    path,
    `import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createEgressBudgetOperations } from ${JSON.stringify(moduleUrl)};
const options = JSON.parse(process.argv[2]);
const mode = process.argv[3];
const anchorPath = process.argv[4];
const anchor = {
  read() { return JSON.parse(readFileSync(anchorPath, 'utf8')); },
  initialize() { throw new Error('already initialized'); },
  advance(previous, next) {
    assert.deepEqual(this.read(), previous);
    writeFileSync(anchorPath, JSON.stringify(next));
  },
  advanceMonth() { throw new Error('not used'); },
};
try {
  const budget = await createEgressBudgetOperations({ anchor }).open(options);
  if (mode === 'reserve') await budget.reserveEstimatedIngest(123);
  process.stdout.write(mode === 'reserve' ? 'RESERVED\\n' : 'LOCKED\\n');
  process.stdin.resume();
  process.stdin.once('end', async () => {
    await budget.close();
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
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('child readiness timed out'));
    }, 5_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) {
        clearTimeout(timeout);
        resolve(output.trim());
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (status) => {
      if (!output.includes('\n')) {
        clearTimeout(timeout);
        reject(new Error(`child exited before readiness: ${status}`));
      }
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('child exit timed out'));
    }, 5_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (status, signal) => {
      clearTimeout(timeout);
      resolve({ signal, status });
    });
  });
}

test('the inherited kernel lock refuses a concurrent process and releases cleanly', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const child = spawn(
    process.execPath,
    [childProgram(f), JSON.stringify(f.options), 'hold', f.anchorPath],
    {
      env: { PATH: `${f.bin}:${process.env.PATH}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  t.after(() => child.kill('SIGKILL'));
  assert.equal(await waitForLine(child), 'LOCKED');
  await expectCode(() => operations.open(f.options), 'EGRESS_BUDGET_LOCKED');
  const exitPromise = waitForExit(child);
  child.stdin.end();
  assert.deepEqual(await exitPromise, { signal: null, status: 0 });
  const reopened = await operations.open(f.options);
  await reopened.close();
});

test('a crash after reservation cannot refund an ambiguous attempted send', async (t) => {
  const f = fixture(t);
  const operations = operationsFor(f);
  await operations.bootstrap(f.options);
  const child = spawn(
    process.execPath,
    [childProgram(f), JSON.stringify(f.options), 'reserve', f.anchorPath],
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

  const restarted = await operations.open(f.options);
  const next = await restarted.reserveEstimatedIngest(1);
  assert.equal(next.reservationSequence, 2);
  assert.equal(next.payloadRemainingBytes, 776);
  await restarted.close();
});
