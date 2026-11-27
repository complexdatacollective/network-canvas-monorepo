import { isEqual } from 'es-toolkit';

import { defineMessages } from '@codaco/app-i18n/messages';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  dynamicValueNamesIn,
  type FieldTextProblem,
  findFieldTextProblems,
  isOwnTextOf,
  type LocaleTag,
  ownerOfTextPath,
  type ProtocolValidationIssue,
  type TextPlace,
  textPlaceOf,
  validateProtocol,
  VERSION_WITHOUT_WORDING,
} from '@codaco/protocol-validation';
import { valueAtPath } from '@codaco/shared-consts';
import { setProtocolLocalizedStrings } from '~/ducks/modules/activeProtocol';
import type { AppDispatch, RootState } from '~/ducks/store';
import {
  getTranslationGroups,
  locateTranslation,
  type TranslationGroup,
  type TranslationRow,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import {
  cellValue,
  readCellValue,
  readTranslationFieldName,
  translationFieldName,
} from './cellNames';
import {
  findRow,
  isBlankTranslation,
  storedTranslation,
  suppliedCellText,
} from './rowText';
import { isDynamicAttributeWordingOf } from './tableDefinitions';
import { protocolAfter, tableChanges } from './tableProtocol';
import { describePlace } from './textPlaces';
import {
  describeFieldProblem,
  describeUnusableText,
  type FormStoreApi,
  holdSaveFindings,
  registerTranslationCell,
  type Words,
} from './translationDrafts';

const messages = defineMessages({
  textRemoved: {
    id: 'architect.localization.translationTable.textRemoved',
    defaultMessage:
      'This translation cannot be saved, because the wording it belongs to, or its language, has been removed from the protocol.',
    description:
      'Shown above the translation table when saving fails because a translation typed into it belongs to a localized string, or a language, that is no longer in the protocol.',
  },
  versionWithoutWording: {
    id: 'architect.localization.translationTable.versionWithoutWording',
    defaultMessage:
      'A dynamic attribute in this translation has no wording in {language} for some of its versions. Select the dynamic attribute to write the missing wording.',
    description:
      'Shown in a cell of the translation table when its translation shows a dynamic attribute (words that change with the answers given in the interview) that was created in the table and has no wording in the cell’s language for some of its versions, nor in the language that the cell’s language falls back to. language is the cell’s language.',
  },
  versionNeedsWording: {
    id: 'architect.localization.translationTable.versionNeedsWording',
    defaultMessage:
      'Participants who read {language} see this dynamic attribute, so this version needs wording in {language}.',
    description:
      'Shown in an empty cell of the translation table that contains the wording of one version of a dynamic attribute (words that change with the answers given in the interview), when a translation in the cell’s language shows the dynamic attribute and neither the cell’s language nor the language it falls back to has wording for this version. language is the cell’s language.',
  },
  problemInPlace: {
    id: 'architect.localization.translationTable.problemInPlace',
    defaultMessage:
      'Saving these translations would leave a problem in {place}, so nothing was saved. Details: {details}',
    description:
      'Shown above the translation table when saving is refused because the translations would break a rule of the protocol in a place that is not one of the table’s cells. place names that place, such as “Stage 3” or “Node type”. details is the technical description of the problem, in English, kept for support.',
  },
  problemInNamedPlace: {
    id: 'architect.localization.translationTable.problemInNamedPlace',
    defaultMessage:
      'Saving these translations would leave a problem in {place}, “{name}”, so nothing was saved. Details: {details}',
    description:
      'Shown above the translation table when saving is refused because the translations would break a rule of the protocol in a place that is not one of the table’s cells. place names the kind of place, such as “Stage 3” or “Node type”, and name is its name, such as the stage’s name. details is the technical description of the problem, in English, kept for support.',
  },
});

type Values = Readonly<Record<string, FieldValue>>;

/** One cell of the table, by its text's row and its language. */
type CellAt = Readonly<{ row: TranslationRow; locale: LocaleTag }>;

/** The row whose text holds `path`: the one whose path is the longest prefix. */
const rowAt = (
  groups: readonly TranslationGroup[],
  path: readonly PropertyKey[],
): TranslationRow | undefined => {
  let found: TranslationRow | undefined;
  for (const group of groups) {
    for (const row of group.rows) {
      if (
        row.path.length <= path.length &&
        row.path.every((segment, index) => segment === path[index]) &&
        (found === undefined || row.path.length > found.path.length)
      ) {
        found = row;
      }
    }
  }
  return found;
};

const problemKey = (problem: FieldTextProblem) =>
  JSON.stringify([problem.rule, problem.path, problem.locale]);

const issueKey = (issue: ProtocolValidationIssue) =>
  JSON.stringify([issue.path, issue.message]);

/** The name of the field holding `cell`. */
const nameOf = ({ row, locale }: CellAt) =>
  translationFieldName(row.path, locale);

/**
 * The field rules (`findFieldTextProblems`) that `after` breaks and `before`
 * does not: what the protocol already breaks is not the save's to answer for.
 */
const newFieldTextProblems = (
  before: CurrentProtocol,
  after: CurrentProtocol,
): readonly FieldTextProblem[] => {
  const known = new Set(findFieldTextProblems(before).map(problemKey));
  return findFieldTextProblems(after).filter(
    (problem) => !known.has(problemKey(problem)),
  );
};

/**
 * The issues that the protocol's validation finds in `after` and not in
 * `before`, run as the validation of each protocol edit runs it (a draft).
 */
const newValidationIssues = async (
  before: CurrentProtocol,
  after: CurrentProtocol,
): Promise<readonly ProtocolValidationIssue[]> => {
  const [result, resultBefore] = await Promise.all([
    validateProtocol(after, { draft: true }),
    validateProtocol(before, { draft: true }),
  ]);
  const standing = new Set(
    resultBefore.success ? [] : resultBefore.error.issues.map(issueKey),
  );
  return result.success
    ? []
    : result.error.issues.filter((issue) => !standing.has(issueKey(issue)));
};

/**
 * The language that a version of a dynamic attribute needs wording in, when
 * `issue` is that problem (`VERSION_WITHOUT_WORDING`).
 */
const versionWithoutWordingIn = (issue: object): LocaleTag | undefined => {
  const params: unknown = Reflect.get(issue, 'params');
  if (typeof params !== 'object' || params === null) return undefined;
  const locale: unknown = Reflect.get(params, 'locale');
  return Reflect.get(params, 'rule') === VERSION_WITHOUT_WORDING &&
    typeof locale === 'string'
    ? locale
    : undefined;
};

/**
 * Where `path` is a version's wording in one language
 * (`…dynamicAttributes.<id>.<version path>.<language>`), the cells in that
 * language whose text shows the dynamic attribute: the texts of its owner
 * (its stage, or its node label).
 */
const cellsShowingDynamicAttributeAt = (
  groups: readonly TranslationGroup[],
  protocol: CurrentProtocol,
  path: readonly PropertyKey[],
): readonly CellAt[] => {
  const textPath = path.filter(
    (segment): segment is string | number => typeof segment !== 'symbol',
  );
  const place = textPlaceOf(textPath.slice(0, -1));
  const locale = textPath.at(-1);
  if (
    place.kind !== 'dynamicAttributeWording' ||
    typeof locale !== 'string' ||
    !protocol.localization.locales.includes(locale)
  ) {
    return [];
  }
  const { owner } = place;
  const name = dynamicValueNameFor({ kind: 'dynamicAttribute', id: place.id });
  return groups.flatMap((group) =>
    group.rows.flatMap((row) => {
      const value = isOwnTextOf(row.place, owner)
        ? valueAtPath(protocol, [...row.path, locale])
        : undefined;
      return typeof value === 'string' &&
        dynamicValueNamesIn(value).includes(name)
        ? [{ row, locale }]
        : [];
    }),
  );
};

/** Where a problem a save would leave is said, and what is said there. */
type PlacedIssue =
  | Readonly<{ kind: 'cells'; cells: readonly CellAt[]; message: string }>
  | Readonly<{ kind: 'elsewhere'; message: string }>;

/**
 * Where `issue`, found in `after`, is said: on the cell its path names, by
 * the text and the language in it; on each of the text's cells when it names
 * a text but no language; for the wording of a dynamic attribute created in
 * the table, which has no row yet, on the cells whose text shows it in that
 * language; and otherwise above the table, naming where it is.
 */
const placeIssue = (
  issue: ProtocolValidationIssue,
  after: CurrentProtocol,
  groups: readonly TranslationGroup[],
  words: Words,
): PlacedIssue => {
  const { intl, languageName } = words;
  const { locales } = after.localization;
  const details = issue.message;
  const unworded = versionWithoutWordingIn(issue);
  const row = rowAt(groups, issue.path);
  if (row !== undefined) {
    const next = issue.path[row.path.length];
    const locale =
      typeof next === 'string' && locales.includes(next) ? next : undefined;
    return {
      kind: 'cells',
      cells: (locale === undefined ? locales : [locale]).map((cellLocale) => ({
        row,
        locale: cellLocale,
      })),
      message:
        unworded === undefined
          ? describeUnusableText(intl, details)
          : intl.formatMessage(messages.versionNeedsWording, {
              language: languageName(unworded),
            }),
    };
  }
  const showing =
    unworded === undefined
      ? []
      : cellsShowingDynamicAttributeAt(groups, after, issue.path);
  if (showing.length > 0) {
    return {
      kind: 'cells',
      cells: showing,
      message: intl.formatMessage(messages.versionWithoutWording, {
        language: languageName(unworded ?? ''),
      }),
    };
  }
  const place = describePlace(
    intl,
    after,
    locateTranslation(after, issue.path).place,
  );
  return {
    kind: 'elsewhere',
    message:
      place.name === null
        ? intl.formatMessage(messages.problemInPlace, {
            place: place.kind,
            details,
          })
        : intl.formatMessage(messages.problemInNamedPlace, {
            place: place.kind,
            name: place.name.text,
            details,
          }),
  };
};

type SaveFindings = {
  /** What each cell is refused for, by the field holding it. */
  cells: Map<string, CellAt & Readonly<{ message: string }>>;
  /** What is refused somewhere that is not one of the table's cells. */
  elsewhere: Set<string>;
};

/**
 * Everything wrong with the protocol a save would write that the protocol it
 * replaces does not have wrong: the field rules the save would break, and
 * the issues the protocol's validation finds, each said once, where it
 * belongs (`placeIssue`). A rule the table already explains on a cell, such
 * as two diseases' names, is said there in its own words only.
 */
const findSaveProblems = async (
  before: CurrentProtocol,
  after: CurrentProtocol,
  groups: readonly TranslationGroup[],
  words: Words,
): Promise<SaveFindings> => {
  const findings: SaveFindings = { cells: new Map(), elsewhere: new Set() };
  const flag = (cell: CellAt, message: string) => {
    if (!findings.cells.has(nameOf(cell))) {
      findings.cells.set(nameOf(cell), { ...cell, message });
    }
  };

  for (const problem of newFieldTextProblems(before, after)) {
    const row = rowAt(groups, problem.path);
    if (row !== undefined && isEqual(row.path, problem.path)) {
      flag(
        { row, locale: problem.locale },
        describeFieldProblem(problem, words),
      );
    }
  }
  for (const issue of await newValidationIssues(before, after)) {
    const placed = placeIssue(issue, after, groups, words);
    if (placed.kind === 'elsewhere') {
      findings.elsewhere.add(placed.message);
    } else if (!placed.cells.some((cell) => findings.cells.has(nameOf(cell)))) {
      for (const cell of placed.cells) flag(cell, placed.message);
    }
  }
  return findings;
};

/** How many times a save starts again when the protocol changes under it. */
const SAVE_ATTEMPTS = 3;

/** The cells that differ from what they were registered with. */
const changedCells = (formStore: FormStoreApi, values: Values): Values =>
  Object.fromEntries(
    Object.entries(values).filter(([name]) => {
      if (readTranslationFieldName(name) === undefined) return false;
      const field = formStore.getState().getFieldState(name);
      return field !== undefined && !isEqual(field.value, field.initialValue);
    }),
  );

/**
 * Writes every change the table's form holds into the protocol, in one
 * step: one undo takes the whole save back.
 *
 * The form has checked every cell before this runs. The protocol the save
 * would write is then checked whole, as each protocol edit is checked after
 * it is made, and nothing is written while it fails: each problem is said on
 * the cell it belongs to, which is given a field of its own if it has none,
 * or above the table when it belongs to no cell. A protocol that refuses the
 * set anyway, as a read-only one does, is said so above the table.
 */
export const saveTranslations = async ({
  values,
  formStore,
  getState,
  dispatch,
  getWords,
  attempt = 1,
}: {
  values: Record<string, FieldValue>;
  formStore: FormStoreApi;
  getState: () => RootState;
  dispatch: AppDispatch;
  getWords: () => Words;
  attempt?: number;
}): Promise<FormSubmissionResult> => {
  const words = getWords();
  const failed: FormSubmissionResult = {
    success: false,
    formErrors: [words.intl.formatMessage(messages.textRemoved)],
  };
  const before = getState();
  const protocolBefore = getProtocol(before);
  if (!protocolBefore) return failed;

  const { updates, definitions, unknownRow, emptied } = tableChanges(
    before,
    changedCells(formStore, values),
  );
  // Each cell was checked against the rest of its row, so a row left with no
  // translation at all is one the protocol changed under the table.
  if (unknownRow || emptied.length > 0) return failed;
  if (updates.length === 0 && definitions.length === 0) {
    return { success: true };
  }

  const protocolAfterSave = protocolAfter(protocolBefore, updates, definitions);
  if (protocolAfterSave === protocolBefore) return failed;
  const findings = await findSaveProblems(
    protocolBefore,
    protocolAfterSave,
    getTranslationGroups(before),
    words,
  );
  // Checked against a protocol that has since changed: check again.
  if (getProtocol(getState()) !== protocolBefore) {
    return attempt < SAVE_ATTEMPTS
      ? saveTranslations({
          values,
          formStore,
          getState,
          dispatch,
          getWords,
          attempt: attempt + 1,
        })
      : failed;
  }

  if (findings.cells.size > 0 || findings.elsewhere.size > 0) {
    const held = new Map<string, Readonly<{ text: string; message: string }>>();
    for (const [name, { row, locale, message }] of findings.cells) {
      registerTranslationCell(formStore, row, locale, getState, getWords);
      const field = formStore.getState().getFieldState(name);
      held.set(name, { text: readCellValue(field?.value).text, message });
    }
    holdSaveFindings(formStore, held);
    return {
      success: false,
      formErrors: [...findings.elsewhere],
      fieldErrors: Object.fromEntries(
        Array.from(findings.cells, ([name, { message }]) => [name, [message]]),
      ),
    };
  }

  dispatch(setProtocolLocalizedStrings({ updates, definitions }));
  // The history keeps the protocol it had when a change leaves it as it was,
  // as a save does that only adds logic no text uses: that save succeeded.
  return getProtocol(getState()) !== protocolBefore ||
    isEqual(protocolAfterSave, protocolBefore)
    ? { success: true }
    : failed;
};

/**
 * Whether the text at `place` is the wording of a version of a dynamic
 * attribute whose logic a cell in `values` changed: the version may have
 * moved to another version's place.
 */
const isWordingOfChangedLogic = (values: Values, place: TextPlace) =>
  Object.entries(values).some(([name, value]) => {
    const cell = readTranslationFieldName(name);
    const owner = cell === undefined ? undefined : ownerOfTextPath(cell.path);
    return (
      owner !== undefined &&
      readCellValue(value).logic?.dynamicAttributes !== undefined &&
      isDynamicAttributeWordingOf(place, owner)
    );
  });

/**
 * Makes what the table's cells hold what the protocol has, once `values` are
 * saved into the protocol that `state` has, so closing the table loses
 * nothing and asks nothing. No cell holds logic any more: it is the
 * protocol's now. A cell saved empty that still has focus was never left, so
 * a text Network Canvas words is given Network Canvas's wording, which is
 * what the protocol now shows there; and the wording of each version of a
 * dynamic attribute whose logic was saved is read again from the protocol.
 */
export const settleSavedCells = (
  formStore: FormStoreApi,
  values: Values,
  state: RootState,
) => {
  const settled = Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      const cell = readTranslationFieldName(name);
      if (cell === undefined) return [name, value];
      const row = findRow(state, cell.path);
      const { text } = readCellValue(value);
      if (row === undefined) return [name, cellValue(text)];
      if (isWordingOfChangedLogic(values, row.place)) {
        return [name, cellValue(storedTranslation(row, cell.locale))];
      }
      const suppliedText = suppliedCellText(row, cell.locale);
      return [
        name,
        cellValue(
          suppliedText !== undefined && isBlankTranslation(row, text)
            ? suppliedText
            : text,
        ),
      ];
    }),
  );
  const form = formStore.getState();
  form.rebaseToDocument(settled);
  for (const [name, value] of Object.entries(settled)) {
    if (!isEqual(value, values[name])) form.setFieldValue(name, value);
  }
};
