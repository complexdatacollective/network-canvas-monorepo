import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MAXIMUM_FILE_BYTES = 16_384;
const MAXIMUM_IDENTITY_BYTES = 256;
const MAXIMUM_MONTHLY_LIMIT_BYTES = 50_000_000_000;
const FLOCK_TIMEOUT_MILLISECONDS = 5_000;
const FLOCK_CONFLICT_EXIT_CODE = 75;
const CONFIGURATION_DIGEST = /^[a-f0-9]{64}$/;
const ACCOUNT_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const MONTH_UTC = /^\d{4}-(?:0[1-9]|1[0-2])$/;

const codes = new Set([
  'EGRESS_BUDGET_ALREADY_BOOTSTRAPPED',
  'EGRESS_BUDGET_ANCHOR_MISMATCH',
  'EGRESS_BUDGET_ANCHOR_REQUIRED',
  'EGRESS_BUDGET_ANCHOR_UPDATE_FAILED',
  'EGRESS_BUDGET_CLOCK_ROLLBACK',
  'EGRESS_BUDGET_CLOSED',
  'EGRESS_BUDGET_EXHAUSTED',
  'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  'EGRESS_BUDGET_INPUT_INVALID',
  'EGRESS_BUDGET_IO_FAILED',
  'EGRESS_BUDGET_LOCKED',
  'EGRESS_BUDGET_MONTH_TRANSITION_REQUIRED',
  'EGRESS_BUDGET_PRIVATE_PATH_REQUIRED',
  'EGRESS_BUDGET_STATE_CORRUPT',
  'EGRESS_BUDGET_STATE_MISSING',
  'EGRESS_BUDGET_STATE_UNBOUND',
]);

export class EgressBudgetError extends Error {
  constructor(code) {
    const fixedCode = codes.has(code) ? code : 'EGRESS_BUDGET_IO_FAILED';
    super(fixedCode);
    this.name = 'EgressBudgetError';
    this.code = fixedCode;
  }
}

const refuse = (code) => {
  throw new EgressBudgetError(code);
};

const digest = (value) => createHash('sha256').update(value).digest('hex');

const exactKeys = (value, expected) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).toSorted().join(',') === expected.toSorted().join(',');

const safeInteger = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;

const entryExists = (path) =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined;

function validatedOptions(options) {
  if (
    !exactKeys(options, [
      'accountIdentity',
      'configurationIdentity',
      'directory',
      'finalSignalReserveBytes',
      'monthlyLimitBytes',
    ]) ||
    typeof options.directory !== 'string' ||
    !options.directory ||
    typeof options.accountIdentity !== 'string' ||
    Buffer.byteLength(options.accountIdentity) > MAXIMUM_IDENTITY_BYTES ||
    !ACCOUNT_IDENTITY.test(options.accountIdentity) ||
    typeof options.configurationIdentity !== 'string' ||
    !CONFIGURATION_DIGEST.test(options.configurationIdentity) ||
    !safeInteger(options.monthlyLimitBytes, 2) ||
    options.monthlyLimitBytes > MAXIMUM_MONTHLY_LIMIT_BYTES ||
    !safeInteger(options.finalSignalReserveBytes, 1) ||
    options.finalSignalReserveBytes >= options.monthlyLimitBytes
  )
    refuse('EGRESS_BUDGET_INPUT_INVALID');
  const bindingSha256 = digest(
    JSON.stringify({
      accountIdentity: options.accountIdentity,
      configurationIdentity: options.configurationIdentity,
      finalSignalReserveBytes: options.finalSignalReserveBytes,
      monthlyLimitBytes: options.monthlyLimitBytes,
    }),
  );
  return {
    accountIdentitySha256: digest(options.accountIdentity),
    bindingSha256,
    directory: resolve(options.directory),
    finalSignalReserveBytes: options.finalSignalReserveBytes,
    monthlyLimitBytes: options.monthlyLimitBytes,
    payloadLimitBytes:
      options.monthlyLimitBytes - options.finalSignalReserveBytes,
  };
}

