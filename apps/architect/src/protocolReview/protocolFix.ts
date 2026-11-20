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
 * know: square brackets around capitals, such as [HELPLINE NAME]. The review
 * writes it in the protocol's language, so "capitals" means no lower-case
 * letter in any script: [NÚMERO DE TELÉFONO], and [热线名称] in a script that
 * has no case. The brackets must hold a letter, so [1] is not one, and the
 * text of a Markdown link ([NHS 111](https://…)) is not one either. One
 * character is enough only in a script without case, where it can be a
 * whole word ([姓]); a lone capital ([A], [X]) is far likelier a label.
 */
const PLACEHOLDER =
  /\[(?=[^[\]\n]*\p{L})(?:[^[\]\n\p{Ll}]{2,}|\p{Lo})\](?!\()/u;

/**
 * Whether `written` holds a placeholder that `current`, what it replaces,
 * does not hold in the same place. Members of arrays are paired as
 * `replacedMembers` pairs them, so a translation kept as it was
 * (`keepTranslations`) is not one the fix writes.
 */
const holdsNewPlaceholder = (written: unknown, current: unknown): boolean => {
  if (typeof written === 'string') {
    return written !== current && PLACEHOLDER.test(written);
  }
  if (Array.isArray(written)) {
    const replaced = Array.isArray(current)
      ? replacedMembers(written, current)
      : [];
    return written.some((member: unknown, index) =>
      holdsNewPlaceholder(member, replaced[index]),
    );
  }
  return (
    isJsonObject(written) &&
    Object.entries(written).some(([key, value]) =>
      holdsNewPlaceholder(
        value,
        isJsonObject(current) && Object.hasOwn(current, key)
          ? current[key]
          : undefined,
      ),
    )
  );
};

/**
 * Whether `operation` writes a placeholder: a text the researcher has still to
 * supply, which a participant must never be shown. Given the protocol it
 * applies to, a placeholder a `set` leaves where the protocol already holds
 * it (a translation kept as it was) is not one it writes.
 */
export const writesPlaceholder = (
  operation: StoredOperation,
  protocol?: unknown,
): boolean => {
  if (operation.op === 'remove') return false;
  const segments =
    operation.op === 'set' && protocol !== undefined
      ? parsePath(operation.path)
      : null;
  const target = segments === null ? null : readPath(protocol, segments);
  return holdsNewPlaceholder(
    parseJson(operation.value),
    target?.found ? target.value : undefined,
  );
};

/**
 * The top-level parts of a protocol a fix may edit: the interview and its
 * data model. The rest is not the review's to change: the protocol's name
 * and description, its languages, its assets (an API key among them, which
 * the review is sent a stand-in for), Network Canvas's own wording, and the
 * study details the review itself is kept in.
 */
const EDITABLE_PARTS = new Set(['stages', 'codebook']);

/**
 * Whether every operation is inside a part of the protocol a fix may edit.
 * A path that is not a pointer is left for applying it to refuse.
 */
export const fixStaysInBounds = (
  operations: readonly StoredOperation[],
): boolean =>
  operations.every((operation) => {
    const first = parsePath(operation.path)?.[0];
    return first === undefined || EDITABLE_PARTS.has(first);
  });

type MemberKey = (member: unknown) => string | null;

const scalarKey =
  (property: string): MemberKey =>
  (member) => {
    const found = isJsonObject(member) ? member[property] : undefined;
    return typeof found === 'string' ||
      typeof found === 'number' ||
      typeof found === 'boolean'
      ? `${typeof found}:${found}`
      : null;
  };

/** A member's `id`. */
const idOf = scalarKey('id');

const isScalar = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * What a member holds that describes it rather than names what it refers to:
 * its label, and whether a Yes/No answer is the negative one.
 */
const NOT_REFERENCES = new Set(['label', 'negative']);

/**
 * What a member without an id refers to: everything else it holds that is
 * text, a number, or true or false (`NOT_REFERENCES`). An answer option's
 * `value`, the edge `type` a narrative preset displays, the `variable` it
 * highlights or a roster sorts by.
 */
const referenceOf: MemberKey = (member) => {
  if (!isJsonObject(member) || idOf(member) !== null) return null;
  const held = Object.entries(member)
    .filter(([key, value]) => !NOT_REFERENCES.has(key) && isScalar(value))
    .toSorted(([a], [b]) => a.localeCompare(b));
  return held.length === 0 ? null : JSON.stringify(held);
};

/**
 * A member's label, as far as `written` words it: the same key for
 * a member whose label holds every translation `written` gives, unchanged.
 */
const labelAsWordedBy =
  (written: unknown): MemberKey =>
  (member) => {
    if (!isJsonObject(member) || idOf(member) !== null) return null;
    const { label } = member;
    if (typeof label === 'string') return label;
    if (!isJsonObject(label)) return null;
    const worded = isJsonObject(written) ? written.label : undefined;
    if (!isJsonObject(worded) || Object.keys(worded).length === 0) return null;
    const shared = Object.keys(worded).toSorted();
    return shared.every((locale) => typeof label[locale] === 'string')
      ? JSON.stringify(shared.map((locale) => [locale, label[locale]]))
      : null;
  };

/**
 * For each member of `written`, the member of `current` it replaces, or
 * undefined when there is no telling; nothing is carried over to it.
 *
 * A member with an `id` replaces the one with that id. Others (an answer
 * option, an entry in a narrative preset or a roster's sorting) have none.
 * Such a member replaces the one whose label it leaves as it was, and
 * failing that the one that refers to the same thing (`referenceOf`): a fix
 * that rewords a label keeps what it refers to, and one that recodes the
 * values keeps the labels, whose translations belong to the label. Each of
 * these counts only when exactly one member on each side answers to it.
 * Members that hold nothing to tell them apart are paired by position, when
 * that is so of every member of both arrays and both are the same length.
 */
const replacedMembers = (
  written: readonly unknown[],
  current: readonly unknown[],
): unknown[] => {
  const replaced: unknown[] = written.map(() => undefined);
  const paired = new Set<number>();
  const claimed = new Set<number>();
  const pairBy = (keyOf: (member: unknown, index: number) => MemberKey) => {
    const pairs: [number, number][] = [];
    for (const [index, member] of written.entries()) {
      if (paired.has(index)) continue;
      const key = keyOf(member, index);
      const mine = key(member);
      if (mine === null) continue;
      const rivals = written.filter(
        (other, at) => !paired.has(at) && key(other) === mine,
      );
      const candidates = current.flatMap((candidate, at) =>
        !claimed.has(at) && key(candidate) === mine ? [at] : [],
      );
      const [only] = candidates;
      if (
        rivals.length === 1 &&
        candidates.length === 1 &&
        only !== undefined
      ) {
        pairs.push([index, only]);
      }
    }
    for (const [index, at] of pairs) {
      replaced[index] = current[at];
      paired.add(index);
      claimed.add(at);
    }
  };
  pairBy(() => idOf);
  pairBy((member) => labelAsWordedBy(member));
  pairBy(() => referenceOf);
  const told = [...written, ...current].some(
    (member) => idOf(member) !== null || referenceOf(member) !== null,
  );
  if (!told && written.length === current.length) return [...current];
  return replaced;
};

/**
 * `written` with, in every text that `current` holds in the same place, the
 * translations `written` does not name. The review writes only the
 * protocol's default language, so a fix that replaces a whole prompt, option
 * or stage would otherwise delete every other language's text in it. Members
 * of arrays are paired as `replacedMembers` pairs them.
 */
const keepTranslations = (
  written: unknown,
  current: unknown,
  locales: readonly string[],
): unknown => {
  if (isLocalizedValue(written, locales)) {
    return isLocalizedValue(current, locales)
      ? { ...current, ...written }
      : written;
  }
  if (Array.isArray(written)) {
    if (!Array.isArray(current)) return written;
    const replaced = replacedMembers(written, current);
    return written.map((member: unknown, index) =>
      keepTranslations(member, replaced[index], locales),
    );
  }
  if (isJsonObject(written)) {
    if (!isJsonObject(current)) return written;
    return Object.fromEntries(
      Object.entries(written).map(([key, value]) => [
        key,
        Object.hasOwn(current, key)
          ? keepTranslations(value, current[key], locales)
          : value,
      ]),
    );
  }
  return written;
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
 *   translations it names and keeps the ones it does not;
 * - a `set` of anything that holds texts (a prompt, an option, a list of
 *   them, a stage) does the same for each text inside it
 *   (`keepTranslations`).
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
      if (
        target.found &&
        isLocalizedValue(target.value, locales) &&
        typeof value === 'string'
      ) {
        next = {
          op: 'set',
          path: formatPath([...segments, defaultLocale]),
          value: operation.value,
        };
      } else if (target.found && value !== undefined) {
        const kept = JSON.stringify(
          keepTranslations(value, target.value, locales),
        );
        if (kept !== JSON.stringify(value)) {
          next = { op: 'set', path: operation.path, value: kept };
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
  // not offered: it would put the placeholder in front of participants. Nor
  // is one that reaches outside the interview and its data model.
  if (
    !applied.ok ||
    !fixStaysInBounds(recorded) ||
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
