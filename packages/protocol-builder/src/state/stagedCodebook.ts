import { isEqual } from 'es-toolkit';
import { createContext, useContext, useSyncExternalStore } from 'react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

/**
 * One codebook section as a stage edit has changed it.
 *
 * `edited` is the section as the researcher left it; `base` is the section it
 * was edited from — what the protocol held when the edit was last laid over
 * it — or `null` for a section the edit brought into being (a type the
 * researcher invented, or the ego's first attribute). The pair is what makes
 * the edit an edit rather than a copy: what changed is the difference between
 * them, and only that difference is laid over the section when the stage is
 * saved (`mergeEdit`), so whatever a collaborator changed in the meantime
 * survives.
 */
export type StagedSection = Readonly<{
  base: SectionDoc | null;
  edited: SectionDoc;
}>;

/** Every codebook section a stage edit has changed, by section id. */
export type StagedCodebook = Readonly<Record<string, StagedSection>>;

export const NOTHING_STAGED: StagedCodebook = Object.freeze({});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * The records a codebook write replaces whole, by their path in a section:
 * the mapping a type's shape is drawn from, whose attribute, kind and map only
 * mean something together. Merged key by key, one person's attribute and the
 * other's map would make a mapping neither of them wrote.
 *
 * An attribute's rules are not among them. Each rule is one the researcher
 * switched on, off or changed, so they are merged rule by rule: a rule a
 * collaborator added meanwhile is kept beside the researcher's, as the editor
 * showed it to them (and a pair that no longer fits is refused when the stage
 * is saved, as a clash).
 */
const WHOLE_VALUES: readonly (readonly string[])[] = [['shape', 'dynamic']];

/**
 * The records whose entries are each a change of their own: an attribute's
 * rules. Removing one of these whole (an attribute whose last rule was
 * switched off is written without `validation`) removes the entries it held,
 * not the record: a rule a collaborator added meanwhile is one the researcher
 * never switched off, and stays.
 */
const ENTRY_BY_ENTRY: readonly (readonly string[])[] = [
  ['variables', '*', 'validation'],
];

const matchesAny = (
  patterns: readonly (readonly string[])[],
  path: readonly string[],
): boolean =>
  patterns.some(
    (pattern) =>
      pattern.length === path.length &&
      pattern.every((part, index) => part === '*' || part === path[index]),
  );

/**
 * `edited`'s changes from `base`, laid over `current`.
 *
 * A three-way merge over plain records, key by key: a key the edit did not
 * change takes whatever `current` holds for it (including its absence), a key
 * the edit removed is removed (of an attribute's rules, only the rules it
 * held: `ENTRY_BY_ENTRY`), and a key the edit changed takes the edit's
 * value — merged again where all three are records, so an attribute whose
 * name the researcher changed keeps the options a collaborator gave it. A key
 * a collaborator removed after the edit was made stays removed, edited or not:
 * an attribute or type somebody deleted is not brought back by a change made
 * to it. Anything that is not a record (a list, a string, a number), and the
 * values a write replaces whole (`WHOLE_VALUES`), is a value of its own, and
 * the edit's wins where both sides changed it.
 *
 * This is the rule every codebook write from a stage editor was written to:
 * each lays its change over the section "as the host holds it at the moment
 * the lock is granted" rather than over the copy it was looking at, so a
 * collaborator's change to something else is never written back out.
 */
export function mergeEdit(
  base: unknown,
  edited: unknown,
  current: unknown,
  path: readonly string[] = [],
): unknown {
  if (isEqual(base, edited)) return current;
  if (
    matchesAny(WHOLE_VALUES, path) ||
    !isRecord(edited) ||
    !isRecord(current)
  ) {
    return edited;
  }
  const from = isRecord(base) ? base : {};
  const merged: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(current),
    ...Object.keys(edited),
    ...Object.keys(from),
  ]);
  for (const key of keys) {
    const inBase = Object.hasOwn(from, key);
    const inEdited = Object.hasOwn(edited, key);
    const inCurrent = Object.hasOwn(current, key);
    if (!inEdited) {
      // Never there and left alone by the edit: whatever the protocol holds.
      if (!inBase) {
        if (inCurrent) merged[key] = current[key];
        continue;
      }
      // Removed by the edit: gone, unless what it removed is a record of
      // entries (`ENTRY_BY_ENTRY`), of which only those it held go.
      const entryPath = [...path, key];
      if (inCurrent && matchesAny(ENTRY_BY_ENTRY, entryPath)) {
        const left = mergeEdit(from[key], {}, current[key], entryPath);
        if (isRecord(left) && Object.keys(left).length > 0) merged[key] = left;
      }
      continue;
    }
    if (inBase && !inCurrent) {
      // Removed by somebody else since the edit was made, changed by it or
      // not: their removal stands.
      continue;
    }
    if (inBase && isEqual(from[key], edited[key])) {
      // Unchanged by the edit: the protocol's own value stands.
      merged[key] = current[key];
      continue;
    }
    merged[key] = inCurrent
      ? mergeEdit(inBase ? from[key] : undefined, edited[key], current[key], [
          ...path,
          key,
        ])
      : edited[key];
  }
  return merged;
}

