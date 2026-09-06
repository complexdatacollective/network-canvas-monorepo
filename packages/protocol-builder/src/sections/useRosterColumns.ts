import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { MessageRule } from '@codaco/fresco-ui/form/validation/helpers';

import {
  orphanedSortProperties,
  type SortableProperty,
} from '../fields/sortOrderOptions.ts';
import type {
  DanglingCells,
  OptionGetter,
} from '../form/arrayFields/MultiSelect.tsx';
import { useStageHasAnyValue, useStageValue } from '../form/stageFormHooks.ts';
import { useResourceInspection } from '../resources/components/useResourceInspection.ts';

/** Where a roster stage records the data file it draws its people from. */
export const DATA_SOURCE = 'dataSource';

export type RosterColumns = Readonly<{
  /**
   * One entry per attribute the data file's people carry, once the file has
   * been read — and `undefined` until it has been.
   *
   * The two are different answers and every reader has to tell them apart. An
   * EMPTY list is a real fact about a real file: its people carry nothing, so
   * there is nothing to show on a card, sort by or search, and every row a
   * stage already holds is certainly pointing at a column that is not there.
   * `undefined` is the state that says nothing at all — no file chosen yet, the
   * bytes still being read, or a file that could not be read — where judging a
   * row would report every one of them as dangling. See
   * `orphanedSortProperties`, which draws the same line for the same reason.
   */
  names: readonly string[] | undefined;
  /** No data file is chosen, so there is nothing to configure against. */
  waiting: boolean;
  /** The file could not be read — its message, in the host's own words. */
  problem?: string;
}>;

const NO_NAMES: readonly string[] = Object.freeze([]);

/**
 * The attributes the chosen roster's people carry.
 *
 * Everything a roster stage configures — which attributes appear on a card,
 * which the participant may sort by, which a search matches against — is
 * chosen from these, and they come from the file itself rather than from the
 * codebook: a roster is external data, and a column in it is not required to
 * be a codebook attribute at all.
 *
 * Read through the resource gateway, which is the only thing in this package
 * that reaches host storage. A stage editor never sees a URL, a path or the
 * bytes.
 */
export function useRosterColumns(): RosterColumns {
  const dataSource = useStageValue(DATA_SOURCE);
  const resourceId =
    typeof dataSource === 'string' && dataSource !== ''
      ? dataSource
      : undefined;
  const { inspection, failure } = useResourceInspection(resourceId);

  return useMemo(
    () => ({
      // Exactly what the gateway answered. The inspection is dropped before a
      // newly chosen file is asked about, so this is `undefined` in every state
      // where the columns of the file the stage holds NOW are unknown — none
      // chosen, still reading, or unreadable — and a list only once one has
      // actually been read.
      names: inspection?.variableNames,
      waiting: resourceId === undefined,
      ...(failure === undefined ? {} : { problem: failure.message }),
    }),
    [failure, inspection, resourceId],
  );
}

/**
 * The roster's columns as a list field's options: each offered once, and one
 * already chosen disabled rather than removed, so the list still reads as the
 * whole data file.
 *
 * Shared by every roster section that picks columns — card details and
 * sortable properties are the same question asked twice — so a column reads
 * the same way wherever the researcher meets it.
 *
 * `orphans` are appended rather than mixed in: they are not columns of this
 * file, they are ids the rows still hold (see `useOrphanedColumns`), and they
 * arrive already disabled so nothing here can make one choosable.
 *
 * Columns that are not known yet and a file with no columns are offered the
 * same way here — as nothing to choose — because a control cannot offer what
 * nobody knows. The difference between them is a judgement about the rows, and
 * it is `useOrphanedColumns` that makes it.
 */
export function useColumnOptionGetter(
  names: readonly string[] | undefined,
  orphans: readonly SortableProperty[] = NO_ORPHANS,
): OptionGetter {
  return useMemo<OptionGetter>(
    () => (fieldName, _rowValues, allValues) => {
      if (fieldName !== 'variable') return [];
      const used = chosenColumns(allValues);
      return [
        ...(names ?? NO_NAMES).map((name) => ({
          value: name,
          label: name,
          ...(used.includes(name) ? { disabled: true } : {}),
        })),
        ...orphans.map(({ value, label }) => ({
          value,
          label,
          disabled: true,
        })),
      ];
    },
    [names, orphans],
  );
}

/**
 * How a roster list names a column its data file does not carry, worded the
 * way the codebook's own missing-attribute options are worded.
 *
 * "Not in" rather than "no longer in": nobody deleted anything here. A roster
 * column goes missing because the file itself was replaced with one shaped
 * differently, or because the protocol was authored against another file
 * entirely — so the researcher is told what is true of the file in front of
 * them, not a history that may never have happened.
 */
