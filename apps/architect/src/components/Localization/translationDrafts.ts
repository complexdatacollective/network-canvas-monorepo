import { isEqual } from 'es-toolkit';
import {
  type ContextType,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValidationFunction,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import { localizedMessageProblemText } from '@codaco/protocol-builder/fields/LocalizedMessageField';
import {
  type CurrentProtocol,
  expectedLocalesOf,
  type FieldTextProblem,
  type FieldTextRule,
  findDynamicValueProblems,
  findNodeLabelProblems,
  type LocaleTag,
  type LocalizedString,
  STAGE_LABEL_TOO_LONG,
  type TextOwnerPath,
} from '@codaco/protocol-validation';
import { valueAtPath } from '@codaco/shared-consts';
import { useAppSelector, useAppStore } from '~/ducks/hooks';
import type { TextDefinitionKey } from '~/ducks/modules/protocol/localeOperations';
import type { RootState } from '~/ducks/store';
import { getTranslationGroups, type TranslationRow } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import {
  type CellValue,
  cellValue,
  pathKey,
  readCellValue,
  type TextPath,
  translationFieldName,
  useStablePath,
} from './cellNames';
import { fieldsLeftOut, formFieldsAt, formVariables } from './formTranslations';
import {
  findRow,
  isBlankTranslation,
  storedTranslation,
  suppliedCellText,
  withCellText,
} from './rowText';
import {
  definitionsInTable,
  logicWrite,
  ownerTextPaths,
} from './tableDefinitions';
import { fieldProblemsInTable, protocolInTable } from './tableProtocol';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  onlyTranslation: {
    id: 'architect.localization.translationTable.onlyTranslation',
    defaultMessage:
      'This is the only translation, and it is in {language}. Add a translation in another language before clearing it.',
    description:
      'Shown in a cell of the translation table when its translation is emptied but is the only translation the localized string has, which cannot be removed. language is the language of the cell.',
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
      'This translation breaks a rule of the protocol, so it cannot be saved as it is written. Details: {details}',
    description:
      'Shown in a cell of the translation table when its text breaks one of the protocol’s rules that Architect has no explanation of its own for. details is the technical description of the problem, in English, kept for support.',
  },
  fieldLeftOut: {
    id: 'architect.localization.translationTable.fieldLeftOut',
    defaultMessage:
      '{count, plural, one {The form no longer contains the field that collects {attributes} in any language. Put the field back, or remove it in the stage editor.} other {The form no longer contains the fields that collect {attributes} in any language. Put the fields back, or remove them in the stage editor.}}',
    description:
      'Shown in a cell of the translation table that contains the text of a form, when a field was taken out of the text and no other language’s text of the form contains it. A field can be removed from a form only in the stage editor. attributes is a list of the names of the attributes that those fields collect. count is how many fields there are.',
  },
});

/** What a cell says about each rule `findFieldTextProblems` applies. */
const ruleMessages = {
  duplicateDiseaseLabel: messages.duplicateDiseaseLabel,
  duplicateOptionLabel: messages.duplicateOptionLabel,
  interfaceTextWithoutDefaultLanguage:
    messages.interfaceTextWithoutDefaultLanguage,
} satisfies Record<FieldTextRule, unknown>;

/**
 * What a cell says about a rule its field's own declaration names, in
 * Architect's words, where it has words of its own for one: the length a
 * stage's name may be (`STAGE_LABEL_TOO_LONG`).
 */
const declaredRuleMessage = (issue: object, intl: IntlShape) => {
  const params: unknown = Reflect.get(issue, 'params');
  if (typeof params !== 'object' || params === null) return undefined;
  const max: unknown = Reflect.get(params, 'max');
  // The limit is the one the declaration refused the name by, as it says so.
  return Reflect.get(params, 'rule') === STAGE_LABEL_TOO_LONG &&
    typeof max === 'number'
    ? intl.formatMessage(messages.stageLabelTooLong, { max })
    : undefined;
};