function fsyncDirectory(directory) {
  const handle = openSync(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
  );
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function validateDirectory(path, handle) {
  const pathInfo = lstatSync(path);
  const handleInfo = fstatSync(handle);
  if (
    !pathInfo.isDirectory() ||
    pathInfo.isSymbolicLink() ||
    pathInfo.mode & 0o077 ||
    pathInfo.uid !== process.getuid() ||
    !handleInfo.isDirectory() ||
    pathInfo.dev !== handleInfo.dev ||
    pathInfo.ino !== handleInfo.ino
  )
    refuse('EGRESS_BUDGET_PRIVATE_PATH_REQUIRED');
}

function privateDirectory(path, create) {
  let created = false;
  if (create && !entryExists(path)) {
    mkdirSync(path, { mode: 0o700 });
    created = true;
  }
  let handle;
  try {
    const canonical = realpathSync(path);
    handle = openSync(
      canonical,
      constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_DIRECTORY ?? 0),
    );
    validateDirectory(canonical, handle);
    if (created) fsyncDirectory(dirname(canonical));
    return { handle, path: canonical };
  } catch (error) {
    if (handle !== undefined) closeSync(handle);
    if (error instanceof EgressBudgetError) throw error;
    return refuse('EGRESS_BUDGET_PRIVATE_PATH_REQUIRED');
  }
}

function validateDescriptor(path, handle, maximumBytes = MAXIMUM_FILE_BYTES) {
  const pathInfo = lstatSync(path);
  const handleInfo = fstatSync(handle);
  if (
    !pathInfo.isFile() ||
    pathInfo.isSymbolicLink() ||
    pathInfo.mode & 0o077 ||
    pathInfo.uid !== process.getuid() ||
    pathInfo.nlink !== 1 ||
    pathInfo.size > maximumBytes ||
    pathInfo.dev !== handleInfo.dev ||
    pathInfo.ino !== handleInfo.ino ||
    !handleInfo.isFile() ||
    handleInfo.nlink !== 1
  )
    refuse('EGRESS_BUDGET_PRIVATE_PATH_REQUIRED');
  return handleInfo;
}

function readPrivateFile(path) {
  const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    validateDescriptor(path, handle);
    return readFileSync(handle);
  } finally {
    closeSync(handle);
  }
}

function writePrivateFile(path, bytes, assertHeldPaths) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAXIMUM_FILE_BYTES)
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  assertHeldPaths();
  if (entryExists(path)) readPrivateFile(path);
  const directory = dirname(path);
  const temporary = join(directory, `.egress-budget-${randomUUID()}`);
  const handle = openSync(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    validateDescriptor(temporary, handle);
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    assertHeldPaths();
    renameSync(temporary, path);
    fsyncDirectory(directory);
    assertHeldPaths();
  } finally {
    if (entryExists(temporary)) unlinkSync(temporary);
  }
}

function envelope(payload) {
  const payloadBytes = JSON.stringify(payload);
  return Buffer.from(
    `${JSON.stringify({
      format: 1,
      payload,
      sha256: digest(payloadBytes),
    })}\n`,
  );
}

function readEnvelope(path) {
  let value;
  try {
    value = JSON.parse(readPrivateFile(path));
  } catch (error) {
    if (error instanceof EgressBudgetError) throw error;
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  }
  if (
    !exactKeys(value, ['format', 'payload', 'sha256']) ||
    value.format !== 1 ||
    typeof value.sha256 !== 'string' ||
    value.sha256 !== digest(JSON.stringify(value.payload))
  )
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  return value.payload;
}

function canonicalInstant(now) {
  const instant = now();
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime()))
    refuse('EGRESS_BUDGET_INPUT_INVALID');
  return instant.toISOString();
}

function monthUtc(instant) {
  return instant.slice(0, 7);
}

function nextMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 12
    ? `${year + 1}-01`
    : `${year}-${String(number + 1).padStart(2, '0')}`;
}

function validateIdentity(identity, expectedBinding) {
  if (
    !exactKeys(identity, ['bindingSha256', 'createdAt', 'format']) ||
    identity.format !== 1 ||
    !CONFIGURATION_DIGEST.test(identity.bindingSha256) ||
    canonicalStoredInstant(identity.createdAt) === null
  )
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  if (identity.bindingSha256 !== expectedBinding)
    refuse('EGRESS_BUDGET_STATE_UNBOUND');
  return identity;
}

