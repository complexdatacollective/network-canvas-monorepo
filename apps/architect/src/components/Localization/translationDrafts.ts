import { isEqual } from 'es-toolkit';
import { useContext, useRef } from 'react';
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
import { localizedMessageValidation } from '@codaco/protocol-builder/fields/LocalizedMessageField';
import {
  translationText,
  withMessage,
  withTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  type CurrentProtocol,
  findDynamicValueProblems,
  isBlankMessage,
  isBlankText,
  type LocaleTag,
  type LocalizedString,
} from '@codaco/protocol-validation';
import { useAppStore } from '~/ducks/hooks';
import { setProtocolLocalizedStrings } from '~/ducks/modules/activeProtocol';
import type { AppDispatch, RootState } from '~/ducks/store';
import {
  getTranslationGroups,
  type TranslationGroup,
  type TranslationRow,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

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
});

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
 * Why `text`, as the row's translation in `locale`, cannot show its values:
 * by the protocol's own check, against the stage's bindings and what the
 * text's place can show, with the row's other cells as the table holds them
 * now, saved or not.
 */
const dynamicValueProblem = (
  state: RootState,
  row: TranslationRow,
  locale: LocaleTag,
  text: string,
  formValues: Readonly<Record<string, FieldValue>>,
): string | undefined => {
  const protocol = getProtocol(state);
  if (!protocol || row.dynamicValues === undefined) return undefined;
  // A cell emptied in the table holds no translation in that language.
  const value = protocol.localization.locales.reduce<LocalizedString>(
    (held, other) => {
      const name = translationFieldName(row.path, other);
      return other === locale || !Object.hasOwn(formValues, name)
        ? held
        : (withCellText(row, held, other, asText(formValues[name])) ?? {});
    },
    row.value,
  );
  const at = JSON.stringify([...row.path, locale]);
  return findDynamicValueProblems(
    {
      codebook: protocol.codebook,
      stages: protocol.stages,
      defaultLocale: protocol.localization.defaultLocale,
    },
    [
      {
        path: [...row.path],
        value: { ...value, [locale]: text },
        dynamicValues: row.dynamicValues,
      },
    ],
  ).find((problem) => JSON.stringify(problem.path) === at)?.message;
};

type Words = Readonly<{
  intl: IntlShape;
  languageName: (locale: LocaleTag) => string;
}>;

/**
 * The rules a cell's translation is held to before it can be saved, the ones
 * the protocol itself holds the text to: a localized message keeps its
 * setting's rule, and a text cannot lose its last translation. That one is
 * judged against what the row's other cells hold now, saved or not.
 */
const cellValidation =
  (
    path: TextPath,
    locale: LocaleTag,
    getState: () => RootState,
    getWords: () => Words,
  ): FieldValidationFunction =>
  (formValues) =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        const { intl, languageName } = getWords();
        const fail = (message: string) =>
          ctx.addIssue({ code: 'custom', input: value, message, path: [] });
        const state = getState();
        const row = findRow(getTranslationGroups(state), path);
        const locales = getProtocol(state)?.localization.locales;
        // A text or language gone from the protocol has no cell to show the
        // reason in; saving says so above the table instead.
        if (row === undefined || locales?.includes(locale) !== true) return;
        const text = asText(value);
        if (row.arguments !== undefined && !isBlankTranslation(row, text)) {
          const result = localizedMessageValidation(row.arguments, intl).schema;
          const parsed =
            typeof result === 'function'
              ? undefined
              : result.safeParse({ [locale]: text });
          const issue =
            parsed?.success === false ? parsed.error.issues[0] : undefined;
          if (issue !== undefined) {
            fail(issue.message);
            return;
          }
        }
        if (row.dynamicValues !== undefined && !isBlankTranslation(row, text)) {
          const problem = dynamicValueProblem(
            state,
            row,
            locale,
            text,
            formValues,
          );
          if (problem !== undefined) {
            fail(problem);
            return;
          }
        }
        if (!isBlankTranslation(row, text)) return;
        const translatedElsewhere = locales.some((other) => {
          if (other === locale) return false;
          const name = translationFieldName(path, other);
          const held = Object.hasOwn(formValues, name)
            ? asText(formValues[name])
            : storedTranslation(row, other);
          return !isBlankTranslation(row, held);
        });
        if (!translatedElsewhere) {
          fail(
            intl.formatMessage(messages.onlyTranslation, {
              language: languageName(locale),
            }),
          );
        }
      }),
    );

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
  const words = useRef<Words>({ intl, languageName });
  words.current = { intl, languageName };
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

  const registerCell = (cellLocale: LocaleTag) => {
    const state = formStore.getState();
    const cellName = translationFieldName(row.path, cellLocale);
    if (state.fields.has(cellName)) return false;
    state.registerField({
      name: cellName,
      initialValue: storedTranslation(row, cellLocale),
      validation: cellValidation(
        row.path,
        cellLocale,
        appStore.getState,
        () => words.current,
      ),
    });
    return true;
  };

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

/**
 * Writes every changed translation the table's form holds into the protocol,
 * in one step: one undo takes the whole save back. The form has checked every
 * cell before this runs; a protocol that refuses the set anyway, as a
 * read-only one does, is said so above the table.
 */
export const saveTranslations = ({
  values,
  getFieldState,
  getState,
  dispatch,
  intl,
}: {
  values: Record<string, FieldValue>;
  getFieldState: (
    name: string,
  ) => { value: FieldValue; initialValue?: FieldValue } | undefined;
  getState: () => RootState;
  dispatch: AppDispatch;
  intl: IntlShape;
}): FormSubmissionResult => {
  const failed: FormSubmissionResult = {
    success: false,
    formErrors: [intl.formatMessage(messages.textRemoved)],
  };
  const before = getState();
  const groups = getTranslationGroups(before);
  const rows = new Map<
    string,
    { row: TranslationRow; value: LocalizedString }
  >();

  for (const name of Object.keys(values)) {
    const cell = readTranslationFieldName(name);
    const field = getFieldState(name);
    if (cell === undefined || field === undefined) continue;
    if (isEqual(asText(field.value), asText(field.initialValue))) continue;
    const key = rowKey(cell.path);
    const found =
      rows.get(key) ??
      (() => {
        const row = findRow(groups, cell.path);
        return row === undefined ? undefined : { row, value: row.value };
      })();
    if (found === undefined) return failed;
    const next = withCellText(
      found.row,
      found.value,
      cell.locale,
      asText(field.value),
    );
    // Empty for now, perhaps, while a later cell in the row adds the
    // translation that replaces the one this cell clears.
    rows.set(key, { row: found.row, value: next ?? {} });
  }

  // Each cell was checked against the rest of its row, so a row left with no
  // translation at all is one the protocol changed under the table.
  if (
    Array.from(rows.values()).some(
      ({ value }) => Object.keys(value).length === 0,
    )
  ) {
    return failed;
  }
  const updates = Array.from(rows.values())
    .filter(({ row, value }) => !isEqual(value, row.value))
    .map(({ row, value }) => ({ path: row.path, value }));
  if (updates.length === 0) return { success: true };

  const protocolBefore: CurrentProtocol | null = getProtocol(before);
  dispatch(setProtocolLocalizedStrings({ updates }));
  return getProtocol(getState()) === protocolBefore
    ? failed
    : { success: true };
};