const missingColumnLabel = (column: string): string =>
  `${column} — this attribute is not in the data file`;

/**
 * What a researcher is told about a row left pointing at a lost column.
 *
 * The row is not half-filled — it holds a name, and the name is exactly the
 * problem — so "every row needs a value in each column" would be both wrong
 * and unhelpful. This one names the situation and both ways out.
 */
const MISSING_COLUMN_MESSAGE =
  'This row points at an attribute that is not in the data file. Choose another or delete the row.';

/**
 * The same thing said about a CHECKED column rather than about a row.
 *
 * The situation is identical and the label naming it is the same one, but the
 * ways out are not: a checkbox has no cell to repoint and no row to delete, and
 * telling the researcher to do either would send them looking for controls that
 * are not there. Unchecking is the whole of it, and the sentence says so.
 */
const MISSING_SEARCH_COLUMN_MESSAGE =
  'This search matches an attribute that is not in the data file. Uncheck it and choose another.';

const NO_ORPHANS: readonly SortableProperty[] = Object.freeze([]);
const NO_COLUMNS: readonly string[] = Object.freeze([]);

/**
 * What a roster list holds right now, or `undefined` when it holds nothing.
 *
 * Two hooks rather than one, because they answer differently about a list a
 * section has just CLEARED — swapping the data file clears every list that
 * named a column of the old one. `useStageValue` falls through to the committed
 * draft whenever the form holds nothing at the path, so it hands back the
 * entries the stage was opened with and the old file's columns come straight
 * back as orphans. `useStageHasAnyValue` stops at the tombstone the clear
 * parked, which is the question actually being asked.
 *
 * Read live from the stage's own value rather than from a committed copy,
 * because these lists are registered on the stage form itself: the moment the
 * researcher lets go of a lost column the orphan stops being offered, and an
 * orphan must never become choosable again.
 */
function useHeldList(path: string): unknown {
  const held = useStageValue(path);
  const configured = useStageHasAnyValue([path]);
  return configured ? held : undefined;
}

/**
 * Columns a list names that the chosen data file does not carry, deduped and in
 * the order the list names them.
 *
 * `named` is what each entry of the list names, in order — a cell of a row for
 * the two list editors, the entry itself for the search checkboxes — and
 * `undefined` when the list holds nothing at all. Memoise it: it is a
 * dependency of everything below.
 *
 * `names` is `undefined` while the columns are not known — no file chosen, the
 * bytes still being read, a file that could not be read — and nothing is judged
 * in that state: every entry would be reported dangling on the strength of a
 * question nobody has answered yet. An empty list is the opposite answer and is
 * judged in full: a data file whose people carry no attributes is exactly where
 * every entry the stage holds IS dangling, and it is the state a blank control
 * explains least.
 */
function useOrphanedColumnNames(
  named: readonly unknown[] | undefined,
  names: readonly string[] | undefined,
): readonly string[] {
  return useMemo(() => {
    // The sort-rule finder, asked the same question about a different column:
    // naming each entry's column `property` reuses its dedupe, its "the caller
    // does not know the columns yet" guard, and its skipping of the
    // source-order sentinel, none of which differ here. `undefined` is handed
    // straight through, because it means the same thing on both sides.
    const found = orphanedSortProperties(
      named?.map((column) => ({ property: column })),
      names?.map((name) => ({ value: name, label: name })),
    ).map(({ value }) => value);
    return found.length === 0 ? NO_COLUMNS : found;
  }, [named, names]);
}

/**
 * The orphans the registered rule reads, rather than the ones it closed over.
 *
 * A field's validation function is registered once and memoized on a JSON
 * snapshot of its validation props — and a rule is a FUNCTION, which does not
 * survive `JSON.stringify`, so every rule a field will ever run is the one
 * built on its first render. The columns are read from the data file through
 * the gateway and arrive after that render, so a rule built from them would be
 * registered already knowing nothing and would never be asked again.
 *
 * So the rule keeps one identity and reads what is current, which is how
 * fresco-ui keeps a registered rule's MESSAGES current across a language change
 * (`useField`'s `intlRef`) and for the same reason: re-registering a field
 * deletes the errors it is storing, and an error deleted mid-submit is a
 * refusal the researcher never sees.
 */
function useLiveOrphans(
  values: readonly string[],
): Readonly<{ current: readonly string[] }> {
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  return valuesRef;
}

