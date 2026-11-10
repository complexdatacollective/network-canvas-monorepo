import { isEqual } from 'es-toolkit';
import { type ContextType, useContext, useLayoutEffect, useRef } from 'react';
import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValidationFunction,
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import { localizedMessageProblemText } from '@codaco/protocol-builder/fields/LocalizedMessageField';
import {
  translationText,
  withMessage,
  withTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  type CurrentProtocol,
  type FieldTextProblem,
  type FieldTextRule,
  findDynamicValueProblems,
  findFieldTextProblems,
  isBlankMessage,
  isBlankText,
  type LocaleTag,
  type LocalizedString,
  type ProtocolValidationIssue,
  STAGE_LABEL_MAX_LENGTH,
  validateProtocol,
} from '@codaco/protocol-validation';
import { useAppStore } from '~/ducks/hooks';
import activeProtocolReducer, {
  setProtocolLocalizedStrings,
} from '~/ducks/modules/activeProtocol';
import type { AppDispatch, RootState } from '~/ducks/store';
import {
  getTranslationGroups,
  locateTranslation,
  type TranslationGroup,
  type TranslationRow,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import { describePlace } from './textPlaces';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  onlyTranslation: {
    id: 'architect.localization.translationTable.onlyTranslation',
    defaultMessage:
      'This is the only translation, and it is in {language}. Add a translation in another language before clearing it.',
    description:
      'Shown in a cell of the translation table when its translation is emptied but is the only translation the localized string has, which cannot be removed. language is the language of the cell.',
  },
  textRemoved: {
    id: 'architect.localization.translationTable.textRemoved',
    defaultMessage:
      'This translation cannot be saved, because the wording it belongs to, or its language, has been removed from the protocol.',
    description:
      'Shown above the translation table when saving fails because a translation typed into it belongs to a localized string, or a language, that is no longer in the protocol.',
  },
  duplicateDiseaseLabel: {
    id: 'architect.localization.translationTable.duplicateDiseaseLabel',
    defaultMessage:
      'Another disease has the same name in {language}. Give each disease a name participants can tell apart.',
    description:
      'Shown in a cell of the translation table holding a disease’s name, on a Narrative Pedigree stage, when participants reading the cell’s language would see the same name for another disease, either because it is written the same or because one of them has no translation and shows another language’s text instead. language is the cell’s language.',
  },
  duplicateOptionLabel: {
    id: 'architect.localization.translationTable.duplicateOptionLabel',
    defaultMessage:
      'Another option of this attribute has the same label in {language}. Give each option a label participants can tell apart.',
    description:
      'Shown in a cell of the translation table holding the label of one of an attribute’s answer options (including the two answers of a yes-or-no attribute), when participants reading the cell’s language would see the same label for another option of the same attribute, either because it is written the same or because one of them has no translation and shows another language’s text instead. language is the cell’s language.',
  },
  stageLabelTooLong: {
    id: 'architect.localization.translationTable.stageLabelTooLong',
    defaultMessage:
      'A stage name can be at most {max, number} characters long. Shorten this one.',
    description:
      'Shown in a cell of the translation table holding a stage’s name when the name is longer than a stage name may be. max is the most characters it may have.',
  },
  interfaceTextWithoutDefaultLanguage: {
    id: 'architect.localization.translationTable.interfaceTextWithoutDefaultLanguage',
    defaultMessage:
      'This text needs words in {language}, the protocol’s default language.',
    description:
      'Shown in a cell of the translation table holding words the interview itself shows, such as a button’s label, when the cell is in the protocol’s default language and has been emptied: those words always need a translation in the default language. language is the default language.',
  },
  textNotUsable: {
    id: 'architect.localization.translationTable.textNotUsable',
    defaultMessage:
      'The protocol cannot hold this text as it is written. Details: {details}',
    description:
      'Shown in a cell of the translation table when its text breaks one of the protocol’s rules that Architect has no explanation of its own for. details is the technical description of the problem, in English, kept for support.',
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

/** What a cell says about each rule `findFieldTextProblems` applies. */
const ruleMessages = {
  duplicateDiseaseLabel: messages.duplicateDiseaseLabel,
  duplicateOptionLabel: messages.duplicateOptionLabel,
  stageLabelTooLong: messages.stageLabelTooLong,
  interfaceTextWithoutDefaultLanguage:
    messages.interfaceTextWithoutDefaultLanguage,
} satisfies Record<FieldTextRule, unknown>;

type TextPath = TranslationRow['path'];

/** How a cell's text is written into the protocol. */
type TextKind = 'text' | 'message';

/**
 * The form field holding one cell's translation: the text's path and the
 * cell's language, spelled with letters and digits only, so the form store
 * reads it as one name rather than as a path of its own.
 */
const translationFieldName = (path: TextPath, locale: LocaleTag) =>
  `t${Array.from(JSON.stringify([path, locale]), (character) =>
    (character.codePointAt(0) ?? 0).toString(16).padStart(6, '0'),
  ).join('')}`;

/** The text and language a field named by `translationFieldName` holds. */
export const readTranslationFieldName = (
  name: string,
): { path: TextPath; locale: LocaleTag } | undefined => {
  const digits = name.slice(1);
  if (!name.startsWith('t') || digits.length % 6 !== 0) return undefined;
  const characters: string[] = [];
  for (let index = 0; index < digits.length; index += 6) {
    const codePoint = Number.parseInt(digits.slice(index, index + 6), 16);
    if (Number.isNaN(codePoint)) return undefined;
    characters.push(String.fromCodePoint(codePoint));
  }
  try {
    const parsed: unknown = JSON.parse(characters.join(''));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      Array.isArray(parsed[0]) &&
      typeof parsed[1] === 'string'
    ) {
      return { path: parsed[0] as TextPath, locale: parsed[1] };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const rowKey = (path: TextPath) => JSON.stringify(path);

const findRow = (
  groups: readonly TranslationGroup[],
  path: TextPath,
): TranslationRow | undefined => {
  const key = rowKey(path);
  for (const group of groups) {
    const found = group.rows.find((row) => rowKey(row.path) === key);
    if (found) return found;
  }
  return undefined;
};

// Text that can show values is kept as written, like a localized message:
// read as plain or formatted text, its values would be flattened away.
const kindOf = (row: TranslationRow): TextKind =>
  row.arguments === undefined && row.dynamicValues === undefined
    ? 'text'
    : 'message';

/**
 * The cell's translation as its field holds it: the text a researcher reads
 * for a plain or formatted text, the message as written for a localized
 * message. Empty where there is none.
 */
const storedTranslation = (row: TranslationRow, locale: LocaleTag) =>
  kindOf(row) === 'message'
    ? (row.value[locale] ?? '')
    : translationText(row.value, locale);

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Whether a cell's text is no translation at all, by the test the protocol
 * itself applies: blank, or only characters participants would not see.
 * Such a cell clears its translation.
 */
export const isBlankTranslation = (row: TranslationRow, text: string) =>
  kindOf(row) === 'message' ? isBlankMessage(text) : isBlankText(text);

/** `value` with the cell's translation in `locale` replaced by `text`. */
const withCellText = (
  row: TranslationRow,
  value: LocalizedString,
  locale: LocaleTag,
  text: string,
) =>
  kindOf(row) === 'message'
    ? withMessage(
        value,
        locale,
        isBlankTranslation(row, text) ? undefined : text,
      )
    : withTranslation(value, locale, isBlankTranslation(row, text) ? '' : text);

/**
 * The row's value with each of its cells as the table holds them now, saved
 * or not, and the cell in `locale` holding `text`. A cell emptied in the table
 * holds no translation in that language.
 */
const rowValueInTable = (
  locales: readonly LocaleTag[],
  row: TranslationRow,
  formValues: Readonly<Record<string, FieldValue>>,
  locale: LocaleTag,
  text: string,
): LocalizedString => {
  const others = locales.reduce<LocalizedString>((held, other) => {
    const name = translationFieldName(row.path, other);
    return other === locale || !Object.hasOwn(formValues, name)
      ? held
      : (withCellText(row, held, other, asText(formValues[name])) ?? {});
  }, row.value);
  return withCellText(row, others, locale, text) ?? {};
};

/**
 * Why `text`, as the row's translation in `locale`, cannot show its values:
 * by the protocol's own check, against the stage's bindings and what the
 * text's place can show, with the row's other cells as the table holds them
 * now, saved or not.
 */
const dynamicValueProblem = (
  protocol: CurrentProtocol,
  row: TranslationRow,
  locale: LocaleTag,
  value: LocalizedString,
): string | undefined => {
  if (row.dynamicValues === undefined) return undefined;
  const at = JSON.stringify([...row.path, locale]);
  return findDynamicValueProblems(
    {
      codebook: protocol.codebook,
      stages: protocol.stages,
      defaultLocale: protocol.localization.defaultLocale,
    },
    [{ path: [...row.path], value, dynamicValues: row.dynamicValues }],
  ).find((problem) => JSON.stringify(problem.path) === at)?.message;
};

export type Words = Readonly<{
  intl: IntlShape;
  languageName: (locale: LocaleTag) => string;
}>;

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const isSamePath = (
  a: readonly (string | number)[],
  b: readonly (string | number)[],
) => a.length === b.length && a.every((segment, index) => segment === b[index]);

/** A cell's text: the translation in `locale` of the text at `path`. */
type Cell = Readonly<{ path: TextPath; locale: LocaleTag; text: string }>;

type RowDraft = { row: TranslationRow; value: LocalizedString };

/**
 * Each row `cells` change, with the value they leave it with, applied in
 * order. `unknownRow` when a cell belongs to a text the protocol no longer
 * has.
 */
const rowDrafts = (
  groups: readonly TranslationGroup[],
  cells: readonly Cell[],
): { drafts: Map<string, RowDraft>; unknownRow: boolean } => {
  const drafts = new Map<string, RowDraft>();
  for (const cell of cells) {
    const key = rowKey(cell.path);
    const found =
      drafts.get(key) ??
      (() => {
        const row = findRow(groups, cell.path);
        return row === undefined ? undefined : { row, value: row.value };
      })();
    if (found === undefined) return { drafts, unknownRow: true };
    // Empty for now, perhaps, while a later cell in the row adds the
    // translation that replaces the one this cell clears.
    drafts.set(key, {
      row: found.row,
      value: withCellText(found.row, found.value, cell.locale, cell.text) ?? {},
    });
  }
  return { drafts, unknownRow: false };
};

/** The writes that give each changed row the value it is drafted with. */
const updatesOf = (drafts: Map<string, RowDraft>) =>
  Array.from(drafts.values())
    .filter(({ row, value }) => !isEqual(value, row.value))
    .map(({ row, value }) => ({ path: row.path, value }));

/**
 * The protocol `updates` would leave, made by the very reducer a save
 * dispatches to, so it is the protocol the save would write: the protocol
 * itself where it refuses them.
 */
const protocolAfter = (
  protocol: CurrentProtocol,
  updates: ReturnType<typeof updatesOf>,
): CurrentProtocol =>
  updates.length === 0
    ? protocol
    : (activeProtocolReducer(
        protocol,
        setProtocolLocalizedStrings({ updates }),
      ) ?? protocol);

/**
 * The protocol as the table holds it now, and the field rules it breaks,
 * kept for the cells checked against the same drafts: a change rechecks every
 * cell already left, and each would otherwise build it again.
 */
let heldDrafts:
  | Readonly<{
      protocol: CurrentProtocol;
      key: string;
      problems: readonly FieldTextProblem[];
    }>
  | undefined;

/**
 * The field rules (`findFieldTextProblems`) the protocol breaks with every
 * cell as the table holds it now. A row whose cells would leave it with no
 * translation at all is left as the protocol has it: the cell that empties it
 * says so itself.
 */
const fieldProblemsInTable = (
  state: RootState,
  formValues: Readonly<Record<string, FieldValue>>,
): readonly FieldTextProblem[] => {
  const protocol = getProtocol(state);
  if (!protocol) return [];
  const groups = getTranslationGroups(state);
  const cells = Object.entries(formValues).flatMap(([name, value]) => {
    const cell = readTranslationFieldName(name);
    if (cell === undefined) return [];
    const row = findRow(groups, cell.path);
    const text = asText(value);
    return row === undefined || text === storedTranslation(row, cell.locale)
      ? []
      : [{ ...cell, text }];
  });
  const key = JSON.stringify(cells);
  if (heldDrafts?.protocol === protocol && heldDrafts.key === key) {
    return heldDrafts.problems;
  }
  const { drafts } = rowDrafts(groups, cells);
  for (const [draftKey, { value }] of drafts) {
    if (Object.keys(value).length === 0) drafts.delete(draftKey);
  }
  const problems = findFieldTextProblems(
    protocolAfter(protocol, updatesOf(drafts)),
  );
  heldDrafts = { protocol, key, problems };
  return problems;
};

/** What a cell says about a field rule its text breaks. */
const describeFieldProblem = (
  problem: FieldTextProblem,
  { intl, languageName }: Words,
) =>
  intl.formatMessage(ruleMessages[problem.rule], {
    language: languageName(problem.locale),
    max: STAGE_LABEL_MAX_LENGTH,
  });

/**
 * What the last refused save found wrong with cells, by field, and the text
 * each held then. A cell keeps saying so until its text changes or Save is
 * pressed again: the checks a cell makes on its own cannot see everything a
 * whole protocol is checked for.
 */
const saveFindings = new WeakMap<
  FormStoreApi,
  Map<string, Readonly<{ text: string; message: string }>>
>();

/** Forgets what the last refused save found, before the next is checked. */
export const clearSaveFindings = (formStore: FormStoreApi) => {
  saveFindings.delete(formStore);
};

/**
 * The rules a cell's translation is held to before it can be saved, the ones
 * the protocol and its editors hold the text to: the declaration of the
 * text's field, the values a text can show, that a text cannot lose its last
 * translation, and the rules the field shares with its neighbours
 * (`findFieldTextProblems`). Each is judged against what the table's other
 * cells hold now, saved or not.
 */
const cellValidation =
  (
    formStore: FormStoreApi,
    path: TextPath,
    locale: LocaleTag,
    getState: () => RootState,
    getWords: () => Words,
  ): FieldValidationFunction =>
  (formValues) =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        const words = getWords();
        const { intl, languageName } = words;
        const fail = (message: string) =>
          ctx.addIssue({ code: 'custom', input: value, message, path: [] });
        const state = getState();
        const protocol = getProtocol(state);
        const row = findRow(getTranslationGroups(state), path);
        // A text or language gone from the protocol has no cell to show the
        // reason in; saving says so above the table instead.
        if (
          protocol === null ||
          row === undefined ||
          !protocol.localization.locales.includes(locale)
        ) {
          return;
        }
        const { locales } = protocol.localization;
        const text = asText(value);
        const blank = isBlankTranslation(row, text);
        const rowValue = rowValueInTable(
          locales,
          row,
          formValues,
          locale,
          text,
        );

        if (!blank) {
          // The field's own declaration, whatever rules it holds.
          const parsed = row.schema.safeParse(rowValue);
          const issue = parsed.success
            ? undefined
            : parsed.error.issues.find(
                ({ path: at }) => at.length === 0 || at[0] === locale,
              );
          if (issue !== undefined) {
            fail(
              (row.arguments === undefined
                ? undefined
                : localizedMessageProblemText(
                    { [locale]: text },
                    row.arguments,
                    intl,
                  )) ??
                intl.formatMessage(messages.textNotUsable, {
                  details: issue.message,
                }),
            );
            return;
          }
          const problem = dynamicValueProblem(protocol, row, locale, rowValue);
          if (problem !== undefined) {
            fail(problem);
            return;
          }
        } else if (Object.keys(rowValue).length === 0) {
          fail(
            intl.formatMessage(messages.onlyTranslation, {
              language: languageName(locale),
            }),
          );
          return;
        }

        const fieldProblem = fieldProblemsInTable(state, formValues).find(
          (problem) =>
            problem.locale === locale && isSamePath(problem.path, path),
        );
        if (fieldProblem !== undefined) {
          fail(describeFieldProblem(fieldProblem, words));
          return;
        }

        const finding = saveFindings
          .get(formStore)
          ?.get(translationFieldName(path, locale));
        if (finding !== undefined && finding.text === text) {
          fail(finding.message);
        }
      }),
    );

/**
 * Gives the cell of `row` in `locale` a field in the table's form, holding the
 * translation the protocol has, unless it has one already. Whether it did.
 */
const registerTranslationCell = (
  formStore: FormStoreApi,
  row: TranslationRow,
  locale: LocaleTag,
  getState: () => RootState,
  getWords: () => Words,
) => {
  const state = formStore.getState();
  const name = translationFieldName(row.path, locale);
  if (state.fields.has(name)) return false;
  state.registerField({
    name,
    initialValue: storedTranslation(row, locale),
    validation: cellValidation(formStore, row.path, locale, getState, getWords),
  });
  return true;
};

/**
 * One cell's translation, held in the translation table's form until the
 * table is saved: what it shows, whether it differs from what the protocol
 * has, and why it cannot be saved, once the researcher has left the cell.
 *
 * The field is registered the first time the cell is edited and stays
 * registered while the table is open, so a cell scrolled, filtered or hidden
 * away still has its change saved, and still stops a save it would break.
 */
export const useTranslationDraft = ({
  row,
  locale,
}: {
  row: TranslationRow;
  locale: LocaleTag;
}) => {
  const formStore = useContext(FormStoreContext);
  if (formStore === undefined) {
    throw new Error('A translation cell needs the translation table’s form.');
  }
  const intl = useAppIntl();
  const languageName = useLanguageName();
  // Read by a field's validation when it runs, so a check made after a change
  // of language reports in the new one.
  const words = useRef<Words>({ intl, languageName });
  useLayoutEffect(() => {
    words.current = { intl, languageName };
  });
  const appStore = useAppStore();
  const name = translationFieldName(row.path, locale);
  const field = useFormStore((state) => state.getFieldState(name));
  // Only the first reason is shown, and a string compares by value.
  const firstError = useFormStore((state) => state.getFieldErrors(name)?.[0]);

  const stored = storedTranslation(row, locale);
  const text = field === undefined ? stored : asText(field.value);
  const changed =
    field !== undefined &&
    !isEqual(asText(field.value), asText(field.initialValue));
  const error =
    field?.meta.isBlurred === true && !field.meta.isValidating
      ? firstError
      : undefined;

  // Whether a check already made still holds can turn on another cell: a row
  // whose last translation was cleared is fine once another is written. Each
  // cell already left is checked again; the form's own check runs only the
  // field that changed. Registering a field also drops the checks under way.
  const recheckLeftCells = () => {
    const state = formStore.getState();
    for (const [fieldName, fieldState] of state.fields) {
      if (fieldName !== name && fieldState.meta.isBlurred) {
        void state.validateField(fieldName);
      }
    }
  };

  const registerCell = (cellLocale: LocaleTag) =>
    registerTranslationCell(
      formStore,
      row,
      cellLocale,
      () => appStore.getState(),
      () => words.current,
    );

  const register = () => {
    if (registerCell(locale)) recheckLeftCells();
  };

  // An edit to the default-language text can break a translation nobody has
  // touched: one that leaves out a value the text now shows. A cell has a
  // field only once it is edited, and only a field can refuse the save, so
  // the first edit to a default-language cell gives each other translation of
  // a text with values a field of its own, left as it was. It is registered
  // at once rather than when the cell is left: a save pressed while the
  // edited cell still has focus validates the fields registered when it
  // starts, before the cell's blur is handled, and a translation registered
  // only then would escape the check. The save's own validation then says in
  // that cell what it lacks; leaving the edited cell says so sooner.
  const otherTranslations = (): LocaleTag[] => {
    const protocol = getProtocol(appStore.getState());
    if (
      row.dynamicValues === undefined ||
      !protocol ||
      locale !== protocol.localization.defaultLocale
    ) {
      return [];
    }
    return protocol.localization.locales.filter(
      (other) =>
        other !== locale &&
        !isBlankTranslation(row, storedTranslation(row, other)),
    );
  };

  const registerOtherTranslations = () => {
    for (const other of otherTranslations()) registerCell(other);
  };

  const checkOtherTranslations = () => {
    const state = formStore.getState();
    for (const other of otherTranslations()) {
      registerCell(other);
      // Validated with every other cell already left, just below.
      state.setFieldBlurred(translationFieldName(row.path, other));
    }
  };

  const change = (next: string) => {
    register();
    registerOtherTranslations();
    const state = formStore.getState();
    state.setFieldValue(name, next);
    if (state.getFieldState(name)?.meta.isBlurred)
      void state.validateField(name);
    recheckLeftCells();
  };

  /** The researcher has left the cell: its text is checked from now on. */
  const leave = () => {
    const state = formStore.getState();
    if (!state.fields.has(name)) return;
    state.setFieldBlurred(name);
    void state.validateField(name);
    const left = state.getFieldState(name);
    if (
      left !== undefined &&
      !isEqual(asText(left.value), asText(left.initialValue))
    ) {
      checkOtherTranslations();
    }
    recheckLeftCells();
  };

  /** Puts back the text the protocol has. */
  const revert = () => {
    const state = formStore.getState();
    if (!state.fields.has(name)) return;
    state.resetField(name);
    recheckLeftCells();
  };

  return { name, text, changed, error, change, leave, revert };
};

/** The row whose text holds `path`: the one whose path is the longest prefix. */
const rowAt = (
  groups: readonly TranslationGroup[],
  path: readonly (string | number)[],
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

const issueKey = (issue: ProtocolValidationIssue) =>
  JSON.stringify([issue.path, issue.message]);

const problemKey = (problem: FieldTextProblem) =>
  JSON.stringify([problem.rule, problem.path, problem.locale]);

type SaveFindings = {
  /** What each cell is refused for, by the field holding it. */
  cells: Map<
    string,
    { row: TranslationRow; locale: LocaleTag; message: string }
  >;
  /** What is refused somewhere that is not one of the table's cells. */
  elsewhere: Set<string>;
};

/**
 * Everything wrong with the protocol a save would write that the protocol it
 * replaces does not have wrong: the field rules (`findFieldTextProblems`)
 * the save would break, and the issues the protocol's validation finds, run
 * as the validation of each protocol edit runs it (`validateProtocolAsync`,
 * a draft).
 * Each is placed on the cell it belongs to, by the text and the language in
 * its path; one on a text but no language on each of the text's cells; one
 * on no text above the table, naming where it is.
 */
const findSaveProblems = async (
  before: CurrentProtocol,
  after: CurrentProtocol,
  groups: readonly TranslationGroup[],
  words: Words,
): Promise<SaveFindings> => {
  const { intl } = words;
  const { locales } = after.localization;
  const findings: SaveFindings = { cells: new Map(), elsewhere: new Set() };
  const flag = (row: TranslationRow, locale: LocaleTag, message: string) => {
    const name = translationFieldName(row.path, locale);
    if (!findings.cells.has(name)) {
      findings.cells.set(name, { row, locale, message });
    }
  };
  const flagged = (row: TranslationRow, locale?: LocaleTag) =>
    (locale === undefined ? locales : [locale]).some((cellLocale) =>
      findings.cells.has(translationFieldName(row.path, cellLocale)),
    );

  const known = new Set(findFieldTextProblems(before).map(problemKey));
  for (const problem of findFieldTextProblems(after)) {
    if (known.has(problemKey(problem))) continue;
    const row = findRow(groups, problem.path);
    if (row !== undefined) {
      flag(row, problem.locale, describeFieldProblem(problem, words));
    }
  }

  // What the protocol already fails is not the save's to answer for.
  const [result, resultBefore] = await Promise.all([
    validateProtocol(after, { draft: true }),
    validateProtocol(before, { draft: true }),
  ]);
  const standing = new Set(
    resultBefore.success ? [] : resultBefore.error.issues.map(issueKey),
  );
  const issues: readonly ProtocolValidationIssue[] = result.success
    ? []
    : result.error.issues.filter((issue) => !standing.has(issueKey(issue)));
  for (const issue of issues) {
    const details = issue.message;
    const row = rowAt(groups, issue.path);
    if (row !== undefined) {
      const next = issue.path[row.path.length];
      const locale =
        typeof next === 'string' && locales.includes(next) ? next : undefined;
      // A rule the table already explains, such as two diseases' names,
      // is said once, in its own words.
      if (flagged(row, locale)) continue;
      for (const cellLocale of locale === undefined ? locales : [locale]) {
        flag(
          row,
          cellLocale,
          intl.formatMessage(messages.textNotUsable, { details }),
        );
      }
      continue;
    }
    const place = describePlace(
      intl,
      after,
      locateTranslation(after, issue.path).place,
    );
    findings.elsewhere.add(
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
    );
  }
  return findings;
};

/** How many times a save starts again when the protocol changes under it. */
const SAVE_ATTEMPTS = 3;

/**
 * Writes every changed translation the table's form holds into the protocol,
 * in one step: one undo takes the whole save back.
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
  const groups = getTranslationGroups(before);

  const cells = Object.keys(values).flatMap((name) => {
    const cell = readTranslationFieldName(name);
    const field = formStore.getState().getFieldState(name);
    if (cell === undefined || field === undefined) return [];
    if (isEqual(asText(field.value), asText(field.initialValue))) return [];
    return [{ ...cell, text: asText(field.value) }];
  });
  const { drafts, unknownRow } = rowDrafts(groups, cells);
  // Each cell was checked against the rest of its row, so a row left with no
  // translation at all is one the protocol changed under the table.
  if (
    unknownRow ||
    Array.from(drafts.values()).some(
      ({ value }) => Object.keys(value).length === 0,
    )
  ) {
    return failed;
  }
  const updates = updatesOf(drafts);
  if (updates.length === 0) return { success: true };

  const protocolAfterSave = protocolAfter(protocolBefore, updates);
  if (protocolAfterSave === protocolBefore) return failed;
  const findings = await findSaveProblems(
    protocolBefore,
    protocolAfterSave,
    groups,
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
      held.set(name, {
        text: field === undefined ? '' : asText(field.value),
        message,
      });
    }
    saveFindings.set(formStore, held);
    return {
      success: false,
      formErrors: [...findings.elsewhere],
      fieldErrors: Object.fromEntries(
        Array.from(findings.cells, ([name, { message }]) => [name, [message]]),
      ),
    };
  }

  dispatch(setProtocolLocalizedStrings({ updates }));
  return getProtocol(getState()) === protocolBefore
    ? failed
    : { success: true };
};
