import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
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
  /** The supplied text, by language. */
  text: Readonly<Record<LocaleTag, string>>;
}>;

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
  NameGeneratorRoster: [{ path: ['panelTitle'], text: ROSTER_PANEL_TITLE }],
};

const settingsOf = (stageType: string): readonly SuppliedStageSetting[] =>
  SUPPLIED_STAGE_TEXT[stageType] ?? [];

/**
 * The text Network Canvas writes for a setting in a protocol language, as the
 * stage holds it: its supplied text there, or, in the default language when
 * it supplies none, the English text, because every supplied setting is
 * required and a stage must hold it in some language. That is the rule for
 * the Family Pedigree's option labels too (`writtenOptionLabel`), and what
 * the schema 8 to 9 migration has always recorded.
 */
const writtenIn = (
  setting: SuppliedStageSetting,
  locale: LocaleTag,
  isDefault: boolean,
): string | undefined => {
  const text =
    suppliedTextFor(setting.text, locale) ??
    (isDefault ? setting.text.en : undefined);
  return text === undefined ? undefined : escapeMessageText(text);
};

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
 * The supplied settings a new stage of `stageType` starts with, each holding
 * Network Canvas's text in every protocol language it writes one in (see
 * `writtenIn`).
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
 * The supplied settings `stage` is missing, as the schema 8 to 9 migration
 * adds them: as a new stage would hold them.
 */
export const missingSuppliedStageText = (
  stage: Readonly<{ type: string }>,
  localization: LocalizationDeclaration,
): readonly SuppliedStageText[] =>
  suppliedStageText(stage.type, localization).filter(
    ({ path }) => valueAt(stage, path) === undefined,
  );
