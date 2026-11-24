import { isEqual } from 'es-toolkit/compat';

import type { StageEditorFormContextValue } from '@codaco/protocol-builder/form/stageEditorContext';
import type { CurrentProtocol } from '@codaco/protocol-validation';

/**
 * A change made to the stored protocol from outside the stage editor, carried
 * into the stage that editor has open.
 *
 * The editor holds the stage as a draft and saves the whole draft, so a
 * change to the stored stage that the draft never hears of is written over by
 * the next save, and until then reads as work the researcher has not saved.
 * `mapDocuments` is the editor's way of taking such a change in; this is what
 * hands it one, for a writer that is not a component inside the editor (the
 * protocol review's Fix for me and Undo).
 *
 * One editor is open at a time — it is a route — so one entry, not a registry.
 */

type Carry = StageEditorFormContextValue['mapDocuments'];
type StageFields = Parameters<Parameters<Carry>[0]>[0];

type OpenStage = Readonly<{ stageId: string; carry: Carry }>;

let open: OpenStage | null = null;

/** Said by the stage editor while it has `stageId` open; returns how to unsay it. */
export function registerOpenStage(stageId: string, carry: Carry): () => void {
  const entry: OpenStage = { stageId, carry };
  open = entry;
  return () => {
    if (open === entry) open = null;
  };
}

/** The stage an editor has open, if any (a stage being created is not). */
export const openStageId = (): string | null => open?.stageId ?? null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What identifies a member of a list across copies: a plain value is its own
 * identity (such as an attribute named in a list of them); a protocol object,
 * its id; a row keyed by the value it stands for (such as an answer option),
 * that value, which a list holds once at most.
 */
const idOf = (member: unknown): string | null => {
  if (typeof member === 'string' || typeof member === 'number') {
    return `${typeof member}:${member}`;
  }
  if (!isRecord(member)) return null;
  if (typeof member.id === 'string') return member.id;
  const { value } = member;
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? `value:${typeof value}:${String(value)}`
    : null;
};

const byId = (members: readonly unknown[]) =>
  new Map(members.map((member) => [idOf(member), member]));

/**
 * A list whose members all have ids, with the change from `before` to `after`
 * made to it. Members are matched by id, so one the draft has edited keeps
 * that edit wherever the change did not write.
 *
 * A change that leaves the members and their order alone is made member by
 * member, in the draft's own order. One that adds, removes or reorders
 * members sets the order: its members first, as it left them, without any the
 * draft has deleted; then the members only the draft holds.
 */
const carriedMembers = (
  before: readonly unknown[],
  after: readonly unknown[],
  held: readonly unknown[],
): unknown[] => {
  const was = byId(before);
  const now = byId(after);
  if (isEqual(before.map(idOf), after.map(idOf))) {
    return held.map((member) => {
      const id = idOf(member);
      return was.has(id) && now.has(id)
        ? carried(was.get(id), now.get(id), member)
        : member;
    });
  }
  const mine = byId(held);
  const changed = after.flatMap((member) => {
    const id = idOf(member);
    if (!was.has(id)) return [member];
    return mine.has(id) ? [carried(was.get(id), member, mine.get(id))] : [];
  });
  const onlyInDraft = held.filter((member) => {
    const id = idOf(member);
    return !was.has(id) && !now.has(id);
  });
  return [...changed, ...onlyInDraft];
};

const allHaveIds = (members: readonly unknown[]) => {
  const ids = members.map(idOf);
  return ids.every((id) => id !== null) && new Set(ids).size === ids.length;
};

/**
 * `held` with the change from `before` to `after` made to it, and nothing
 * else: whatever the change did not touch stays as `held` has it, so an edit
 * the researcher has not saved survives beside the change. Where both wrote
 * the same place, the change wins: it is the newer of the two, and the one
 * the researcher has just asked for.
 */
function carried(before: unknown, after: unknown, held: unknown): unknown {
  if (isEqual(before, after)) return held;
  if (isRecord(before) && isRecord(after) && isRecord(held)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...keys].filter(
      (key) => !isEqual(before[key], after[key]),
    );
    const kept = Object.entries(held).filter(([key]) => !changed.includes(key));
    const written = changed
      .filter((key) => after[key] !== undefined)
      .map((key): [string, unknown] => [
        key,
        Object.hasOwn(held, key)
          ? carried(before[key], after[key], held[key])
          : after[key],
      ]);
    // In the draft's own key order, with what the change added at the end.
    const order = [
      ...Object.keys(held),
      ...written.map(([key]) => key).filter((key) => !Object.hasOwn(held, key)),
    ];
    const entries = new Map([...kept, ...written]);
    return Object.fromEntries(
      order.flatMap((key): [string, unknown][] =>
        entries.has(key) ? [[key, entries.get(key)]] : [],
      ),
    );
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    Array.isArray(held) &&
    [before, after, held].every(allHaveIds)
  ) {
    return carriedMembers(before, after, held);
  }
  // Nothing left to match by: the change is taken only where the draft has
  // not changed the same list. Otherwise the draft's own list is kept, so
  // unsaved work is never lost; the fix then shows as not made, and can be
  // made again once the stage is saved.
  if (Array.isArray(after) && Array.isArray(held) && !isEqual(before, held)) {
    return held;
  }
  return after;
}

/**
 * The change from `before` to `after`, as a rewrite of any copy of the
 * stage's fields (see `mapDocuments`): pure, and the same for every copy.
 */
export const stageChangeRewrite =
  (before: StageFields, after: StageFields) =>
  (fields: StageFields): StageFields => {
    const next = carried(before, after, fields);
    return isRecord(next) ? next : fields;
  };

const fieldsOf = (protocol: CurrentProtocol, stageId: string) => {
  const stage = protocol.stages.find((candidate) => candidate.id === stageId);
  if (!stage) return null;
  const { id: _id, type: _type, ...fields } = stage;
  return fields;
};

/**
 * Carries what changed between two readings of the protocol into the stage an
 * editor has open, when the change touched what that stage holds. Both
 * protocols are as the editor holds a stage: with the wording Network Canvas
 * supplies written out (`protocolAsReviewed`).
 *
 * Nothing is carried for a stage that either reading does not hold: a stage
 * the change removed has no draft left to keep in step.
 */
export function carryIntoOpenStage(
  before: CurrentProtocol,
  after: CurrentProtocol,
): void {
  if (open === null) return;
  const was = fieldsOf(before, open.stageId);
  const now = fieldsOf(after, open.stageId);
  if (was === null || now === null || isEqual(was, now)) return;
  open.carry(stageChangeRewrite(was, now));
}