/** What a cell says about a rule of the protocol it has no words of its own for. */
export const describeUnusableText = (intl: IntlShape, details: string) =>
  intl.formatMessage(messages.textNotUsable, { details });

export type Words = Readonly<{
  intl: IntlShape;
  languageName: (locale: LocaleTag) => string;
}>;

export type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

/** What a cell says about a field rule its text breaks. */
export const describeFieldProblem = (
  problem: FieldTextProblem,
  { intl, languageName }: Words,
) =>
  intl.formatMessage(ruleMessages[problem.rule], {
    language: languageName(problem.locale),
  });

/**
 * The row's value with each of its cells as the table holds them now, saved
 * or not, and the cell in `locale` holding `text`. A cell emptied in the table
 * holds no translation in that language.
 */
const rowValueInTable = (
  locales: readonly LocaleTag[],
  row: TranslationRow,
  formValues: Readonly<Record<string, unknown>>,
  locale: LocaleTag,
  text: string,
): LocalizedString => {
  const others = locales.reduce<LocalizedString>((held, other) => {
    const name = translationFieldName(row.path, other);
    return other === locale || !Object.hasOwn(formValues, name)
      ? held
      : withCellText(row, held, other, readCellValue(formValues[name]).text);
  }, row.value);
  return withCellText(row, others, locale, text);
};

/**
 * Why `value`, as the row's translations with its cell in `locale` as the
 * table holds it, cannot show its values: by the protocol's own check,
 * against the stage's conditions and what the text's place can show, in the
 * protocol as the table holds it.
 */
const dynamicValueProblem = (
  protocol: CurrentProtocol,
  row: TranslationRow,
  locale: LocaleTag,
  value: LocalizedString,
): string | undefined => {
  if (row.dynamicValues === undefined) return undefined;
  const at = pathKey([...row.path, locale]);
  const hits = [
    { path: [...row.path], value, dynamicValues: row.dynamicValues },
  ];
  // A node type's own label is checked against its codebook entry; any
  // other text against its stage.
  const problems =
    row.dynamicValues === 'nodeLabel'
      ? findNodeLabelProblems({ codebook: protocol.codebook }, hits)
      : findDynamicValueProblems(
          {
            codebook: protocol.codebook,
            stages: protocol.stages,
          },
          hits,
        );
  return problems.find((problem) => pathKey(problem.path) === at)?.message;
};

/**
 * What the text of a form says when it would leave out, in every language, a
 * field that the form's text places now: the translation table translates the
 * text, and a field is taken out of a form in the stage editor. Undefined for
 * any other text, and for a form's text that leaves no field out.
 */
const fieldsLeftOutOf = (
  protocol: CurrentProtocol,
  row: TranslationRow,
  value: LocalizedString,
) => {
  if (row.place.kind !== 'formContent') return undefined;
  const fields = formFieldsAt(protocol, row.place.form);
  const leftOut = fieldsLeftOut(fields, row.value, value);
  if (leftOut.length === 0) return undefined;
  const variables = formVariables(protocol, fields);
  return ({ intl }: Words) =>
    intl.formatMessage(messages.fieldLeftOut, {
      count: leftOut.length,
      attributes: intl.formatList(
        leftOut.map(
          ({ variable }) => `“${variables[variable]?.name ?? variable}”`,
        ),
        { type: 'conjunction' },
      ),
    });
};

/**
 * What the last refused save found wrong with cells, by field, and the text
 * each held then. A cell keeps saying so until its text changes or Save is
 * pressed again: the checks a cell makes on its own cannot see everything a
 * whole protocol is checked for.
 */
const saveFindings = new WeakMap<
  FormStoreApi,
  ReadonlyMap<string, Readonly<{ text: string; message: string }>>
>();

/** Keeps what a refused save found, for each cell's check to say again. */
export const holdSaveFindings = (
  formStore: FormStoreApi,
  findings: ReadonlyMap<string, Readonly<{ text: string; message: string }>>,
) => {
  saveFindings.set(formStore, findings);
};

