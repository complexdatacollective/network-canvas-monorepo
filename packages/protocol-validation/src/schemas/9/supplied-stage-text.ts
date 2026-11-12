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
import { suppliedTextFor } from './supplied-text.ts';

/**
 * The stage settings whose wording Network Canvas supplies, by stage type.
 * A stage may hold any of it, or none: for each text it does not hold in a
 * language, the interview shows Network Canvas's own wording where Network
 * Canvas has it in that language (`stageWordingShown`). A stage an editor
 * saves holds only the wording its author changed
 * (`stageWithoutSuppliedText`); the editor shows Network Canvas's wording for
 * the rest (`stageWithSuppliedText`).
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
 * Network Canvas's message for a setting in a protocol language: its wording
 * in exactly that language, and none in any other. That is the rule for all
 * its wording (the interface text and the Family Pedigree's option labels
 * too). A setting the stage shows with no text in the default language,
 * counting Network Canvas's wording, must be written there before the
 * protocol leaves its editor (`findBuiltInWordingProblems`).
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

/** Network Canvas's wording for one supplied setting. */
export type SuppliedStageText = Readonly<{
  path: readonly string[];
  value: LocalizedString;
}>;

/**
 * Every supplied setting of `stageType`, each with Network Canvas's text in
 * every protocol language it has one in (see `writtenIn`).
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

type StageLike = Readonly<{ type: string }> & Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether the interview shows `setting` for `stage`: the object it lives in
 * (`within`), if it has one, exists on the stage, and its `when`, if it has
 * one, holds.
 */
const isShown = (setting: SuppliedStageSetting, stage: StageLike): boolean =>
  (setting.within === undefined ||
    valueAt(stage, setting.within) !== undefined) &&
  (setting.when === undefined || setting.when(stage));

/**
 * The translations a stage holds at a setting's path, or undefined when what
 * it holds there is not a language-to-text map: something for the schema to
 * refuse, which nothing here rewrites.
 */
const translationsHeld = (held: unknown): LocalizedString | undefined => {
  if (!isRecord(held)) return undefined;
  const translations = heldTranslations(held);
  return Object.keys(translations).length === Object.keys(held).length
    ? translations
    : undefined;
};

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
 * it has one, exists on the stage, and its `when`, if it has one, holds.
 */
export const stageWordingShown = (
  stage: StageLike,
  localization: LocalizationDeclaration,
): readonly ShownStageText[] => {
  const settings = settingsOf(stage.type);
  return suppliedStageText(stage.type, localization).map(
    ({ path, value }, index) => {
      const setting = settings[index];
      const shown = setting !== undefined && isShown(setting, stage);
      return {
        path,
        value: { ...value, ...heldTranslations(valueAt(stage, path)) },
        shown,
      };
    },
  );
};

/**
 * `root` with `value` at `path`, or with nothing there when `value` is
 * undefined, copying each object on the way so `root` is left as it was. An
 * object that removing the value leaves empty is removed too, unless it is
 * `keep` or leads to it: the object a setting lives in is the researcher's
 * to remove, never a side effect of rewording.
 */
const withValueAt = (
  root: Readonly<Record<string, unknown>>,
  path: readonly string[],
  value: LocalizedString | undefined,
  keep: readonly string[] = [],
): Readonly<Record<string, unknown>> => {
  const [key, ...rest] = path;
  if (key === undefined) return root;
  const next: Record<string, unknown> = { ...root };
  if (rest.length === 0) {
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  }
  const child = root[key];
  if (!isRecord(child) && value === undefined) return root;
  const kept = keep[0] === key ? keep.slice(1) : undefined;
  const inner = withValueAt(isRecord(child) ? child : {}, rest, value, kept);
  if (Object.keys(inner).length === 0 && kept === undefined) delete next[key];
  else next[key] = inner;
  return next;
};

/**
 * `stage` as a protocol stores it, holding only the wording of its author's
 * own. Of each setting Network Canvas words, a translation that reads exactly
 * as Network Canvas's wording in that language is removed, since the
 * interview shows that wording whether or not the stage holds it, and a
 * setting left with no translation is removed with it. A setting the stage
 * holds but no longer shows, because the configuration that shows it (its
 * `when`) is off, is removed whole, so a protocol never asks to translate
 * words its participants cannot see. The same stage when there is nothing to
 * remove, so a caller can tell nothing changed.
 */
export const stageWithoutSuppliedText = <Stage extends StageLike>(
  stage: Stage,
): Stage => {
  let next: Readonly<Record<string, unknown>> = stage;
  for (const setting of settingsOf(stage.type)) {
    const held = valueAt(next, setting.path);
    if (held === undefined) continue;
    if (setting.when !== undefined && !setting.when(stage)) {
      next = withValueAt(next, setting.path, undefined, setting.within);
      continue;
    }
    const translations = translationsHeld(held);
    if (translations === undefined) continue;
    const all = Object.entries(translations);
    const own = all.filter(
      ([locale, text]) => text !== writtenIn(setting, locale),
    );
    if (own.length === all.length && own.length > 0) continue;
    next = withValueAt(
      next,
      setting.path,
      own.length === 0 ? undefined : Object.fromEntries(own),
      setting.within,
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `next` is `stage` with some of its optional supplied settings narrowed or removed, so it still has Stage's shape
  return next as Stage;
};

/**
 * `stage` as an editor holds it: each setting Network Canvas words that the
 * stage shows (`isShown`) holds the text the interview shows for it
 * (`stageWordingShown`), so its field starts with Network Canvas's wording in
 * every language the stage has no translation of its own in. No translation
 * the stage holds is changed. Never what a protocol stores: an editor saves
 * the stage through `stageWithoutSuppliedText`. The same stage when it
 * already holds all of it.
 */
export const stageWithSuppliedText = <Stage extends StageLike>(
  stage: Stage,
  localization: LocalizationDeclaration,
): Stage & Readonly<Record<string, unknown>> => {
  const settings = settingsOf(stage.type);
  let next: Readonly<Record<string, unknown>> = stage;
  stageWordingShown(stage, localization).forEach(({ path, value }, index) => {
    const setting = settings[index];
    if (setting === undefined || !isShown(setting, stage)) return;
    const held = valueAt(stage, path);
    const translations = translationsHeld(held);
    if (held !== undefined && translations === undefined) return;
    if (
      translations !== undefined &&
      Object.keys(value).every((locale) => Object.hasOwn(translations, locale))
    )
      return;
    next = withValueAt(next, path, value);
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `next` is `stage` with its optional supplied settings filled, so it still has Stage's shape
  return next as Stage & Readonly<Record<string, unknown>>;
};

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Whether the stage's setting at `path` applies to the stage as it is
 * configured: true for a setting shown whatever the configuration, else what
 * its `when` says. A stage editor shows a wording field only when this holds.
 * A path that is not a supplied setting of the stage's type does not apply.
 */
export const suppliedStageSettingApplies = (
  stage: StageLike,
  path: readonly string[],
): boolean => {
  const setting = settingsOf(stage.type).find((candidate) =>
    samePath(candidate.path, path),
  );
  if (setting === undefined) return false;
  return setting.when === undefined || setting.when(stage);
};