function canonicalStoredInstant(value) {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function validateState(state, options) {
  const lastObserved = canonicalStoredInstant(state?.lastObservedAt);
  if (
    !exactKeys(state, [
      'bindingSha256',
      'exhausted',
      'finalSignalAttemptedBytes',
      'format',
      'lastObservedAt',
      'monthSequence',
      'monthUtc',
      'payloadAttemptedBytes',
      'reservationSequence',
    ]) ||
    state.format !== 1 ||
    !CONFIGURATION_DIGEST.test(state.bindingSha256) ||
    !MONTH_UTC.test(state.monthUtc) ||
    lastObserved === null ||
    monthUtc(state.lastObservedAt) !== state.monthUtc ||
    !safeInteger(state.monthSequence, 1) ||
    !safeInteger(state.reservationSequence) ||
    !safeInteger(state.payloadAttemptedBytes) ||
    !safeInteger(state.finalSignalAttemptedBytes) ||
    typeof state.exhausted !== 'boolean'
  )
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  if (state.bindingSha256 !== options.bindingSha256)
    refuse('EGRESS_BUDGET_STATE_UNBOUND');
  const minimumReservations =
    (state.payloadAttemptedBytes > 0 ? 1 : 0) +
    (state.finalSignalAttemptedBytes > 0 ? 1 : 0);
  if (
    state.payloadAttemptedBytes > options.payloadLimitBytes ||
    state.finalSignalAttemptedBytes > options.finalSignalReserveBytes ||
    (state.finalSignalAttemptedBytes > 0 && !state.exhausted) ||
    (state.payloadAttemptedBytes === options.payloadLimitBytes &&
      !state.exhausted) ||
    state.reservationSequence < minimumReservations
  )
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  return state;
}

function checkpoint(state, options) {
  return Object.freeze({
    accountIdentitySha256: options.accountIdentitySha256,
    bindingSha256: state.bindingSha256,
    exhausted: state.exhausted,
    finalSignalAttemptedBytes: state.finalSignalAttemptedBytes,
    finalSignalReserveBytes: options.finalSignalReserveBytes,
    format: 2,
    lastObservedAt: state.lastObservedAt,
    monthSequence: state.monthSequence,
    monthUtc: state.monthUtc,
    payloadAttemptedBytes: state.payloadAttemptedBytes,
    payloadLimitBytes: options.payloadLimitBytes,
    reservationSequence: state.reservationSequence,
    stateSha256: digest(JSON.stringify(state)),
  });
}

function validateCheckpoint(value, expected) {
  if (
    !exactKeys(value, [
      'accountIdentitySha256',
      'bindingSha256',
      'exhausted',
      'finalSignalAttemptedBytes',
      'finalSignalReserveBytes',
      'format',
      'lastObservedAt',
      'monthSequence',
      'monthUtc',
      'payloadAttemptedBytes',
      'payloadLimitBytes',
      'reservationSequence',
      'stateSha256',
    ]) ||
    value.format !== 2 ||
    value.accountIdentitySha256 !== expected.accountIdentitySha256 ||
    value.bindingSha256 !== expected.bindingSha256 ||
    value.finalSignalReserveBytes !== expected.finalSignalReserveBytes ||
    value.payloadLimitBytes !== expected.payloadLimitBytes ||
    typeof value.exhausted !== 'boolean' ||
    canonicalStoredInstant(value.lastObservedAt) === null ||
    !safeInteger(value.monthSequence, 1) ||
    !MONTH_UTC.test(value.monthUtc) ||
    monthUtc(value.lastObservedAt) !== value.monthUtc ||
    !safeInteger(value.payloadAttemptedBytes) ||
    value.payloadAttemptedBytes > value.payloadLimitBytes ||
    !safeInteger(value.finalSignalAttemptedBytes) ||
    value.finalSignalAttemptedBytes > value.finalSignalReserveBytes ||
    !safeInteger(value.reservationSequence) ||
    !CONFIGURATION_DIGEST.test(value.stateSha256)
  )
    refuse('EGRESS_BUDGET_ANCHOR_MISMATCH');
  return value;
}

const sameCheckpoint = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

function requiredAnchor(anchor) {
  if (
    anchor === null ||
    typeof anchor !== 'object' ||
    typeof anchor.read !== 'function' ||
    typeof anchor.initialize !== 'function' ||
    typeof anchor.advance !== 'function' ||
    typeof anchor.advanceMonth !== 'function'
  )
    refuse('EGRESS_BUDGET_ANCHOR_REQUIRED');
  return anchor;
}

function readAnchor(anchor, expected) {
  let observed;
  try {
    observed = anchor.read(expected.accountIdentitySha256);
  } catch {
    refuse('EGRESS_BUDGET_ANCHOR_UPDATE_FAILED');
  }
  validateCheckpoint(observed, expected);
  if (!sameCheckpoint(observed, expected))
    refuse('EGRESS_BUDGET_ANCHOR_MISMATCH');
}

function updateAnchor(anchor, method, previous, next, authorization) {
  try {
    if (method === 'advanceMonth')
      anchor.advanceMonth(previous, next, authorization);
    else anchor[method](previous, next);
  } catch {
    refuse('EGRESS_BUDGET_ANCHOR_UPDATE_FAILED');
  }
  readAnchor(anchor, next);
}

function acquireLock(directory, launch) {
  const path = join(directory.path, 'egress-budget.lock');
  const handle = openSync(
    path,
    constants.O_CREAT |
      constants.O_RDWR |
      constants.O_NOFOLLOW |
      constants.O_CLOEXEC,
    0o600,
  );
  const assertHeldPaths = () => {
    validateDirectory(directory.path, directory.handle);
    validateDescriptor(path, handle, 0);
  };
  try {
    assertHeldPaths();
    const result = launch(
      'flock',
      [
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code',
        String(FLOCK_CONFLICT_EXIT_CODE),
        '3',
      ],
      {
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'ignore', 'ignore', handle],
        timeout: FLOCK_TIMEOUT_MILLISECONDS,
      },
    );
    if (result?.status === FLOCK_CONFLICT_EXIT_CODE && !result.error)
      refuse('EGRESS_BUDGET_LOCKED');
    if (result?.error || result?.signal || result?.status !== 0)
      refuse('EGRESS_BUDGET_IO_FAILED');
    assertHeldPaths();
    return { assertHeldPaths, handle };
  } catch (error) {
    closeSync(handle);
    throw error;
  }
}