/** Forgets what the last refused save found, before the next is checked. */
export const clearSaveFindings = (formStore: FormStoreApi) => {
  saveFindings.delete(formStore);
};

/**
 * The rules a cell's translation is held to before it can be saved, the ones
 * the protocol and its editors hold the text to: the declaration of the
 * text's field, the values a text can show, that a text cannot lose its last
 * translation, and the rules the field shares with its neighbours
 * (`findFieldTextProblems`). Each is judged against the protocol as the
 * table holds it (`protocolInTable`), saved or not.
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
        const row = findRow(state, path);
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
        const { text } = readCellValue(value);
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
              declaredRuleMessage(issue, intl) ??
                (row.arguments === undefined
                  ? undefined
                  : localizedMessageProblemText(
                      { [locale]: text },
                      row.arguments,
                      intl,
                    )) ??
                describeUnusableText(intl, issue.message),
            );
            return;
          }
          // Checked against the conditions and dynamic attributes as the
          // table holds them, so a dynamic attribute created in a cell is
          // known to the text that shows it.
          const problem = dynamicValueProblem(
            protocolInTable(state, formValues) ?? protocol,
            row,
            locale,
            rowValue,
          );
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
        // An emptied text of a form places no field, so a field that only
        // it placed is left out of every language.
        const leftOut = fieldsLeftOutOf(protocol, row, rowValue);
        if (leftOut !== undefined) {
          fail(leftOut(words));
          return;
        }

        const fieldProblem = fieldProblemsInTable(state, formValues).find(
          (problem) => problem.locale === locale && isEqual(problem.path, path),
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
export const registerTranslationCell = (
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
    initialValue: cellValue(storedTranslation(row, locale)),
    validation: cellValidation(formStore, row.path, locale, getState, getWords),
  });
  return true;
};

const useTableForm = () => {
  const formStore = useContext(FormStoreContext);
  if (formStore === undefined) {
    throw new Error('A translation cell needs the translation table’s form.');
  }
  return formStore;
};

/**
 * The words a field's check reports in, read when it runs, so a check made
 * after a change of language reports in the new one.
 */
const useWords = () => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const words = useRef<Words>({ intl, languageName });
  useLayoutEffect(() => {
    words.current = { intl, languageName };
  });
  return words;
};

/**
 * Checks again every cell already left: whether a check already made still
 * holds can turn on another cell, as a row whose last translation was
 * cleared is fine once another is written, and what a text can show turns on
 * the logic. The form's own check runs only the field that changed.
 */
const recheckLeftCells = (formStore: FormStoreApi, except?: string) => {
  const state = formStore.getState();
  for (const [fieldName, fieldState] of state.fields) {
    if (fieldName !== except && fieldState.meta.isBlurred) {
      void state.validateField(fieldName);
    }
  }
};

