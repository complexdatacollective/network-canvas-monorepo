import {
  withoutSuppliedWording,
  withSuppliedWording,
} from '@codaco/interview/supplied-wording';
import type { FixOperation } from '@codaco/protocol-review-worker/contract';
import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import {
  applyOperations,
  markMoves,
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
 *
 * The review reads the protocol AS REVIEWED (`protocolAsReviewed`): with the
 * wording Network Canvas supplies written out, which is what a participant is
 * shown. The store holds less: of that wording, only what the researcher
 * changed. So everything a fix says about the protocol (its paths, what it
 * expects to find, what it wrote, what undoes it) is about the protocol as
 * reviewed, and only the protocol handed back to the store is as stored.
 */

const reviewedForms = new WeakMap<CurrentProtocol, CurrentProtocol>();

/**
 * `protocol`, as the store holds it, with the wording a participant is shown
 * written out (`withSuppliedWording`): what is sent for review, and what
 * every fix is read against. The same object for the same stored protocol.
 */
export const protocolAsReviewed = (
  protocol: CurrentProtocol,
): CurrentProtocol => {
  const known = reviewedForms.get(protocol);
  if (known) return known;
  const reviewed = withSuppliedWording(protocol);
  reviewedForms.set(protocol, reviewed);
  return reviewed;
};

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
 * A placeholder as the review writes one where a fix needs a fact it cannot
 * know: square brackets around capitals, such as [HELPLINE NAME].
 */
const PLACEHOLDER = /\[[A-Z][A-Z0-9 _/'-]+\]/;

const holdsPlaceholder = (value: unknown): boolean => {
  if (typeof value === 'string') return PLACEHOLDER.test(value);
  if (Array.isArray(value)) return value.some(holdsPlaceholder);
  return isJsonObject(value) && Object.values(value).some(holdsPlaceholder);
};

/**
 * Whether `operation` writes a placeholder: a text the researcher has still to
 * supply, which a participant must never be shown.
 */
export const writesPlaceholder = (operation: StoredOperation): boolean =>
  operation.op !== 'remove' && holdsPlaceholder(parseJson(operation.value));

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

/**
 * What a document reads as once the store has taken it: the store keeps, of
 * the wording Network Canvas supplies, only what differs from it
 * (`withoutSuppliedWording`, applied by the store's reducer), and the review
 * reads that with the supplied wording written out again. So a fix that
 * clears a text Network Canvas words leaves Network Canvas's wording there,
 * and one that removes the last stage showing a shared word takes the
 * researcher's wording for it. A document that is not a schema 9 protocol is
 * left as it is, for validation to refuse.
 */
const normalizeProtocol = (raw: unknown): unknown =>
  isJsonObject(raw) && raw.schemaVersion === 9
    ? withSuppliedWording(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- both read the protocol's stages and localization; a document whose shape they cannot read throws, which planFix catches, and the result is validated before it is trusted
        withoutSuppliedWording(raw as unknown as CurrentProtocol),
      )
    : raw;

/** A finding's fix as kept beside the review. */
export type RecordedFix = {
  operations: StoredOperation[];
  /** What the reviewed protocol held at each target; null when the edits never applied to it. */
  targets: TargetSnapshot[] | null;
  /**
   * What the fix would leave in every place it writes, worked out against the
   * reviewed protocol: how a fix nobody applied is recognised as already made
   * (`fixInEffect`). Null when the edits never applied, or have no inverse.
   */
  expected: WrittenSnapshot[] | null;
};

/**
 * Records a fix against the protocol that was SENT for review
 * (`protocolAsReviewed`): its edits in the protocol's own terms, with the
 * members it only moves marked as moved (`markMoves`).
 */
export const recordFix = (
  reviewed: CurrentProtocol,
  operations: readonly FixOperation[],
): RecordedFix => {
  const recorded = markMoves(
    reviewed,
    normalizeOperations(reviewed, operations),
  );
  const applied = applyOperations(reviewed, recorded);
  // A placeholder inside something the fix adds cannot be replaced before the
  // fix is made (only the texts a fix sets can be edited), so such a fix is
  // not offered: it would put the placeholder in front of participants.
  if (
    !applied.ok ||
    recorded.some((o) => o.op === 'insert' && writesPlaceholder(o))
  ) {
    return { operations: recorded, targets: null, expected: null };
  }
  const plan = planFix(reviewed, recorded, normalizeProtocol);
  return {
    operations: recorded,
    targets: applied.targets,
    expected: plan.ok ? plan.written : null,
  };
};

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
      /** The edited protocol as the store holds it. */
      protocol: CurrentProtocol;
      /** Applied to the edited protocol as reviewed, these give back exactly the protocol edited. */
      inverse: StoredOperation[];
      /** Everything the edit wrote, as the edited protocol reads as reviewed (see `writtenHolds`). */
      written: WrittenSnapshot[];
    }
  | { ok: false; reason: 'changed' | 'invalid' };

/**
 * `protocol` (as the store holds it) with `operations` applied, when they
 * apply to it as reviewed and the result is a valid protocol, with what
 * undoes it exactly and what it wrote (`planFix`, with the store's
 * normalisation). The protocol handed back is as the store will hold it.
 * Never throws.
 */
export const editProtocol = async (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
): Promise<ProtocolEdit> => {
  const plan = planFix(
    protocolAsReviewed(protocol),
    operations,
    normalizeProtocol,
  );
  if (!plan.ok) return plan;
  let stored: unknown;
  try {
    stored =
      isJsonObject(plan.result) && plan.result.schemaVersion === 9
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as in normalizeProtocol: it throws on a shape it cannot read, and the result is validated below
          withoutSuppliedWording(plan.result as unknown as CurrentProtocol)
        : plan.result;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const valid = await validProtocolOrNull(stored);
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