function closeCustody(directory, lock) {
  let failure;
  for (const handle of [lock?.handle, directory?.handle]) {
    if (handle === undefined) continue;
    try {
      closeSync(handle);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function statePaths(directory) {
  return {
    identity: join(directory, 'egress-budget-identity.json'),
    state: join(directory, 'egress-budget-state.json'),
  };
}

function initialState(bindingSha256, instant) {
  return {
    bindingSha256,
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    format: 1,
    lastObservedAt: instant,
    monthSequence: 1,
    monthUtc: monthUtc(instant),
    payloadAttemptedBytes: 0,
    reservationSequence: 0,
  };
}

function observeState(state, instant) {
  const observed = Date.parse(instant);
  const previous = Date.parse(state.lastObservedAt);
  if (observed < previous) refuse('EGRESS_BUDGET_CLOCK_ROLLBACK');
  const currentMonth = monthUtc(instant);
  if (currentMonth < state.monthUtc) refuse('EGRESS_BUDGET_CLOCK_ROLLBACK');
  if (currentMonth !== state.monthUtc)
    refuse('EGRESS_BUDGET_MONTH_TRANSITION_REQUIRED');
  return { ...state, lastObservedAt: instant };
}

function transitionedState(state, transition) {
  if (
    !exactKeys(transition, ['authorization', 'observedAt']) ||
    typeof transition.authorization !== 'string' ||
    transition.authorization.length < 1 ||
    transition.authorization.length > 4_096 ||
    canonicalStoredInstant(transition.observedAt) === null
  )
    refuse('EGRESS_BUDGET_INPUT_INVALID');
  const targetMonth = monthUtc(transition.observedAt);
  if (targetMonth !== nextMonth(state.monthUtc))
    refuse('EGRESS_BUDGET_MONTH_TRANSITION_REQUIRED');
  if (Date.parse(transition.observedAt) < Date.parse(state.lastObservedAt))
    refuse('EGRESS_BUDGET_CLOCK_ROLLBACK');
  return {
    ...state,
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    lastObservedAt: transition.observedAt,
    monthSequence: state.monthSequence + 1,
    monthUtc: targetMonth,
    payloadAttemptedBytes: 0,
    reservationSequence: 0,
  };
}

function readBoundState(paths, options) {
  const hasIdentity = entryExists(paths.identity);
  const hasState = entryExists(paths.state);
  if (!hasIdentity && !hasState) refuse('EGRESS_BUDGET_STATE_MISSING');
  if (!hasIdentity || !hasState) refuse('EGRESS_BUDGET_STATE_CORRUPT');
  const identity = validateIdentity(
    readEnvelope(paths.identity),
    options.bindingSha256,
  );
  const state = validateState(readEnvelope(paths.state), options);
  if (Date.parse(state.lastObservedAt) < Date.parse(identity.createdAt))
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
  return state;
}

function asPublicOperation(operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EgressBudgetError) throw error;
    return refuse('EGRESS_BUDGET_IO_FAILED');
  }
}

function receipt(state, kind, attemptedEstimatedBytes, payloadLimitBytes) {
  return Object.freeze({
    attemptedEstimatedBytes,
    bindingSha256: state.bindingSha256,
    exhausted: state.exhausted,
    kind,
    monthSequence: state.monthSequence,
    monthUtc: state.monthUtc,
    payloadRemainingBytes: payloadLimitBytes - state.payloadAttemptedBytes,
    reservationSequence: state.reservationSequence,
  });
}

class MonthlyEgressBudget {
  #anchor;
  #closed = false;
  #directory;
  #lock;
  #now;
  #options;
  #paths;
  #state;

  constructor(options, paths, directory, lock, state, now, anchor) {
    this.#options = options;
    this.#paths = paths;
    this.#directory = directory;
    this.#lock = lock;
    this.#state = state;
    this.#now = now;
    this.#anchor = anchor;
  }

  #requireOpen() {
    if (this.#closed) refuse('EGRESS_BUDGET_CLOSED');
    try {
      this.#lock.assertHeldPaths();
    } catch (error) {
      this.#poison(error);
    }
  }

  #poison(error) {
    this.#closed = true;
    try {
      closeCustody(this.#directory, this.#lock);
    } catch {
      // Preserve the original refusal.
    }
    throw error;
  }

  #persist(state) {
    const previous = checkpoint(this.#state, this.#options);
    const next = checkpoint(state, this.#options);
    try {
      writePrivateFile(
        this.#paths.state,
        envelope(state),
        this.#lock.assertHeldPaths,
      );
      updateAnchor(this.#anchor, 'advance', previous, next);
      this.#state = state;
    } catch (error) {
      // The rename may have completed even if the directory fsync failed. Do
      // not let this process write again from its now-uncertain in-memory view.
      this.#poison(error);
    }
  }

  reserveEstimatedIngest(estimatedIngestBytes) {
    return asPublicOperation(() => {
      this.#requireOpen();
      if (!safeInteger(estimatedIngestBytes, 1))
        refuse('EGRESS_BUDGET_INPUT_INVALID');
      let state = observeState(this.#state, canonicalInstant(this.#now));
      if (state.exhausted) {
        this.#persist(state);
        refuse('EGRESS_BUDGET_EXHAUSTED');
      }
      const next = state.payloadAttemptedBytes + estimatedIngestBytes;
      if (
        !Number.isSafeInteger(next) ||
        next > this.#options.payloadLimitBytes
      ) {
        state = { ...state, exhausted: true };
        this.#persist(state);
        refuse('EGRESS_BUDGET_EXHAUSTED');
      }
      state = {
        ...state,
        exhausted: next === this.#options.payloadLimitBytes,
        payloadAttemptedBytes: next,
        reservationSequence: state.reservationSequence + 1,
      };
      this.#persist(state);
      return receipt(
        state,
        'estimated-ingest',
        estimatedIngestBytes,
        this.#options.payloadLimitBytes,
      );
    });
  }

  reserveFinalExhaustionSignal(estimatedIngestBytes) {
    return asPublicOperation(() => {
      this.#requireOpen();
      if (!safeInteger(estimatedIngestBytes, 1))
        refuse('EGRESS_BUDGET_INPUT_INVALID');
      let state = observeState(this.#state, canonicalInstant(this.#now));
      if (
        !state.exhausted ||
        state.finalSignalAttemptedBytes !== 0 ||
        estimatedIngestBytes > this.#options.finalSignalReserveBytes
      ) {
        this.#persist(state);
        refuse('EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE');
      }
      state = {
        ...state,
        finalSignalAttemptedBytes: estimatedIngestBytes,
        reservationSequence: state.reservationSequence + 1,
      };
      this.#persist(state);
      return receipt(
        state,
        'final-exhaustion-signal',
        estimatedIngestBytes,
        this.#options.payloadLimitBytes,
      );
    });
  }

  close() {
    return asPublicOperation(() => {
      if (this.#closed) return;
      this.#closed = true;
      closeCustody(this.#directory, this.#lock);
    });
  }
}

export function createEgressBudgetOperations({
  anchor,
  launch = spawnSync,
  now = () => new Date(),
} = {}) {
  const durableAnchor = requiredAnchor(anchor);

  function withCustody(options, create, operation) {
    const validated = validatedOptions(options);
    const directory = privateDirectory(validated.directory, create);
    let lock;
    try {
      lock = acquireLock(directory, launch);
      return operation(validated, directory, lock);
    } catch (error) {
      try {
        closeCustody(directory, lock);
      } catch {
        // Preserve the operation refusal.
      }
      throw error;
    }
  }

  return Object.freeze({
    bootstrap(options) {
      return asPublicOperation(() =>
        withCustody(options, true, (validated, directory, lock) => {
          const paths = statePaths(directory.path);
          if (entryExists(paths.identity) || entryExists(paths.state))
            refuse('EGRESS_BUDGET_ALREADY_BOOTSTRAPPED');
          const instant = canonicalInstant(now);
          const state = initialState(validated.bindingSha256, instant);
          writePrivateFile(
            paths.identity,
            envelope({
              bindingSha256: validated.bindingSha256,
              createdAt: instant,
              format: 1,
            }),
            lock.assertHeldPaths,
          );
          writePrivateFile(paths.state, envelope(state), lock.assertHeldPaths);
          const next = checkpoint(state, validated);
          try {
            durableAnchor.initialize(next);
          } catch {
            refuse('EGRESS_BUDGET_ANCHOR_UPDATE_FAILED');
          }
          readAnchor(durableAnchor, next);
          closeCustody(directory, lock);
          return Object.freeze({
            bindingSha256: validated.bindingSha256,
            monthUtc: monthUtc(instant),
            payloadLimitBytes: validated.payloadLimitBytes,
          });
        }),
      );
    },

    open(options) {
      return asPublicOperation(() =>
        withCustody(options, false, (validated, directory, lock) => {
          const paths = statePaths(directory.path);
          const state = readBoundState(paths, validated);
          const previous = checkpoint(state, validated);
          readAnchor(durableAnchor, previous);
          const observedState = observeState(state, canonicalInstant(now));
          if (observedState.lastObservedAt !== state.lastObservedAt) {
            const next = checkpoint(observedState, validated);
            writePrivateFile(
              paths.state,
              envelope(observedState),
              lock.assertHeldPaths,
            );
            updateAnchor(durableAnchor, 'advance', previous, next);
          }
          return new MonthlyEgressBudget(
            validated,
            paths,
            directory,
            lock,
            observedState,
            now,
            durableAnchor,
          );
        }),
      );
    },

    transitionMonth(options, transition) {
      return asPublicOperation(() =>
        withCustody(options, false, (validated, directory, lock) => {
          const paths = statePaths(directory.path);
          const state = readBoundState(paths, validated);
          const previous = checkpoint(state, validated);
          readAnchor(durableAnchor, previous);
          const nextState = transitionedState(state, transition);
          const next = checkpoint(nextState, validated);
          writePrivateFile(
            paths.state,
            envelope(nextState),
            lock.assertHeldPaths,
          );
          updateAnchor(
            durableAnchor,
            'advanceMonth',
            previous,
            next,
            transition.authorization,
          );
          closeCustody(directory, lock);
          return Object.freeze({
            bindingSha256: validated.bindingSha256,
            monthSequence: nextState.monthSequence,
            monthUtc: nextState.monthUtc,
            payloadLimitBytes: validated.payloadLimitBytes,
          });
        }),
      );
    },
  });
}

export const bootstrapMonthlyEgressBudget = (options, dependencies) =>
  createEgressBudgetOperations(dependencies).bootstrap(options);

export const openMonthlyEgressBudget = (options, dependencies) =>
  createEgressBudgetOperations(dependencies).open(options);

export const transitionMonthlyEgressBudget = (
  options,
  transition,
  dependencies,
) =>
  createEgressBudgetOperations(dependencies).transitionMonth(
    options,
    transition,
  );
