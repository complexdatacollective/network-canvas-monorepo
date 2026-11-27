import { isEqual } from 'es-toolkit';

import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  type CurrentProtocol,
  type FieldTextProblem,
  findFieldTextProblems,
  type LocaleTag,
  type LocalizedString,
} from '@codaco/protocol-validation';
import activeProtocolReducer, {
  setProtocolLocalizedStrings,
} from '~/ducks/modules/activeProtocol';
import type { OwnerTextDefinitions } from '~/ducks/modules/protocol/localeOperations';
import type { RootState } from '~/ducks/store';
import type { TranslationRow } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import {
  pathKey,
  readCellValue,
  readTranslationFieldName,
  type TextPath,
} from './cellNames';
import { findRow, withCellText } from './rowText';
import { definitionDraftsIn, isWordingOfDrafted } from './tableDefinitions';

type Values = Readonly<Record<string, FieldValue>>;

/** A cell's text: the translation in `locale` of the text at `path`. */
type Cell = Readonly<{ path: TextPath; locale: LocaleTag; text: string }>;

type RowDraft = { row: TranslationRow; value: LocalizedString };

/**
 * Each row `cells` change, with the value they leave it with, applied in
 * order. `unknownRow` when a cell belongs to a text the protocol no longer
 * has.
 */
const rowDrafts = (
  state: RootState,
  cells: readonly Cell[],
): { drafts: Map<string, RowDraft>; unknownRow: boolean } => {
  const drafts = new Map<string, RowDraft>();
  let unknownRow = false;
  for (const cell of cells) {
    const key = pathKey(cell.path);
    const found =
      drafts.get(key) ??
      (() => {
        const row = findRow(state, cell.path);
        return row === undefined ? undefined : { row, value: row.value };
      })();
    if (found === undefined) {
      unknownRow = true;
      continue;
    }
    // Empty for now, perhaps, while a later cell in the row adds the
    // translation that replaces the one this cell clears.
    drafts.set(key, {
      row: found.row,
      value: withCellText(found.row, found.value, cell.locale, cell.text),
    });
  }
  return { drafts, unknownRow };
};

/** A text that the table changes, and every translation it is left with. */
type TextUpdate = Readonly<{ path: TextPath; value: LocalizedString }>;

/**
 * What saving `values`, the table's cells, would write: every text that a
 * cell changes (`updates`), and the conditions and dynamic attributes that
 * the cells' logic changes (`definitions`), whose versions' wording is
 * written with them rather than by the path of its row.
 *
 * - `unknownRow`: a cell belongs to a text the protocol no longer has.
 * - `emptied`: the texts that the cells leave with no translation at all,
 *   which the protocol refuses. They are not in `updates`.
 */
export const tableChanges = (
  state: RootState,
  values: Values,
): Readonly<{
  updates: readonly TextUpdate[];
  definitions: readonly OwnerTextDefinitions[];
  unknownRow: boolean;
  emptied: readonly TextPath[];
}> => {
  const cells = Object.entries(values).flatMap(([name, value]) => {
    const cell = readTranslationFieldName(name);
    return cell === undefined
      ? []
      : [{ ...cell, text: readCellValue(value).text }];
  });
  const { drafts, unknownRow } = rowDrafts(state, cells);
  const definitions = definitionDraftsIn(state, values);
  const changed = Array.from(drafts.values()).filter(
    ({ row, value }) =>
      !isEqual(value, row.value) && !isWordingOfDrafted(definitions, row.place),
  );
  return {
    updates: changed.flatMap(({ row, value }) =>
      Object.keys(value).length === 0 ? [] : [{ path: row.path, value }],
    ),
    definitions,
    unknownRow,
    emptied: changed.flatMap(({ row, value }) =>
      Object.keys(value).length === 0 ? [row.path] : [],
    ),
  };
};

/**
 * The protocol `updates` and `definitions` would leave, made by the very
 * reducer a save dispatches to, so it is the protocol the save would write:
 * the protocol itself where it refuses them.
 */
export const protocolAfter = (
  protocol: CurrentProtocol,
  updates: readonly TextUpdate[],
  definitions: readonly OwnerTextDefinitions[],
): CurrentProtocol =>
  updates.length === 0 && definitions.length === 0
    ? protocol
    : (activeProtocolReducer(
        protocol,
        setProtocolLocalizedStrings({ updates, definitions }),
      ) ?? protocol);

/** Whether `a` and `b` hold the same fields, each holding the same value. */
const isSameValues = (a: Values, b: Values) => {
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every((name) => Object.hasOwn(b, name) && a[name] === b[name])
  );
};

/**
 * The last protocol made for each protocol in the store, and the cells it was
 * made from: every cell and hook of the table asks for it, with the same
 * cells, after each change.
 */
const madeInTable = new WeakMap<
  CurrentProtocol,
  Readonly<{ values: Values; protocol: CurrentProtocol }>
>();

/**
 * The protocol as the translation table holds it: what saving `values`, the
 * table's cells, would write (see `tableChanges`), with every text, logic
 * change and version's wording as the cells hold them now. A text that the
 * cells leave with no translation at all is left as the protocol has it: the
 * cell that empties it says so itself. This is what every cell is checked
 * against, and what decides which languages each text is used in.
 */
export const protocolInTable = (
  state: RootState,
  values: Values,
): CurrentProtocol | null => {
  const protocol = getProtocol(state);
  if (protocol === null) return null;
  const made = madeInTable.get(protocol);
  if (made !== undefined && isSameValues(made.values, values)) {
    return made.protocol;
  }
  const { updates, definitions } = tableChanges(state, values);
  const result = protocolAfter(protocol, updates, definitions);
  madeInTable.set(protocol, { values, protocol: result });
  return result;
};

const problemsOf = new WeakMap<CurrentProtocol, readonly FieldTextProblem[]>();

/**
 * The field rules (`findFieldTextProblems`) that the protocol as the table
 * holds it breaks (see `protocolInTable`).
 */
export const fieldProblemsInTable = (
  state: RootState,
  values: Values,
): readonly FieldTextProblem[] => {
  const protocol = protocolInTable(state, values);
  if (protocol === null) return [];
  const known = problemsOf.get(protocol);
  if (known !== undefined) return known;
  const problems = findFieldTextProblems(protocol);
  problemsOf.set(protocol, problems);
  return problems;
};
