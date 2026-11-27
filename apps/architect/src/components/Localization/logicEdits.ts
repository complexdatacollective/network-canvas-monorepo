import { isEqual } from 'es-toolkit';

import { isRecord } from '@codaco/shared-consts';
import type { TextDefinitionKey } from '~/ducks/modules/protocol/localeOperations';

/**
 * The logic changes that the editor of one cell of the translation table
 * made. A cell's text can test rules (a logic block) and show dynamic
 * attributes, and its editor creates and changes them as the stage editor
 * does. Each change is kept with the cell that made it, in the cell's own
 * field, so the form store's own reset (Escape) puts back exactly what that
 * cell changed, and its own dirty state says the cell is unsaved.
 *
 * The owner's conditions or dynamic attributes, as the table holds them, are
 * the protocol's with every cell's changes applied (`withPatches`): for each
 * id, the latest change wins. Two cells that changed the same condition or
 * dynamic attribute therefore resolve by which changed it last, and Escape in
 * the later one brings back the earlier one's change.
 */

/**
 * One cell's change to one condition or dynamic attribute: what it is now, or
 * that it was removed. `order` says when, among every change in the table.
 */
export type PatchEntry = Readonly<
  { order: number } & ({ value: unknown } | { removed: true })
>;

/** One cell's changes to an owner's conditions or dynamic attributes, by id. */
export type Patch = Readonly<Record<string, PatchEntry>>;

/** One cell's changes to its owner's conditions and dynamic attributes. */
export type CellLogic = Readonly<Partial<Record<TextDefinitionKey, Patch>>>;

type Definitions = Readonly<Record<string, unknown>>;

const readEntry = (value: unknown): PatchEntry | undefined => {
  if (!isRecord(value) || typeof value.order !== 'number') return undefined;
  if (value.removed === true) return { order: value.order, removed: true };
  return Object.hasOwn(value, 'value')
    ? { order: value.order, value: value.value }
    : undefined;
};

