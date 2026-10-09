import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import {
  CHILDREN_ITEM,
  CHILDREN_NONE,
  CHILDREN_QUESTION,
  DETAILS_ITEM,
  NAME_HINT,
  NAME_PROMPT,
  PARENTS_ITEM,
  RECOMMENDED_NOTE,
  SIBLINGS_ITEM,
  SIBLINGS_NONE,
  SIBLINGS_QUESTION,
} from './family-pedigree-wording.ts';
import type { LocalizedString } from './localized-string.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The heading above the people a Name Generator Roster offers, in each
 * language Network Canvas's apps ship in.
 */
const ROSTER_PANEL_TITLE = {
  'en': 'Available to add',
  'de': 'Zum Hinzufügen verfügbar',
  'es': 'Disponibles para añadir',
  'fr': 'Éléments disponibles',
  'it': 'Disponibili da aggiungere',
  'nl': 'Beschikbaar om toe te voegen',
  'pt-BR': 'Disponíveis para adicionar',
  'zh-Hans': '可添加',
  'zh-Hant': '可新增的項目',
} as const satisfies Readonly<Record<LocaleTag, string>>;

/** One stage setting whose wording Network Canvas supplies. */
type SuppliedStageSetting = Readonly<{
  /** Where the stage holds the setting. */
  path: readonly string[];
  /** The supplied wording, by language, as ICU messages the stage can hold. */
  message: Readonly<Record<LocaleTag, string>>;
  /**
   * An optional object the setting belongs to: it is written only into a
   * stage that has it, and arrives with it (the Family Pedigree's
   * completeness texts arrive with `completeness`).
   */
  within?: readonly string[];
  /**
   * A setting the researcher may remove. It is written with the object that
   * holds it, never into one that already exists without it.
   */
  optional?: true;
}>;

const pedigreeCompleteness = (
  path: readonly string[],
  message: Readonly<Record<LocaleTag, string>>,
): SuppliedStageSetting => ({
  path: ['completeness', ...path],
  message,
  within: ['completeness'],
});

/**
 * The stage settings whose wording Network Canvas supplies, by stage type.
 * Nothing reads these at interview time: the text is written into a stage
 * when it is made, then edited and translated like any protocol text, and
 * Architect fills it into a language added later while the researcher has
 * not changed it in the default language.
 */
const SUPPLIED_STAGE_TEXT: Readonly<
  Record<string, readonly SuppliedStageSetting[]>
> = {
  NameGeneratorRoster: [{ path: ['panelTitle'], message: ROSTER_PANEL_TITLE }],
  FamilyPedigree: [
    {
      path: ['nodeConfiguration', 'nameField', 'prompt'],
      message: NAME_PROMPT,
    },
    {
      path: ['nodeConfiguration', 'nameField', 'hint'],
      message: NAME_HINT,
      optional: true,
    },
    pedigreeCompleteness(['itemText', 'parents', 'listItem'], PARENTS_ITEM),
    pedigreeCompleteness(['itemText', 'siblings', 'listItem'], SIBLINGS_ITEM),
    pedigreeCompleteness(['itemText', 'siblings', 'noneButton'], SIBLINGS_NONE),
    pedigreeCompleteness(
      ['itemText', 'siblings', 'question'],
      SIBLINGS_QUESTION,
    ),
    pedigreeCompleteness(['itemText', 'children', 'listItem'], CHILDREN_ITEM),
    pedigreeCompleteness(['itemText', 'children', 'noneButton'], CHILDREN_NONE),
    pedigreeCompleteness(
      ['itemText', 'children', 'question'],
      CHILDREN_QUESTION,
    ),
    pedigreeCompleteness(['itemText', 'details', 'listItem'], DETAILS_ITEM),
    pedigreeCompleteness(['recommendedNote'], RECOMMENDED_NOTE),
  ],
};

const settingsOf = (stageType: string): readonly SuppliedStageSetting[] =>
  SUPPLIED_STAGE_TEXT[stageType] ?? [];

/**
 * The message Network Canvas writes for a setting in a protocol language:
 * its supplied wording there, or, in the default language when it supplies
 * none, the English wording, because every supplied setting is required (or,
 * for an optional one, wanted) and a stage must hold it in some language.
 * That is the rule for the Family Pedigree's option labels too
 * (`writtenOptionLabel`), and what the schema 8 to 9 migration has always
 * recorded.
 */
const writtenIn = (
  setting: SuppliedStageSetting,
  locale: LocaleTag,
  isDefault: boolean,
): string | undefined =>
  suppliedTextFor(setting.message, locale) ??
  (isDefault ? setting.message.en : undefined);

const valueAt = (value: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      typeof current === 'object' && current !== null
        ? (current as Readonly<Record<string, unknown>>)[key]
        : undefined,
    value,
  );

/** One supplied setting as a stage should hold it. */
export type SuppliedStageText = Readonly<{
  path: readonly string[];
  value: LocalizedString;
}>;

/**
 * Every supplied setting of `stageType`, each holding Network Canvas's text
 * in every protocol language it writes one in (see `writtenIn`): what an
 * editor seeds a setting with when the object holding it is created.
 */
export const suppliedStageText = (
  stageType: string,
  localization: LocalizationDeclaration,
): readonly SuppliedStageText[] =>
  settingsOf(stageType).map((setting) => {
    const value: Record<LocaleTag, string> = {};
    for (const locale of localization.locales) {
      const text = writtenIn(
        setting,
        locale,
        locale === localization.defaultLocale,
      );
      if (text !== undefined) value[locale] = text;
    }
    return { path: setting.path, value };
  });

/**
 * A stage's supplied settings as Network Canvas writes them after a change to
 * the protocol's languages (see `suppliedTextAfterLanguageChange`): each one
 * whose text in the default language before the change is still Network
 * Canvas's text there. A setting the researcher has reworded is theirs, and
 * is left out.
 */
export const suppliedStageTextAfterLanguageChange = (
  stage: Readonly<{ type: string }>,
  change: LanguageChange,
): readonly SuppliedStageText[] =>
  settingsOf(stage.type).flatMap((setting) => {
    const current = valueAt(stage, setting.path);
    if (typeof current !== 'object' || current === null) return [];
    const { defaultLocale } = change.before;
    const text = (current as LocalizedString)[defaultLocale];
    if (text === undefined || text !== writtenIn(setting, defaultLocale, true))
      return [];
    return [
      {
        path: setting.path,
        value: suppliedTextAfterLanguageChange(
          current as LocalizedString,
          (locale, isDefault) => writtenIn(setting, locale, isDefault),
          change,
        ),
      },
    ];
  });

/**
 * The supplied settings `stage` should gain, as a new stage starts with them
 * and the schema 8 to 9 migration adds them: each one it lacks, except one
 * whose optional object it lacks (that arrives with the object) and an
 * optional one whose object it already has (the researcher removed it).
 */
export const missingSuppliedStageText = (
  stage: Readonly<{ type: string }>,
  localization: LocalizationDeclaration,
): readonly SuppliedStageText[] => {
  const settings = settingsOf(stage.type);
  const supplied = suppliedStageText(stage.type, localization);
  return supplied.filter((_text, index) => {
    const setting = settings[index];
    if (setting === undefined) return false;
    if (valueAt(stage, setting.path) !== undefined) return false;
    if (
      setting.within !== undefined &&
      valueAt(stage, setting.within) === undefined
    )
      return false;
    return !(
      setting.optional === true &&
      valueAt(stage, setting.path.slice(0, -1)) !== undefined
    );
  });
};
