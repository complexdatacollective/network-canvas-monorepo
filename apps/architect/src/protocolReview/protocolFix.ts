import type { FixOperation } from '@codaco/protocol-review-worker/contract';
import {
  type CurrentProtocol,
  validateProtocol,
  withInterfaceText,
} from '@codaco/protocol-validation';

import {
  applyOperations,
  type StoredOperation,
  type TargetSnapshot,
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
 * `candidate` as the store would hold it, when it is a valid protocol being
 * written; otherwise null. Validated as a draft, as Architect validates every
 * protocol in its editor.
 */
export const validProtocolOrNull = async (
  candidate: unknown,
): Promise<CurrentProtocol | null> => {
  if (!isJsonObject(candidate) || candidate.schemaVersion !== 9) return null;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- withInterfaceText only reads the protocol's stages and localization; the result is validated before it is trusted
  const withText = withInterfaceText(candidate as unknown as CurrentProtocol);
  try {
    const result = await validateProtocol(withText, { draft: true });
    return result.success && result.data.schemaVersion === 9 ? withText : null;
  } catch {
    return null;
  }
};

export type ProtocolEdit =
  | { ok: true; protocol: CurrentProtocol; inverse: StoredOperation[] }
  | { ok: false; reason: 'changed' | 'invalid' };

/**
 * `protocol` with `operations` applied, when they apply and the result is a
 * valid protocol.
 */
export const editProtocol = async (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
): Promise<ProtocolEdit> => {
  const applied = applyOperations(protocol, operations);
  if (!applied.ok) return { ok: false, reason: 'changed' };
  const valid = await validProtocolOrNull(applied.result);
  return valid === null
    ? { ok: false, reason: 'invalid' }
    : { ok: true, protocol: valid, inverse: applied.inverse };
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
