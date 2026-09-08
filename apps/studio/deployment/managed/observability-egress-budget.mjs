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
const CONFIGURATION_DIGEST = /^[a-f0-9]{64}$/;
const ACCOUNT_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const MONTH_UTC = /^\d{4}-(?:0[1-9]|1[0-2])$/;

const codes = new Set([
  'EGRESS_BUDGET_ALREADY_BOOTSTRAPPED',
  'EGRESS_BUDGET_CLOCK_ROLLBACK',
  'EGRESS_BUDGET_CLOSED',
  'EGRESS_BUDGET_EXHAUSTED',
  'EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE',
  'EGRESS_BUDGET_INPUT_INVALID',
  'EGRESS_BUDGET_IO_FAILED',
  'EGRESS_BUDGET_LOCKED',
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
    bindingSha256,
    directory: resolve(options.directory),
    finalSignalReserveBytes: options.finalSignalReserveBytes,
    monthlyLimitBytes: options.monthlyLimitBytes,
    payloadLimitBytes:
      options.monthlyLimitBytes - options.finalSignalReserveBytes,
  };
}

function privateDirectory(path, create) {
  if (create && !entryExists(path)) mkdirSync(path, { mode: 0o700 });
  let info;
  try {
    info = lstatSync(path);
  } catch {
    refuse('EGRESS_BUDGET_PRIVATE_PATH_REQUIRED');
  }
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.uid !== process.getuid()
  )
    refuse('EGRESS_BUDGET_PRIVATE_PATH_REQUIRED');
  return realpathSync(path);
}

function validateDescriptor(path, handle, maximumBytes = MAXIMUM_FILE_BYTES) {
  const pathInfo = lstatSync(path);
  const handleInfo = fstatSync(handle);
  if (
    !pathInfo.isFile() ||
    pathInfo.isSymbolicLink() ||
    pathInfo.mode & 0o077 ||
    pathInfo.uid !== process.getuid() ||
    pathInfo.size > maximumBytes ||
    pathInfo.dev !== handleInfo.dev ||
    pathInfo.ino !== handleInfo.ino ||
    !handleInfo.isFile()
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

function fsyncDirectory(directory) {
  const handle = openSync(directory, constants.O_RDONLY);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function writePrivateFile(path, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAXIMUM_FILE_BYTES)
    refuse('EGRESS_BUDGET_STATE_CORRUPT');
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
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    renameSync(temporary, path);
    fsyncDirectory(directory);
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

function acquireLock(directory, launch) {
  const path = join(directory, 'egress-budget.lock');
  const handle = openSync(
    path,
    constants.O_CREAT |
      constants.O_RDWR |
      constants.O_NOFOLLOW |
      constants.O_CLOEXEC,
    0o600,
  );
  try {
    validateDescriptor(path, handle, 0);
    const result = launch('flock', ['--exclusive', '--nonblock', '3'], {
      stdio: ['ignore', 'ignore', 'ignore', handle],
    });
    if (result.error || result.status !== 0) refuse('EGRESS_BUDGET_LOCKED');
    return handle;
  } catch (error) {
    closeSync(handle);
    throw error;
  }
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

function advanceState(state, instant) {
  const observed = Date.parse(instant);
  const previous = Date.parse(state.lastObservedAt);
  if (observed < previous) refuse('EGRESS_BUDGET_CLOCK_ROLLBACK');
  const currentMonth = monthUtc(instant);
  if (currentMonth < state.monthUtc) refuse('EGRESS_BUDGET_CLOCK_ROLLBACK');
  if (currentMonth === state.monthUtc)
    return { ...state, lastObservedAt: instant };
  return {
    ...state,
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    lastObservedAt: instant,
    monthSequence: state.monthSequence + 1,
    monthUtc: currentMonth,
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
  #closed = false;
  #handle;
  #now;
  #options;
  #paths;
  #state;

  constructor(options, paths, handle, state, now) {
    this.#options = options;
    this.#paths = paths;
    this.#handle = handle;
    this.#state = state;
    this.#now = now;
  }

  #requireOpen() {
    if (this.#closed) refuse('EGRESS_BUDGET_CLOSED');
  }

  #persist(state) {
    try {
      writePrivateFile(this.#paths.state, envelope(state));
      this.#state = state;
    } catch (error) {
      // The rename may have completed even if the directory fsync failed. Do
      // not let this process write again from its now-uncertain in-memory view.
      this.#closed = true;
      try {
        closeSync(this.#handle);
      } catch {
        // Preserve the state-write failure as the fixed public refusal.
      }
      throw error;
    }
  }

  reserveEstimatedIngest(estimatedIngestBytes) {
    return asPublicOperation(() => {
      this.#requireOpen();
      if (!safeInteger(estimatedIngestBytes, 1))
        refuse('EGRESS_BUDGET_INPUT_INVALID');
      let state = advanceState(this.#state, canonicalInstant(this.#now));
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
      let state = advanceState(this.#state, canonicalInstant(this.#now));
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
      closeSync(this.#handle);
    });
  }
}

export function createEgressBudgetOperations({
  launch = spawnSync,
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    bootstrap(options) {
      return asPublicOperation(() => {
        const validated = validatedOptions(options);
        const directory = privateDirectory(validated.directory, true);
        const paths = statePaths(directory);
        const handle = acquireLock(directory, launch);
        try {
          if (entryExists(paths.identity) || entryExists(paths.state))
            refuse('EGRESS_BUDGET_ALREADY_BOOTSTRAPPED');
          const instant = canonicalInstant(now);
          writePrivateFile(
            paths.identity,
            envelope({
              bindingSha256: validated.bindingSha256,
              createdAt: instant,
              format: 1,
            }),
          );
          writePrivateFile(
            paths.state,
            envelope(initialState(validated.bindingSha256, instant)),
          );
          return Object.freeze({
            bindingSha256: validated.bindingSha256,
            monthUtc: monthUtc(instant),
            payloadLimitBytes: validated.payloadLimitBytes,
          });
        } finally {
          closeSync(handle);
        }
      });
    },

    open(options) {
      return asPublicOperation(() => {
        const validated = validatedOptions(options);
        const directory = privateDirectory(validated.directory, false);
        const paths = statePaths(directory);
        const handle = acquireLock(directory, launch);
        try {
          let state = readBoundState(paths, validated);
          state = advanceState(state, canonicalInstant(now));
          writePrivateFile(paths.state, envelope(state));
          return new MonthlyEgressBudget(validated, paths, handle, state, now);
        } catch (error) {
          closeSync(handle);
          throw error;
        }
      });
    },
  });
}

const operations = createEgressBudgetOperations();

export const bootstrapMonthlyEgressBudget = operations.bootstrap;
export const openMonthlyEgressBudget = operations.open;