/**
 * Columns a roster list's rows name that the chosen data file does not carry,
 * as the two things a `MultiSelect` owner needs to hand them back.
 *
 * A roster's lists have the same hole a codebook sort rule has, for the same
 * reason: the value is the id itself, the cell renders from the option list,
 * so an id no option carries leaves the control BLANK while the value behind
 * it is untouched — the researcher sees an empty required cell, cannot find
 * out what it points at, and saves the dangling reference straight back. Only
 * the file changes here rather than the codebook, which changes the words and
 * nothing else.
 *
 * `BuilderSection`'s `resetOn` does not cover this. It clears these lists when
 * the researcher swaps the file, which is a different event: a stage arriving
 * already holding a lost column never changes its `dataSource` at all, so
 * nothing fires and the rows stand.
 */
export function useOrphanedColumns(
  fieldName: string,
  path: string,
  names: readonly string[] | undefined,
): Readonly<{
  /** Offered back so the cell shows what it holds. Never choosable. */
  options: readonly SortableProperty[];
  /** The array-level rule that refuses a save while a row holds one. */
  dangling: readonly DanglingCells[];
}> {
  const rows = useHeldList(path);
  const named = useMemo(
    () =>
      Array.isArray(rows)
        ? rows.map((row) =>
            typeof row === 'object' && row !== null
              ? Reflect.get(row, fieldName)
              : undefined,
          )
        : undefined,
    [fieldName, rows],
  );
  const values = useOrphanedColumnNames(named, names);
  const valuesRef = useLiveOrphans(values);

  const dangling = useMemo<readonly DanglingCells[]>(
    () => [
      {
        fieldName,
        get values() {
          return valuesRef.current;
        },
        message: MISSING_COLUMN_MESSAGE,
      },
    ],
    [fieldName, valuesRef],
  );

  const options = useMemo(
    () =>
      values.length === 0
        ? NO_ORPHANS
        : values.map((value) => ({
            value,
            label: missingColumnLabel(value),
            disabled: true,
          })),
    [values],
  );

  return useMemo(() => ({ options, dangling }), [dangling, options]);
}

/**
 * The same question asked of a list whose entries ARE column names — the search
 * section's checkboxes — as the two things that list's owner needs.
 *
 * `searchOptions.matchProperties` has the hole the two list editors have, for
 * the same reason: the value is the column name itself and the control renders
 * from its option list, so a name no option carries is not rendered at all. A
 * checkbox group is the worst place for that, because nothing is left behind —
 * a row at least shows an empty cell, whereas a checked attribute that has gone
 * missing simply is not on screen, and the researcher saves a search matching
 * against a column the file has not got without ever being told.
 *
 * Two things differ from `useOrphanedColumns`, and both follow from the control
 * rather than from the rule.
 *
 * The orphan is offered ENABLED. A row's orphan option is permanently disabled
 * because the row can still be repointed or deleted, so nothing is lost by
 * making the stale id unchoosable; a checkbox has neither way out, and
 * unchecking is a click on the control itself. Disabled, the refusal below
 * would have no way out at all, and the researcher's only remaining move would
 * be to switch the whole capability off — throwing away the tolerance they set
 * as well. The guarantee the disabling exists for is kept a different way: an
 * orphan is only ever offered while it is still checked, so unchecking it takes
 * it out of the list for good and it can never be chosen afresh.
 *
 * And the refusal is one plain rule rather than a `DanglingCells`, because
 * there are no cells: the whole field is one value, and `messageRuleValidation`
 * is where this section's other rules already live.
 */
export function useOrphanedColumnChoices(
  path: string,
  names: readonly string[] | undefined,
): Readonly<{
  /** Offered back so a checked column is on screen. Gone once unchecked. */
  options: readonly SortableProperty[];
  /** Refuses the save while one is still checked. One stable identity. */
  refusal: MessageRule;
}> {
  const held = useHeldList(path);
  const named = useMemo(() => (Array.isArray(held) ? held : undefined), [held]);
  const values = useOrphanedColumnNames(named, names);
  const valuesRef = useLiveOrphans(values);

  const refusal = useCallback<MessageRule>(
    (value) =>
      Array.isArray(value) &&
      value.some(
        (entry) =>
          typeof entry === 'string' && valuesRef.current.includes(entry),
      )
        ? MISSING_SEARCH_COLUMN_MESSAGE
        : undefined,
    [valuesRef],
  );

  const options = useMemo(
    () =>
      values.length === 0
        ? NO_ORPHANS
        : values.map((value) => ({ value, label: missingColumnLabel(value) })),
    [values],
  );

  return useMemo(() => ({ options, refusal }), [options, refusal]);
}

/** The column each row of a list field currently names. */
function chosenColumns(allValues: unknown): string[] {
  if (!Array.isArray(allValues)) return [];
  return allValues.flatMap((row) =>
    typeof row === 'object' &&
    row !== null &&
    typeof Reflect.get(row, 'variable') === 'string'
      ? [Reflect.get(row, 'variable') as string]
      : [],
  );
}