/**
 * One cell, held in the translation table's form until the table is saved:
 * the translation it shows, whether it differs from what the protocol has
 * (its translation, or the logic its editor changed), and why it cannot be
 * saved, once the researcher has left the cell.
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
  const formStore = useTableForm();
  const words = useWords();
  const appStore = useAppStore();
  const name = translationFieldName(row.path, locale);
  const field = useFormStore((state) => state.getFieldState(name));
  // Only the first reason is shown, and a string compares by value.
  const firstError = useFormStore((state) => state.getFieldErrors(name)?.[0]);

  const stored = storedTranslation(row, locale);
  const text = field === undefined ? stored : readCellValue(field.value).text;
  const changed =
    field !== undefined && !isEqual(field.value, field.initialValue);
  const error =
    field?.meta.isBlurred === true && !field.meta.isValidating
      ? firstError
      : undefined;

  const registerCell = (cellLocale: LocaleTag) =>
    registerTranslationCell(
      formStore,
      row,
      cellLocale,
      () => appStore.getState(),
      () => words.current,
    );

  // Registering a field drops the checks under way, so the cells already
  // left are checked again.
  const register = () => {
    if (registerCell(locale)) recheckLeftCells(formStore, name);
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

  /** Writes `next` as the cell's text, keeping the logic it changed. */
  const writeText = (next: string) => {
    const state = formStore.getState();
    const held = readCellValue(state.getFieldState(name)?.value);
    state.setFieldValue(name, cellValue(next, held.logic));
  };

  const change = (next: string) => {
    register();
    registerOtherTranslations();
    const state = formStore.getState();
    writeText(next);
    if (state.getFieldState(name)?.meta.isBlurred)
      void state.validateField(name);
    recheckLeftCells(formStore, name);
  };

  /**
   * The researcher has left the cell: its text is checked from now on. A cell
   * left empty holds none of their wording, so one of a text Network Canvas
   * words goes back to Network Canvas's wording, which is what participants
   * would read.
   */
  const leave = () => {
    const state = formStore.getState();
    if (!state.fields.has(name)) return;
    const suppliedText = suppliedCellText(row, locale);
    if (
      suppliedText !== undefined &&
      isBlankTranslation(
        row,
        readCellValue(state.getFieldState(name)?.value).text,
      )
    ) {
      writeText(suppliedText);
    }
    state.setFieldBlurred(name);
    void state.validateField(name);
    const left = state.getFieldState(name);
    if (left !== undefined && !isEqual(left.value, left.initialValue)) {
      checkOtherTranslations();
    }
    recheckLeftCells(formStore, name);
  };

  /** Puts back what the protocol has: the text, and the logic it changed. */
  const revert = () => {
    const state = formStore.getState();
    if (!state.fields.has(name)) return;
    state.resetField(name);
    recheckLeftCells(formStore);
  };

  return { name, text, changed, error, change, leave, revert };
};

/**
 * Whether the text of `row` is used in `locale`, as the table holds the
 * protocol (`protocolInTable`): whether the protocol's rule for where a
 * localized string is needed (`expectedLocalesOf`) expects it there. So the
 * question of a field is used where the form in that language, or the form
 * that the language falls back to, places the field, and a version of a
 * dynamic attribute where its owner's text shows the dynamic attribute.
 */
export const useUsedInTable = (row: TranslationRow, locale: LocaleTag) => {
  const appStore = useAppStore();
  // Read again when the protocol changes.
  useAppSelector(getProtocol);
  return useFormStore((form) => {
    const protocol = protocolInTable(appStore.getState(), form.getFormValues());
    return protocol === null
      ? row.expectedLocales.includes(locale)
      : expectedLocalesOf(row.path, protocol).includes(locale);
  });
};

/**
 * What the protocol as the table holds it (`protocolInTable`) has at
 * `path`. Unchanged parts of the protocol keep their identity, so it changes
 * only when a cell changes what is there.
 */
export const useInTableAt = (path: readonly (string | number)[]): unknown => {
  const appStore = useAppStore();
  useAppSelector(getProtocol);
  return useFormStore((form) =>
    valueAtPath(
      protocolInTable(appStore.getState(), form.getFormValues()),
      path,
    ),
  );
};

/** The conditions or dynamic attributes of one owner, and how to write them. */
type DefinitionsInTable = Readonly<{
  values: Readonly<Record<string, unknown>>;
  /** Undefined where they are only read. */
  set?: (next: Readonly<Record<string, unknown>>) => void;
}>;

const NO_VALUES: readonly (FieldValue | undefined)[] = [];

/**
 * The values of the fields named `names`, kept as the same array while each
 * field holds the same value.
 */
const useFieldValues = (
  names: readonly string[],
): readonly (FieldValue | undefined)[] => {
  const last = useRef(NO_VALUES);
  return useFormStore((state) => {
    const next = names.map((name) =>
      state.fields.has(name) ? state.getFieldState(name)?.value : undefined,
    );
    const previous = last.current;
    if (
      previous.length === next.length &&
      next.every((value, index) => value === previous[index])
    ) {
      return previous;
    }
    last.current = next;
    return next;
  });
};

