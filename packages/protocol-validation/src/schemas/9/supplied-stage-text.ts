import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { heldTranslations, type LocalizedString } from './localized-string.ts';
import { BIN_SUPPLIED_TEXT } from './stage-wording/bins.ts';
import { FAMILY_PEDIGREE_SUPPLIED_TEXT } from './stage-wording/family-pedigree.ts';
import { FINISH_SESSION_SUPPLIED_TEXT } from './stage-wording/finish-session.ts';
import { GEOSPATIAL_SUPPLIED_TEXT } from './stage-wording/geospatial.ts';
import { LANGUAGE_CHOOSER_SUPPLIED_TEXT } from './stage-wording/language-chooser.ts';
import { NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT } from './stage-wording/name-generator-quick-add.ts';
import { NAME_GENERATOR_ROSTER_SUPPLIED_TEXT } from './stage-wording/name-generator-roster.ts';
import { NAME_GENERATOR_SUPPLIED_TEXT } from './stage-wording/name-generator.ts';
import { NARRATIVE_PEDIGREE_SUPPLIED_TEXT } from './stage-wording/narrative-pedigree.ts';
import { NARRATIVE_SUPPLIED_TEXT } from './stage-wording/narrative.ts';
import type { SuppliedStageSetting } from './supplied-stage-setting.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The stage settings whose wording Network Canvas supplies, by stage type.
 * A stage may hold any of it, or none: for each text it does not hold in a
 * language, the interview shows Network Canvas's own wording where Network
 * Canvas has it in that language (`stageWordingShown`). Architect writes the
 * text into a stage when it is made, then edits and translates it like any
 * protocol text, and fills it into a language added later wherever that
 * language has no translation of it.
 */
const SUPPLIED_STAGE_TEXT: Readonly<
  Record<string, readonly SuppliedStageSetting[]>
> = {
  CategoricalBin: BIN_SUPPLIED_TEXT,
  FamilyPedigree: FAMILY_PEDIGREE_SUPPLIED_TEXT,
  FinishSession: FINISH_SESSION_SUPPLIED_TEXT,
  Geospatial: GEOSPATIAL_SUPPLIED_TEXT,
  LanguageChooser: LANGUAGE_CHOOSER_SUPPLIED_TEXT,
  NameGenerator: NAME_GENERATOR_SUPPLIED_TEXT,
  NameGeneratorQuickAdd: NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT,
  NameGeneratorRoster: NAME_GENERATOR_ROSTER_SUPPLIED_TEXT,
  Narrative: NARRATIVE_SUPPLIED_TEXT,
  NarrativePedigree: NARRATIVE_PEDIGREE_SUPPLIED_TEXT,
  OrdinalBin: BIN_SUPPLIED_TEXT,
};

const settingsOf = (stageType: string): readonly SuppliedStageSetting[] =>
  SUPPLIED_STAGE_TEXT[stageType] ?? [];

/**
 * Where in a stage of `stageType` each setting whose wording Network Canvas
 * supplies sits.
 */
export const suppliedStageSettingPaths = (
  stageType: string,
): readonly (readonly string[])[] =>
  settingsOf(stageType).map(({ path }) => path);

/**
 * The message Network Canvas writes for a setting in a protocol language:
 * its wording in exactly that language, and none in any other. That is the
 * rule for all its wording (the interface text and the Family Pedigree's
 * option labels too). A setting the stage shows with no text in the default
 * language, counting Network Canvas's wording, must be written there before
 * the protocol leaves its editor (`findBuiltInWordingProblems`).
 */
const writtenIn = (
  setting: SuppliedStageSetting,
  locale: LocaleTag,
): string | undefined => suppliedTextFor(setting.message, locale);

const valueAt = (value: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      typeof current === 'object' && current !== null
        ? Reflect.get(current, key)
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
      const text = writtenIn(setting, locale);
      if (text !== undefined) value[locale] = text;
    }
    return { path: setting.path, value };
  });

/**
 * Every supplied setting a stage holds, as it reads after a change to the
 * protocol's languages (see `suppliedTextAfterLanguageChange`): a language
 * the protocol did not have gains Network Canvas's wording for each setting
 * with no translation in it, whether or not the researcher has reworded the
 * setting, and Network Canvas's wording for a corrected language becomes its
 * wording for the language as corrected. A setting the stage does not hold
 * is left out.
 */
export const suppliedStageTextAfterLanguageChange = (
  stage: Readonly<{ type: string }>,
  change: LanguageChange,
): readonly SuppliedStageText[] =>
  settingsOf(stage.type).flatMap((setting) => {
    const current = valueAt(stage, setting.path);
    if (typeof current !== 'object' || current === null) return [];
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a supplied setting's path holds a language-to-text map in a stage; its translations are kept as they are, except one that equals the supplied wording below
    const held = current as LocalizedString;
    return [
      {
        path: setting.path,
        value: suppliedTextAfterLanguageChange(
          held,
          (locale) => writtenIn(setting, locale),
          change,
        ),
      },
    ];
  });

/** One supplied setting as the interview shows it for a stage. */
export type ShownStageText = Readonly<{
  path: readonly string[];
  value: LocalizedString;
  shown: boolean;
}>;

/**
 * Every supplied setting of the stage's type, in table order, with the text
 * the interview shows for it and whether it shows it. The text is Network
 * Canvas's wording in every protocol language it writes one in (what
 * `suppliedStageText` builds), with the translations the stage holds at the
 * setting's path laid over it per language: a language the stage holds
 * wins, a language it does not hold gets Network Canvas's wording, and a
 * language Network Canvas has no wording in gets only what the stage holds.
 * The interview shows the setting when the object it lives in (`within`), if
 * it has one, exists on the stage, its `when`, if it has one, holds, and, for
 * an optional setting, the stage holds a value at its path.
 */
export const stageWordingShown = (
  stage: Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
  localization: LocalizationDeclaration,
): readonly ShownStageText[] => {
  const settings = settingsOf(stage.type);
  return suppliedStageText(stage.type, localization).map(
    ({ path, value }, index) => {
      const setting = settings[index];
      const shown =
        setting !== undefined &&
        (setting.within === undefined ||
          valueAt(stage, setting.within) !== undefined) &&
        (setting.when === undefined || setting.when(stage)) &&
        (setting.optional !== true || valueAt(stage, path) !== undefined);
      return {
        path,
        value: { ...value, ...heldTranslations(valueAt(stage, path)) },
        shown,
      };
    },
  );
};

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
 * The paths of the settings `stage` holds but no longer shows: each one shown
 * only under a configuration (its `when`) that is off. A stage editor seeds
 * such a setting when its configuration is turned on, so it drops it when the
 * configuration is turned off, and a protocol never asks to translate words
 * its participants cannot see.
 */
export const inapplicableStageSettings = (
  stage: Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
): readonly (readonly string[])[] =>
  settingsOf(stage.type)
    .filter(
      (setting) =>
        setting.when !== undefined &&
        !setting.when(stage) &&
        valueAt(stage, setting.path) !== undefined,
    )
    .map((setting) => setting.path);

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Whether the stage's setting at `path` applies to the stage as it is
 * configured: true for a setting shown whatever the configuration, else what
 * its `when` says. A stage editor shows a wording field only when this holds.
 * A path that is not a supplied setting of the stage's type does not apply.
 */
export const suppliedStageSettingApplies = (
  stage: Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
  path: readonly string[],
): boolean => {
  const setting = settingsOf(stage.type).find((candidate) =>
    samePath(candidate.path, path),
  );
  if (setting === undefined) return false;
  return setting.when === undefined || setting.when(stage);
};
