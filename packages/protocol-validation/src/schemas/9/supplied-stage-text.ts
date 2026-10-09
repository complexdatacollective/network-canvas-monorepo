import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';
import { FAMILY_PEDIGREE_SUPPLIED_TEXT } from './stage-wording/family-pedigree.ts';
import { FINISH_SESSION_SUPPLIED_TEXT } from './stage-wording/finish-session.ts';
import { GEOSPATIAL_SUPPLIED_TEXT } from './stage-wording/geospatial.ts';
import { NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT } from './stage-wording/name-generator-quick-add.ts';
import { NAME_GENERATOR_ROSTER_SUPPLIED_TEXT } from './stage-wording/name-generator-roster.ts';
import { NAME_GENERATOR_SUPPLIED_TEXT } from './stage-wording/name-generator.ts';
import { NARRATIVE_PEDIGREE_SUPPLIED_TEXT } from './stage-wording/narrative-pedigree.ts';
import { NARRATIVE_SUPPLIED_TEXT } from './stage-wording/narrative.ts';
import { NETWORK_COMPOSER_SUPPLIED_TEXT } from './stage-wording/network-composer.ts';
import { SOCIOGRAM_SUPPLIED_TEXT } from './stage-wording/sociogram.ts';
import type { SuppliedStageSetting } from './supplied-stage-setting.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

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
  FamilyPedigree: FAMILY_PEDIGREE_SUPPLIED_TEXT,
  FinishSession: FINISH_SESSION_SUPPLIED_TEXT,
  Geospatial: GEOSPATIAL_SUPPLIED_TEXT,
  NameGenerator: NAME_GENERATOR_SUPPLIED_TEXT,
  NameGeneratorQuickAdd: NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT,
  NameGeneratorRoster: NAME_GENERATOR_ROSTER_SUPPLIED_TEXT,
  Narrative: NARRATIVE_SUPPLIED_TEXT,
  NarrativePedigree: NARRATIVE_PEDIGREE_SUPPLIED_TEXT,
  NetworkComposer: NETWORK_COMPOSER_SUPPLIED_TEXT,
  Sociogram: SOCIOGRAM_SUPPLIED_TEXT,
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
    if (
      setting.when !== undefined &&
      !setting.when(stage as Readonly<Record<string, unknown>>)
    )
      return false;
    return !(
      setting.optional === true &&
      valueAt(stage, setting.path.slice(0, -1)) !== undefined
    );
  });
};

/**
 * The paths of the settings `stage` must hold but does not: each one shown
 * only under a configuration (its `when`) that is on. The interview shows
 * such a setting in place of its built-in wording, so a stage without it
 * would show nothing where the participant expects words.
 */
export const missingRequiredStageSettings = (
  stage: Readonly<{ type: string }>,
): readonly (readonly string[])[] =>
  settingsOf(stage.type)
    .filter(
      (setting) =>
        setting.when !== undefined &&
        setting.when(stage) &&
        valueAt(stage, setting.path) === undefined,
    )
    .map((setting) => setting.path);
