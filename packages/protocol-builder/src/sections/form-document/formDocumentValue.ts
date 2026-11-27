import {
  fieldIdsInDocument,
  isBlankMessage,
  type LocaleTag,
  type LocalizedString,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import type { FieldText } from '../../localization/messageDocument.ts';

/**
 * One of a form's fields (`form.fields`) as the form editor reads and writes
 * it, a lenient reading of protocol-validation's `FormField`: the attribute it collects, whether it shows validation hints, and its
 * question and hint in each language whose document places it.
 */
export type FormFieldDraft = Readonly<{
  id: string;
  variable: string;
  prompt?: LocalizedString;
  hint?: LocalizedString;
  showValidationHints?: true;
}>;

const asTranslations = (value: unknown): LocalizedString | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

/**
 * The form's fields as the stage holds them, read leniently: an entry that is
 * not a field with an id is left out, as the editor can neither show nor
 * write it.
 */
export const formFieldDraftsOf = (value: unknown): FormFieldDraft[] =>
  Array.isArray(value)
    ? value.flatMap((entry): FormFieldDraft[] => {
        if (!isRecord(entry) || typeof entry.id !== 'string') return [];
        const prompt = asTranslations(entry.prompt);
        const hint = asTranslations(entry.hint);
        return [
          {
            id: entry.id,
            variable: typeof entry.variable === 'string' ? entry.variable : '',
            ...(prompt !== undefined && { prompt }),
            ...(hint !== undefined && { hint }),
            ...(entry.showValidationHints === true && {
              showValidationHints: true,
            }),
          },
        ];
      })
    : [];

/**
 * What a field block shows when the document of `locale` opens: the field's
 * attribute and settings, and its question and hint in that language.
 */
export const fieldTextFor =
  (fields: readonly FormFieldDraft[], locale: string) =>
  (fieldId: string): FieldText | undefined => {
    const entry = fields.find((field) => field.id === fieldId);
    if (entry === undefined) return undefined;
    const prompt = entry.prompt?.[locale];
    const hint = entry.hint?.[locale];
    return {
      variable: entry.variable,
      showValidationHints: entry.showValidationHints === true,
      ...(prompt !== undefined && prompt !== '' && { prompt }),
      ...(hint !== undefined && hint !== '' && { hint }),
    };
  };

/** `translations` with `locale` set to `message`, or removed when blank. */
const withTranslation = (
  translations: LocalizedString | undefined,
  locale: string,
  message: string | undefined,
): LocalizedString | undefined => {
  const { [locale]: _previous, ...others } = translations ?? {};
  const next =
    message === undefined || isBlankMessage(message)
      ? others
      : { ...others, [locale]: message };
  return Object.keys(next).length === 0 ? undefined : next;
};

/** `entry` with `key` set to `translations`, or without it when there are none. */
const withText = (
  entry: FormFieldDraft,
  key: 'prompt' | 'hint',
  translations: LocalizedString | undefined,
): FormFieldDraft => {
  const { [key]: _previous, ...rest } = entry;
  return translations === undefined ? rest : { ...rest, [key]: translations };
};

/**
 * The form's fields after the document of `locale` has been written, with the
 * field blocks it now holds (`fieldTexts`, as `documentToMessage` collects
 * them).
 *
 * Every block writes its field: the attribute, whether it shows validation
 * hints (shared by every language, as the field is), and its question and
 * hint in `locale`. Every other field is kept as it is, with its question
 * and hint in every language, so that a field which comes back (Undo, a
 * paste, the attribute chosen again) comes back whole; a save leaves out
 * what the form no longer uses (`withoutUnusedTextDefinitions` in
 * `@codaco/protocol-validation`). Fields keep
 * their place in the list; new ones are added at the end, in the order
 * of the document.
 */
export const fieldsAfterEdit = (
  fields: readonly FormFieldDraft[],
  locale: string,
  fieldTexts: ReadonlyMap<string, FieldText>,
): FormFieldDraft[] => {
  const written = (entry: FormFieldDraft, text: FieldText): FormFieldDraft => {
    const { showValidationHints: _hints, ...rest } = withText(
      withText(
        { ...entry, variable: text.variable },
        'prompt',
        withTranslation(entry.prompt, locale, text.prompt),
      ),
      'hint',
      withTranslation(entry.hint, locale, text.hint),
    );
    return text.showValidationHints
      ? { ...rest, showValidationHints: true }
      : rest;
  };
  const kept = fields.map((entry) => {
    const text = fieldTexts.get(entry.id);
    return text === undefined ? entry : written(entry, text);
  });
  const known = new Set(fields.map((entry) => entry.id));
  const added = [...fieldTexts]
    .filter(([fieldId]) => !known.has(fieldId))
    .map(([fieldId, text]) => written({ id: fieldId, variable: '' }, text));
  return [...kept, ...added];
};

/**
 * The field of this form that already collects `variable`, in any language's
 * document: a field chosen again for its attribute is the same field, so it
 * keeps its id (and its question and hint in the other languages).
 */
export const fieldCollecting = (
  fields: readonly FormFieldDraft[],
  variable: string,
): FormFieldDraft | undefined =>
  variable === ''
    ? undefined
    : fields.find((field) => field.variable === variable);

/** What stops a field from being saved. */
export type FormFieldProblem =
  /** It has no attribute, or one that the codebook no longer has. */
  | 'attribute'
  /** Another field of the form collects the same attribute. */
  | 'taken'
  /** The stage collects the attribute through a control of its own. */
  | 'reserved'
  /** It has no question in a language whose own document places it. */
  | 'question';

/** A field that stops the form from being saved, in one language's document. */
export type FormFieldProblemAt = Readonly<{
  fieldId: string;
  /** The language whose document places the field. */
  locale: LocaleTag;
  problem: FormFieldProblem;
}>;

/** What `formFieldProblems` reads besides the form. */
export type FormFieldProblemRules = Readonly<{
  /** The language being edited, whose document is read first. */
  locale: LocaleTag;
  /** Attributes that the stage collects itself. */
  reserved: ReadonlySet<string>;
  /**
   * Whether the codebook has the attribute. Undefined while the codebook is
   * not known, when only a field without any attribute is refused.
   */
  hasAttribute?: (variableId: string) => boolean;
  /**
   * Fields that are still being put in (`FormDocumentField`): they are not
   * refused until they are finished, the researcher leaves the form, or the
   * stage is saved.
   */
  skipped?: ReadonlySet<string>;
}>;

/**
 * Every field that stops the form from being saved, once for each problem,
 * in the order that the documents place them (the one of `rules.locale`
 * first). A field placed by several languages' documents is named in the
 * first of them, except for a missing question, which is named in each
 * language that lacks it.
 */
export const formFieldProblems = (
  fields: readonly FormFieldDraft[],
  content: LocalizedString | undefined,
  rules: FormFieldProblemRules,
): FormFieldProblemAt[] => {
  const { locale, reserved, hasAttribute, skipped } = rules;
  const documents = Object.entries(content ?? {}).toSorted(([a], [b]) =>
    a === locale ? -1 : b === locale ? 1 : 0,
  );
  const byId = new Map(fields.map((field) => [field.id, field]));
  // Read by each written document: a problem is named in a document that
  // places the field. A language that falls back to another language's
  // document asks its questions too, and the translation table reports a
  // question that is missing there (`formFieldPlacement`).
  const placedBy = documents.map(
    ([language, message]) => [language, fieldIdsInDocument(message)] as const,
  );
  const placed = new Set(placedBy.flatMap(([, ids]) => ids));
  const collecting = new Map<string, number>();
  for (const { id, variable } of fields) {
    if (variable !== '' && placed.has(id)) {
      collecting.set(variable, (collecting.get(variable) ?? 0) + 1);
    }
  }
  const problems: FormFieldProblemAt[] = [];
  const named = new Set<string>();
  for (const [language, ids] of placedBy) {
    for (const fieldId of ids) {
      const field = byId.get(fieldId);
      if (field === undefined || skipped?.has(fieldId) === true) continue;
      const add = (problem: FormFieldProblem) => {
        const key = problem === 'question' ? `${problem}:${language}` : problem;
        if (named.has(`${fieldId}:${key}`)) return;
        named.add(`${fieldId}:${key}`);
        problems.push({ fieldId, locale: language, problem });
      };
      const { variable } = field;
      if (variable === '' || hasAttribute?.(variable) === false) {
        add('attribute');
      } else if ((collecting.get(variable) ?? 0) > 1) {
        add('taken');
      } else if (reserved.has(variable)) {
        add('reserved');
      }
      const prompt = field.prompt?.[language];
      if (prompt === undefined || isBlankMessage(prompt)) add('question');
    }
  }
  return problems;
};

/** The attributes that the fields placed by `message` collect, in order. */
export const variablesPlacedBy = (
  fields: readonly FormFieldDraft[],
  message: string | undefined,
): readonly string[] => {
  const byId = new Map(fields.map((field) => [field.id, field.variable]));
  return fieldIdsInDocument(message).flatMap((fieldId) => {
    const variable = byId.get(fieldId);
    return variable === undefined || variable === '' ? [] : [variable];
  });
};
