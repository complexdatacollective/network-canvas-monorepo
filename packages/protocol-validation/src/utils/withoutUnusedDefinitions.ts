// What a save leaves out of an owner of text (a stage, or a node type's own
// label): the form fields, dynamic attributes and conditions that nothing
// uses any more. Every place that saves an owner writes it through here: the
// stage editor, a node type's label in the codebook, the translation table,
// and removing a language.
//
// An owner's "text definitions" are its conditions and its dynamic
// attributes together: what its text can name besides attributes, declared
// beside the text. The term means these two and nothing else.

import { isRecord } from '@codaco/shared-consts';

import { dynamicValueNamesIn } from '../localization/dynamicValueMessages.ts';
import { formFieldPossiblePlacement } from '../localization/formFieldLocales.ts';
import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../localization/localeTag.ts';
import { logicReads } from '../localization/logic.ts';
import { localesThatMayBeShown } from '../localization/resolveLocalizedString.ts';
import { readDynamicAttributeLogic } from '../schemas/9/dynamic-attributes.ts';
import { dynamicValueNameFor } from '../schemas/9/dynamic-value-names.ts';
import { NodeLabelSchema } from '../schemas/9/node-label.ts';
import { stageSchema } from '../schemas/9/stages/index.ts';
import { collectLocalizedStringsFromSchema } from './collectLocalizedStrings.ts';
import { ownTextNames } from './ownTextNames.ts';

const CONDITIONS = 'conditions';
const DYNAMIC_ATTRIBUTES = 'dynamicAttributes';

type Owner = Readonly<Record<string, unknown>>;

const translationsOf = (value: unknown): Record<LocaleTag, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/**
 * The localized strings of `owner`, found as the protocol's check finds
 * them: by the schema of a stage, or of a node type's label. A stage is told
 * by its `type`; a label has none. Undefined when the owner has no text of
 * its own besides its dynamic attributes' wording, as a stage of a type
 * that the schema does not know: every stage has a name.
 */
const hitsOf = (owner: Owner) => {
  const hits = collectLocalizedStringsFromSchema(
    owner.type === undefined ? NodeLabelSchema : stageSchema,
    owner,
    'owner',
  );
  return hits.some(({ place }) => place.kind !== 'dynamicAttributeWording')
    ? hits
    : undefined;
};

/**
 * The languages of `translations` that a participant may be shown in a form
 * that may place the field in `placing`, whatever languages their browser
 * lists: each placing language's own translation, else each one that it may
 * fall back to (`localesThatMayBeShown`). A placing language that the
 * protocol does not declare, whose document the interview never shows,
 * keeps its own translation.
 */
const shownTranslations = (
  translations: Readonly<Record<LocaleTag, string>>,
  placing: ReadonlySet<LocaleTag>,
  localization: LocalizationDeclaration | undefined,
): Set<LocaleTag> => {
  const shown = new Set<LocaleTag>();
  for (const locale of placing) {
    if (localization?.locales.includes(locale) === true) {
      for (const translation of localesThatMayBeShown(
        translations,
        localization,
        locale,
      )) {
        shown.add(translation);
      }
    } else if (Object.hasOwn(translations, locale)) shown.add(locale);
  }
  return shown;
};

/**
 * `owner` without the fields of its form that no language's form may place
 * (`formFieldPossiblePlacement`), and without each translation of a field's
 * question and hint that no participant may be shown, whatever languages
 * their browser lists: a language without its own document or translation
 * may be shown any that it can fall back to, and each of those is kept. A
 * form that is not written as documents, such as a Network Composer's, is
 * left as it is.
 */
const withoutUnusedFormFields = <T extends Owner>(
  owner: T,
  localization: LocalizationDeclaration | undefined,
): T => {
  const { form } = owner;
  if (!isRecord(form) || !isRecord(form.content) || !Array.isArray(form.fields))
    return owner;
  const placement = formFieldPossiblePlacement(
    translationsOf(form.content),
    localization,
  );
  const placingLanguages = (fieldId: string) =>
    new Set(
      [...placement].flatMap(([locale, ids]) =>
        ids.has(fieldId) ? [locale] : [],
      ),
    );
  let changed = false;
  const fields = form.fields.flatMap((field: unknown): unknown[] => {
    if (!isRecord(field) || typeof field.id !== 'string') return [field];
    const placing = placingLanguages(field.id);
    if (placing.size === 0) {
      changed = true;
      return [];
    }
    const kept = { ...field };
    for (const key of ['prompt', 'hint'] as const) {
      const translations = field[key];
      if (!isRecord(translations)) continue;
      const shown = shownTranslations(
        translationsOf(translations),
        placing,
        localization,
      );
      const entries = Object.entries(translations).filter(
        ([locale, text]) => shown.has(locale) && typeof text === 'string',
      );
      if (entries.length === Object.keys(translations).length) continue;
      changed = true;
      if (entries.length === 0) delete kept[key];
      else kept[key] = Object.fromEntries(entries);
    }
    return [kept];
  });
  return changed ? { ...owner, form: { ...form, fields } } : owner;
};