const readPatch = (value: unknown): Patch | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([id, entry]) => {
    const read = readEntry(entry);
    return read === undefined ? [] : [[id, read] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

/** What a cell's field holds as its logic, read as `CellLogic`. */
export const readCellLogic = (value: unknown): CellLogic | undefined => {
  if (!isRecord(value)) return undefined;
  const conditions = readPatch(value.conditions);
  const dynamicAttributes = readPatch(value.dynamicAttributes);
  if (conditions === undefined && dynamicAttributes === undefined) {
    return undefined;
  }
  return {
    ...(conditions !== undefined && { conditions }),
    ...(dynamicAttributes !== undefined && { dynamicAttributes }),
  };
};

/**
 * `logic` with `key`'s changes replaced by `patch`: undefined once no change
 * is left, so a cell that has put everything back holds no logic.
 */
export const withPatch = (
  logic: CellLogic | undefined,
  key: TextDefinitionKey,
  patch: Patch,
): CellLogic | undefined => {
  const { [key]: _replaced, ...others } = logic ?? {};
  const next: CellLogic =
    Object.keys(patch).length === 0 ? others : { ...others, [key]: patch };
  return Object.keys(next).length === 0 ? undefined : next;
};

/** The latest of `entries`, if any. */
const latest = (entries: readonly (PatchEntry | undefined)[]) =>
  entries.reduce<PatchEntry | undefined>(
    (found, entry) =>
      entry !== undefined && (found === undefined || entry.order > found.order)
        ? entry
        : found,
    undefined,
  );

/**
 * `stored` with `patches` applied: each id as its latest change leaves it,
 * or as `stored` has it where no patch changes it.
 */
export const withPatches = (
  stored: Definitions,
  patches: readonly (Patch | undefined)[],
): Definitions => {
  const ids = new Set(
    patches.flatMap((patch) => (patch === undefined ? [] : Object.keys(patch))),
  );
  if (ids.size === 0) return stored;
  const result: Record<string, unknown> = { ...stored };
  for (const id of ids) {
    const entry = latest(patches.map((patch) => patch?.[id]));
    if (entry === undefined) continue;
    if ('removed' in entry) delete result[id];
    else result[id] = entry.value;
  }
  return result;
};

/** The latest `order` among `patches`, or 0 when they have none. */
export const latestOrder = (patches: readonly (Patch | undefined)[]) =>
  Math.max(
    0,
    ...patches.flatMap((patch) =>
      patch === undefined ? [] : Object.values(patch).map(({ order }) => order),
    ),
  );

const sameEntry = (definitions: Definitions, id: string, value: unknown) =>
  Object.hasOwn(definitions, id) && isEqual(definitions[id], value);

/**
 * A cell's changes once its editor writes `next` as the owner's conditions
 * or dynamic attributes.
 *
 * - `without` is what the table holds with every cell's changes but this
 *   one's, and `shown` what it holds with this cell's too: what the editor
 *   showed before it wrote `next`.
 * - An id that `next` leaves as `shown` has it was not changed by this write,
 *   so the cell's earlier change to it, if any, is kept with its order, even
 *   where a later change of another cell's hides it.
 * - An id that `next` changes to what `without` has is put back: the cell no
 *   longer changes it.
 * - Any other id was changed by this write, which is the latest change to
 *   it: `order`.
 */
export const patchAfterWrite = ({
  previous,
  without,
  shown,
  next,
  order,
}: Readonly<{
  previous: Patch | undefined;
  without: Definitions;
  shown: Definitions;
  next: Definitions;
  order: number;
}>): Patch => {
  const ids = new Set([
    ...Object.keys(without),
    ...Object.keys(shown),
    ...Object.keys(next),
    ...Object.keys(previous ?? {}),
  ]);
  const patch: Record<string, PatchEntry> = {};
  for (const id of ids) {
    const present = Object.hasOwn(next, id);
    const value = next[id];
    const asShown = present
      ? sameEntry(shown, id, value)
      : !Object.hasOwn(shown, id);
    const earlier = previous?.[id];
    if (asShown && earlier !== undefined) {
      patch[id] = earlier;
      continue;
    }
    const asWithout = present
      ? sameEntry(without, id, value)
      : !Object.hasOwn(without, id);
    if (asWithout) continue;
    patch[id] = present ? { order, value } : { order, removed: true };
  }
  return patch;
};

/**
 * The wording of a version of a saved dynamic attribute is a row of its own,
 * but a cell whose text shows the dynamic attribute can change it too,
 * through the dynamic attribute's popover. Such a change is the version's
 * row's to show (the row is unsaved while it has one), and the change of the
 * cell that opened the popover, whose Escape takes it back.
 *
 * The row's cell keeps both, so neither can drift from the other: `under` is
 * the text the row had before any popover wrote it (the protocol's, or what
 * was typed in the row), and `by` the latest wording that each cell's
 * popover wrote, by the name of that cell's field. The row shows the latest
 * of them. Taking one back leaves the latest of the rest showing, or
 * `under`. Typing in the row itself is later than every popover's wording, so
 * it replaces them all: Escape in a cell whose popover wrote the row no
 * longer changes it.
 */

/** The wording that one cell's popover wrote into a version's row, and when. */
export type WordingEntry = Readonly<{ order: number; text: string }>;

/** The wording that popovers wrote into a version's row (see above). */
export type WordingWrites = Readonly<{
  under: string;
  by: Readonly<Record<string, WordingEntry>>;
}>;

const readWordingEntry = (value: unknown): WordingEntry | undefined =>
  isRecord(value) &&
  typeof value.order === 'number' &&
  typeof value.text === 'string'
    ? { order: value.order, text: value.text }
    : undefined;

/** What a cell's field holds as its popovers' wording, read as `WordingWrites`. */
export const readWordingWrites = (
  value: unknown,
): WordingWrites | undefined => {
  if (!isRecord(value) || typeof value.under !== 'string') return undefined;
  if (!isRecord(value.by)) return undefined;
  const by = Object.fromEntries(
    Object.entries(value.by).flatMap(([writer, entry]) => {
      const read = readWordingEntry(entry);
      return read === undefined ? [] : [[writer, read] as const];
    }),
  );
  return Object.keys(by).length === 0 ? undefined : { under: value.under, by };
};

const latestWording = (by: Readonly<Record<string, WordingEntry>>) =>
  Object.values(by).reduce<WordingEntry | undefined>(
    (found, entry) =>
      found === undefined || entry.order > found.order ? entry : found,
    undefined,
  );

/** A row's text and its popovers' wording, once `by` is what they wrote. */
const settledWording = (
  under: string,
  by: Readonly<Record<string, WordingEntry>>,
): Readonly<{ text: string; wordings?: WordingWrites }> => {
  const shown = latestWording(by);
  return shown === undefined
    ? { text: under }
    : { text: shown.text, wordings: { under, by } };
};

/**
 * A version's row, showing `text` with `wordings`, once the popover of the
 * cell named `writer` writes `next` into it. Wording that the row would show
 * without the writer's is no change of the writer's, so it is dropped.
 */
export const wordingAfterWrite = ({
  text,
  wordings,
  writer,
  next,
}: Readonly<{
  text: string;
  wordings?: WordingWrites | undefined;
  writer: string;
  next: string;
}>): Readonly<{ text: string; wordings?: WordingWrites }> => {
  const under = wordings?.under ?? text;
  const { [writer]: _replaced, ...others } = wordings?.by ?? {};
  const without = latestWording(others)?.text ?? under;
  if (next === without) return settledWording(under, others);
  const order =
    Math.max(
      0,
      ...Object.values(wordings?.by ?? {}).map((entry) => entry.order),
    ) + 1;
  return settledWording(under, { ...others, [writer]: { order, text: next } });
};

/**
 * A version's row, showing `text` with `wordings`, once the wording that the
 * popover of the cell named `writer` wrote is taken back.
 */
export const wordingWithout = ({
  text,
  wordings,
  writer,
}: Readonly<{
  text: string;
  wordings?: WordingWrites | undefined;
  writer: string;
}>): Readonly<{ text: string; wordings?: WordingWrites }> => {
  if (wordings === undefined || !Object.hasOwn(wordings.by, writer)) {
    return wordings === undefined ? { text } : { text, wordings };
  }
  const { [writer]: _removed, ...others } = wordings.by;
  return settledWording(wordings.under, others);
};