/**
 * A staged section as the editor sees it now: its edit laid over what the
 * protocol currently holds.
 *
 * `undefined` for a section the edit changed and the protocol no longer
 * holds — a type a collaborator deleted takes the edits made to it with it,
 * which is what the write that was refused for the missing section did before
 * edits were staged.
 */
export function overlaySection(
  staged: StagedSection,
  current: SectionDoc | undefined,
): SectionDoc | undefined {
  if (current === undefined) {
    return staged.base === null ? staged.edited : undefined;
  }
  return mergeSection(staged, current);
}

/** A staged section's edit laid over a section the protocol holds (`mergeEdit`). */
export function mergeSection(
  staged: StagedSection,
  current: SectionDoc,
): SectionDoc {
  const merged = mergeEdit(staged.base ?? {}, staged.edited, current);
  return isRecord(merged) ? merged : current;
}

/** Every section with the stage's codebook edits laid over it. */
export function overlaySections(
  staged: StagedCodebook,
  sections: Readonly<Record<string, SectionDoc>>,
): Readonly<Record<string, SectionDoc>> {
  const ids = Object.keys(staged);
  if (ids.length === 0) return sections;
  const overlaid: Record<string, SectionDoc> = { ...sections };
  for (const id of ids) {
    const entry = staged[id];
    if (entry === undefined) continue;
    const document = overlaySection(entry, sections[id]);
    if (document === undefined) delete overlaid[id];
    else overlaid[id] = document;
  }
  return overlaid;
}

/** Why a staged write was not made. */
type StagingRefusal = 'gone' | 'readOnly';

/**
 * Lays one more change over a section the stage has (or has not yet) changed.
 *
 * The change is made to the section as the editor sees it — the protocol's
 * current section with the stage's earlier edits over it — and the result is
 * kept against the protocol's current section, so every edit the stage has
 * made to it, this one included, is the difference between the two. A change
 * that leaves the section exactly as the protocol holds it is no edit at all,
 * and the section stops being staged: a researcher who switches a rule on and
 * back off has nothing left to save or to lose.
 *
 * `missing` is the section a change to one the protocol does not hold starts
 * from, when the caller may bring it into being; without one, a missing
 * section refuses the change as `gone`. `update` may throw, which is the
 * caller's refusal and leaves the stage's edits as they were.
 */
export function stageSectionChange(
  staged: StagedCodebook,
  id: ProtocolSectionId,
  current: SectionDoc | undefined,
  update: (document: SectionDoc) => SectionDoc,
  missing?: SectionDoc,
): StagedCodebook | 'gone' {
  const entry = staged[id];
  const seen = entry === undefined ? current : overlaySection(entry, current);
  const from = seen ?? missing;
  if (from === undefined) return 'gone';
  const edited = update(from);
  const { [id]: _replaced, ...rest } = staged;
  if (current !== undefined && isEqual(edited, current)) return rest;
  return { ...rest, [id]: { base: current ?? null, edited } };
}

/**
 * What a stage editor holds of the codebook while it is open.
 *
 * Every codebook change made inside a stage editor — from the stage's own
 * sections or from a dialog opened over them — is part of the researcher's
 * edit of the stage: it is kept here rather than written, everything inside
 * the editor reads the codebook with it laid over, saving the stage writes it
 * with the stage in one revision, and cancelling the stage throws it away.
 *
 * A dialog opened inside the editor (a row of a list, an attribute's own
 * editor) changes the same store, so everything behind it — the checks its
 * save runs among them — sees what it changed; it takes a checkpoint when it
 * opens and puts it back if it is cancelled (`useStagedCodebookCheckpoint`).
 *
 * Provided by the stage editor's shell. Outside a stage editor there is none,
 * and a codebook change is written at once, as the codebook's own surfaces
 * write it.
 */
export type StagedCodebookStore = Readonly<{
  /** What the stage has changed, against the protocol as last read. */
  read: () => StagedCodebook;
  subscribe: (listener: () => void) => () => void;
  /** Whether a change may be kept: the stage is this editor's to change. */
  writable: boolean;
  /**
   * Lays a change over a section (see `stageSectionChange`). Refused as
   * `readOnly` while the stage is not this editor's to change.
   */
  stage: (
    id: ProtocolSectionId,
    update: (document: SectionDoc) => SectionDoc,
    missing?: SectionDoc,
  ) => StagingRefusal | undefined;
  /**
   * Puts back what an earlier `read` answered — a cancelled dialog's undo —
   * or `NOTHING_STAGED` once a save has written the changes.
   */
  restore: (checkpoint: StagedCodebook) => void;
}>;

export const StagedCodebookContext = createContext<
  StagedCodebookStore | undefined
>(undefined);

/** The open stage editor's codebook store, or `undefined` outside one. */
export function useStagedCodebookStore(): StagedCodebookStore | undefined {
  return useContext(StagedCodebookContext);
}

const noSubscription = () => () => undefined;
const readNothing = () => NOTHING_STAGED;

/**
 * The codebook changes the open stage editor is holding, subscribed;
 * nothing outside a stage editor.
 */
export function useStagedCodebook(): StagedCodebook {
  const store = useContext(StagedCodebookContext);
  return useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.read ?? readNothing,
  );
}