/**
 * `owner` without the dynamic attributes that its own text does not name
 * (`ownTextNames`): the protocol refuses one that no text uses.
 */
const withoutUnusedDynamicAttributes = <T extends Owner>(owner: T): T => {
  const dynamicAttributes = owner[DYNAMIC_ATTRIBUTES];
  if (!isRecord(dynamicAttributes)) return owner;
  const hits = hitsOf(owner);
  if (hits === undefined) return owner;
  const names = ownTextNames(hits, []);
  const kept = Object.entries(dynamicAttributes).filter(([id]) =>
    names.has(dynamicValueNameFor({ kind: 'dynamicAttribute', id })),
  );
  if (kept.length === Object.keys(dynamicAttributes).length) return owner;
  const { [DYNAMIC_ATTRIBUTES]: _removed, ...rest } = owner;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `rest` is `owner` minus its dynamic attributes, so with them rebuilt it keeps T's shape
  return {
    ...rest,
    ...(kept.length > 0 && { [DYNAMIC_ATTRIBUTES]: Object.fromEntries(kept) }),
  } as T;
};

/**
 * Whether `owner` uses each of its conditions: one that its text names (its
 * dynamic attributes' wording included), or that a version of one of its
 * dynamic attributes tests.
 */
const conditionUseOf = (
  owner: Owner,
): ((conditionId: string) => boolean) | undefined => {
  const hits = hitsOf(owner);
  if (hits === undefined) return undefined;
  const names = new Set<string>();
  for (const hit of hits) {
    for (const message of Object.values(hit.value)) {
      for (const name of dynamicValueNamesIn(message)) names.add(name);
    }
  }
  const ids = new Set<string>();
  const dynamicAttributes = owner[DYNAMIC_ATTRIBUTES];
  if (isRecord(dynamicAttributes)) {
    // Read leniently: a dynamic attribute whose wording is still being
    // written keeps the conditions that it already tests.
    for (const dynamicAttribute of Object.values(dynamicAttributes)) {
      const logic = readDynamicAttributeLogic(dynamicAttribute);
      if (logic === undefined) continue;
      for (const conditionId of logicReads(logic).conditionIds) {
        ids.add(conditionId);
      }
    }
  }
  return (conditionId) =>
    ids.has(conditionId) ||
    names.has(dynamicValueNameFor({ kind: 'condition', conditionId }));
};

/** `owner` without the conditions that nothing in it uses. */
const withoutUnusedConditions = <T extends Owner>(owner: T): T => {
  const conditions = owner[CONDITIONS];
  if (!isRecord(conditions)) return owner;
  const used = conditionUseOf(owner);
  if (used === undefined) return owner;
  const kept = Object.entries(conditions).filter(([id]) => used(id));
  if (kept.length === Object.keys(conditions).length) return owner;
  const { [CONDITIONS]: _removed, ...rest } = owner;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `rest` is `owner` minus its conditions, so with them rebuilt it keeps T's shape
  return {
    ...rest,
    ...(kept.length > 0 && { [CONDITIONS]: Object.fromEntries(kept) }),
  } as T;
};

/**
 * An owner of text (a stage, or a node type's own label) as a save writes
 * it: without the form fields and the translations of their questions and
 * hints that its form does not use, then without the dynamic attributes that
 * its text no longer names, then without the conditions that nothing left
 * uses. The order is what makes one pass enough: a field's question may be
 * the last text to name a dynamic attribute, and a dynamic attribute may be
 * the last thing to test a condition.
 *
 * Until the save, an editor keeps all of them, so that Undo, Redo, and
 * cutting something and pasting it elsewhere bring it back whole. A
 * dynamic attribute counts as used by the names that the protocol's check
 * counts (`ownTextNames`), so a saved owner is never refused for one that
 * no text uses. An owner in which no text is found, such as a stage of a
 * type that the schema does not know, keeps its dynamic attributes and
 * conditions.
 */
export function withoutUnusedTextDefinitions<T extends Owner>(
  owner: T,
  localization: LocalizationDeclaration | undefined,
): T {
  return withoutUnusedConditions(
    withoutUnusedDynamicAttributes(
      withoutUnusedFormFields(owner, localization),
    ),
  );
}
