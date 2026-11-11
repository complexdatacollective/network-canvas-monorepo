import type { FixOperation } from '@codaco/protocol-review-worker/contract';
import {
  type CurrentProtocol,
  validateProtocol,
  withInterfaceText,
} from '@codaco/protocol-validation';

import {
  applyOperations,
  planFix,
  type StoredOperation,
  type TargetSnapshot,
  type WrittenSnapshot,
} from './fixEngine';
import { formatPath, isJsonObject, parsePath, readPath } from './fixPath';

/**
 * A fix's edits as they meet a real protocol: written in the protocol's own
 * terms for its translations, recorded against the protocol that was
 * reviewed, and checked before anything reaches the store.
 */

/**
 * Whether `value` is one of the protocol's localized strings: an object of
 * text keyed by languages the protocol declares.
 */
export const isLocalizedValue = (
  value: unknown,
  locales: readonly string[],
): value is Record<string, string> =>
  isJsonObject(value) &&
  Object.keys(value).length > 0 &&
  Object.entries(value).every(
    ([key, text]) => locales.includes(key) && typeof text === 'string',
  );

const parseJson = (value: string | null): unknown => {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * The fix's operations rewritten to treat translations the way Architect's
 * own editors do. Editing a text in Architect replaces the translation in the
 * language being edited and keeps every other translation as it is
 * (`withTranslation`); nothing marks the others as out of date. So:
 *
 * - a `set` of plain text where the protocol holds a localized string writes
 *   that text as the default language's translation, keeping the others;
 * - a `set` of a localized string over a localized string replaces the
 *   translations it names and keeps the ones it does not.
 *
 * Read sequentially against `protocol` with each operation applied in turn,
 * so a later operation sees what an earlier one made. Operations past one
 * that does not apply are left as written: applying them fails anyway.
 */
export const normalizeOperations = (
  protocol: CurrentProtocol,
  operations: readonly FixOperation[],
): StoredOperation[] => {
  try {
    return normalizeEach(protocol, operations);
  } catch {
    // Applying them fails too, with a reason; nothing here may throw.
    return [...operations];
  }
};

const normalizeEach = (
  protocol: CurrentProtocol,
  operations: readonly FixOperation[],
): StoredOperation[] => {
  const { locales, defaultLocale } = protocol.localization;
  let current: unknown = protocol;
  const normalized: StoredOperation[] = [];
  let applying = true;
  for (const operation of operations) {
    let next: StoredOperation = operation;
    const segments = parsePath(operation.path);
    if (applying && operation.op === 'set' && segments !== null) {
      const target = readPath(current, segments);
      const value = parseJson(operation.value);
      if (target.found && isLocalizedValue(target.value, locales)) {
        if (typeof value === 'string') {
          next = {
            op: 'set',
            path: formatPath([...segments, defaultLocale]),
            value: operation.value,
          };
        } else if (isLocalizedValue(value, locales)) {
          next = {
            op: 'set',
            path: operation.path,
            value: JSON.stringify({ ...target.value, ...value }),
          };
        }
      }
    }
    normalized.push(next);
    if (applying) {
      const applied = applyOperations(current, [next]);
      if (applied.ok) current = applied.result;
      else applying = false;
    }
  }
  return normalized;
};

/** A finding's fix as kept beside the review. */
export type RecordedFix = {
  operations: StoredOperation[];
  /** What the reviewed protocol held at each target; null when the edits never applied to it. */
  targets: TargetSnapshot[] | null;
};

/** Records a fix against the protocol that was SENT for review. */
export const recordFix = (
  reviewed: CurrentProtocol,
  operations: readonly FixOperation[],
): RecordedFix => {
  const normalized = normalizeOperations(reviewed, operations);
  const applied = applyOperations(reviewed, normalized);
  return {
    operations: normalized,
    targets: applied.ok ? applied.targets : null,
  };
};

/**
 * What the store does to every protocol it is given: bring the interview's
 * shared wording in line (`withInterfaceText`, applied by the store's
 * reducer). A document that is not a schema 9 protocol is left as it is, for
 * validation to refuse.
 */
const normalizeProtocol = (raw: unknown): unknown =>
  isJsonObject(raw) && raw.schemaVersion === 9
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- withInterfaceText reads the protocol's stages and localization; a document whose shape it cannot read throws, which planFix catches, and the result is validated before it is trusted
      withInterfaceText(raw as unknown as CurrentProtocol)
    : raw;

/**
 * `candidate` as a protocol, when it is a valid one being written; otherwise
 * null. Validated as a draft, as Architect validates every protocol in its
 * editor. Never throws.
 */
const validProtocolOrNull = async (
  candidate: unknown,
): Promise<CurrentProtocol | null> => {
  if (!isJsonObject(candidate) || candidate.schemaVersion !== 9) return null;
  try {
    const result = await validateProtocol(candidate, { draft: true });
    return result.success && result.data.schemaVersion === 9
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated just above as a schema 9 protocol; the document is kept as written rather than as the schema's parse, which can drop what validation refuses
        (candidate as unknown as CurrentProtocol)
      : null;
  } catch {
    return null;
  }
};

export type ProtocolEdit =
  | {
      ok: true;
      protocol: CurrentProtocol;
      /** Applied to `protocol`, these give back exactly the protocol edited. */
      inverse: StoredOperation[];
      /** Everything the edit wrote, as `protocol` holds it (see `writtenHolds`). */
      written: WrittenSnapshot[];
    }
  | { ok: false; reason: 'changed' | 'invalid' };

/**
 * `protocol` with `operations` applied as the store would hold it, when they
 * apply and the result is a valid protocol, with what undoes it exactly and
 * what it wrote (`planFix`, with the store's normalisation: removing the
 * last Quick Add stage also takes the researcher's Quick Add wording, and
 * the inverse puts it back). Never throws.
 */
export const editProtocol = async (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
): Promise<ProtocolEdit> => {
  const plan = planFix(protocol, operations, normalizeProtocol);
  if (!plan.ok) return plan;
  const valid = await validProtocolOrNull(plan.result);
  return valid === null
    ? { ok: false, reason: 'invalid' }
    : {
        ok: true,
        protocol: valid,
        inverse: plan.inverse,
        written: plan.written,
      };
};

/**
 * The payload for `updateProtocol` that turns `from` into `to`. That action
 * merges, so a top-level key the edit removed is sent as `undefined`.
 */
export const protocolReplacement = (
  from: CurrentProtocol,
  to: CurrentProtocol,
): Partial<CurrentProtocol> => {
  const removed = Object.keys(from).filter((key) => !Object.hasOwn(to, key));
  return {
    ...Object.fromEntries(removed.map((key) => [key, undefined])),
    ...to,
  };
};