/**
 * The conditions and dynamic attributes of the owner of a cell's text, as
 * the table holds them (`definitionsInTable`), and how its cell writes them:
 * as the stage editor writes a stage's, so a cell's logic block can test new
 * rules and its text can show a new dynamic attribute. A change is kept with
 * the cell that made it (see `logicEdits`) until the table is saved, which
 * writes it with the text that uses it, and Cancel discards it.
 *
 * A saved version's wording is a row of its own, so a change to it is
 * written to that row's cell, which shows it. Undefined without an owner.
 */
export const useDefinitionsInTable = (
  owner: TextOwnerPath | undefined,
  /**
   * The cell whose editor writes them, which keeps the change. Undefined
   * where they are only read.
   */
  cell?: Readonly<{ path: TextPath; locale: LocaleTag }>,
):
  | Readonly<{
      conditions: DefinitionsInTable;
      dynamicAttributes: DefinitionsInTable;
    }>
  | undefined => {
  const formStore = useTableForm();
  const words = useWords();
  const appStore = useAppStore();
  const protocol = useAppSelector(getProtocol);
  const groups = useAppSelector(getTranslationGroups);
  const stableOwner = useStablePath(owner);
  const cellPath = useStablePath(cell?.path);
  const cellLocale = cell?.locale;
  const names = useMemo(() => {
    if (stableOwner === undefined || protocol === null) return [];
    const paths = ownerTextPaths(
      groups.flatMap((group) => group.rows),
      stableOwner,
    );
    return paths.flatMap((path) =>
      protocol.localization.locales.map((locale) =>
        translationFieldName(path, locale),
      ),
    );
  }, [groups, protocol, stableOwner]);
  const held = useFieldValues(names);

  const write = useCallback(
    (key: TextDefinitionKey, next: Readonly<Record<string, unknown>>) => {
      if (cellPath === undefined || cellLocale === undefined) return;
      const appState = appStore.getState();
      const register = (path: TextPath, locale: LocaleTag) => {
        const row = findRow(appState, path);
        if (row === undefined) return false;
        registerTranslationCell(
          formStore,
          row,
          locale,
          () => appStore.getState(),
          () => words.current,
        );
        return true;
      };
      const { logic, wordings } = logicWrite(
        appState,
        formStore.getState().getFormValues(),
        { path: cellPath, locale: cellLocale },
        key,
        next,
      );
      /**
       * Gives the cell at `path` in `locale` what `change` makes of what it
       * holds, registering it first.
       */
      const writeCell = (
        path: TextPath,
        locale: LocaleTag,
        change: (was: CellValue) => CellValue,
      ) => {
        if (!register(path, locale)) return;
        const name = translationFieldName(path, locale);
        const state = formStore.getState();
        state.setFieldValue(
          name,
          change(readCellValue(state.getFieldState(name)?.value)),
        );
      };
      for (const wording of wordings) {
        writeCell(wording.path, wording.locale, (was) =>
          cellValue(wording.text, was.logic),
        );
      }
      writeCell(cellPath, cellLocale, (was) => cellValue(was.text, logic));
      recheckLeftCells(formStore);
    },
    [appStore, cellLocale, cellPath, formStore, words],
  );

  return useMemo(() => {
    if (stableOwner === undefined) return undefined;
    const values = Object.fromEntries(
      names.flatMap((name, index) => {
        const value = held[index];
        return value === undefined ? [] : [[name, value]];
      }),
    );
    const appState = appStore.getState();
    const writable = cellPath !== undefined;
    return {
      conditions: {
        values: definitionsInTable(appState, values, stableOwner, 'conditions'),
        ...(writable && {
          set: (next: Readonly<Record<string, unknown>>) =>
            write('conditions', next),
        }),
      },
      dynamicAttributes: {
        values: definitionsInTable(
          appState,
          values,
          stableOwner,
          'dynamicAttributes',
        ),
        ...(writable && {
          set: (next: Readonly<Record<string, unknown>>) =>
            write('dynamicAttributes', next),
        }),
      },
    };
    // `names` follows the protocol, which the stored definitions are read
    // from.
  }, [appStore, cellPath, held, names, stableOwner, write]);
};
