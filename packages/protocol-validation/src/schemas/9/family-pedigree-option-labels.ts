import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
import type { InterfaceOwnedOptionSetKey } from './entity-attribute-reference.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  type PedigreeRelationshipKind,
  type PedigreeSexAssignedAtBirth,
} from './family-pedigree-values.ts';
import type { LocalizedString } from './localized-string.ts';
import { suppliedTextFor } from './supplied-text.ts';

/**
 * The interface-owned value sets whose labels a Family Pedigree participant
 * reads: the answers to the sex assigned at birth question, and the kinds of
 * parent a relationship can be. The interview shows the codebook's own labels
 * for them, so Network Canvas supplies those labels in every language its apps
 * ship in.
 */
export type SuppliedOptionLabelSet = Extract<
  InterfaceOwnedOptionSetKey,
  'pedigreeSexAssignedAtBirth' | 'pedigreeRelationship'
>;

type SuppliedOptionLabels = Readonly<{
  pedigreeSexAssignedAtBirth: Readonly<
    Record<PedigreeSexAssignedAtBirth, string>
  >;
  pedigreeRelationship: Readonly<Record<PedigreeRelationshipKind, string>>;
}>;

const englishLabels = <Value extends string>(
  options: readonly { value: Value; label: string }[],
) =>
  Object.fromEntries(
    options.map(({ value, label }) => [value, label]),
  ) as Record<Value, string>;

/**
 * The labels Network Canvas supplies for the Family Pedigree's owned value
 * sets, as plain text. English is the canonical wording the migration writes;
 * the other languages are the wording the interview showed before it read the
 * codebook, translated with the rest of its catalog.
 */
export const SUPPLIED_PEDIGREE_OPTION_LABELS = {
  'en': {
    pedigreeSexAssignedAtBirth: englishLabels(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
    ),
    pedigreeRelationship: englishLabels(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
  },
  'de': {
    pedigreeSexAssignedAtBirth: {
      female: 'Weiblich',
      male: 'Männlich',
      intersex: 'Intergeschlechtlich',
      unknown: 'Weiß ich nicht',
      preferNotToSay: 'Möchte ich nicht sagen',
    },
    pedigreeRelationship: {
      partner: 'Partnerperson',
      biological: 'Leiblicher Elternteil',
      adoptive: 'Adoptivelternteil',
      social: 'Stief- oder sozialer Elternteil',
      donor: 'Eizell- oder Samenspender/in',
      surrogate: 'Leihmutter',
    },
  },
  'es': {
    pedigreeSexAssignedAtBirth: {
      female: 'Femenino',
      male: 'Masculino',
      intersex: 'Intersexual',
      unknown: 'No lo sé',
      preferNotToSay: 'Prefiero no decirlo',
    },
    pedigreeRelationship: {
      partner: 'Pareja',
      biological: 'Progenitor biológico',
      adoptive: 'Progenitor adoptivo',
      social: 'Padrastro, madrastra o progenitor social',
      donor: 'Donante de óvulos o esperma',
      surrogate: 'Gestante subrogada',
    },
  },
  'fr': {
    pedigreeSexAssignedAtBirth: {
      female: 'Féminin',
      male: 'Masculin',
      intersex: 'Intersexe',
      unknown: 'Je ne sais pas',
      preferNotToSay: 'Je préfère ne pas répondre',
    },
    pedigreeRelationship: {
      partner: 'Partenaire',
      biological: 'Parent biologique',
      adoptive: 'Parent adoptif',
      social: 'Beau-parent ou parent social',
      donor: 'Donneur ou donneuse d’ovule ou de sperme',
      surrogate: 'Mère porteuse',
    },
  },
  'it': {
    pedigreeSexAssignedAtBirth: {
      female: 'Femmina',
      male: 'Maschio',
      intersex: 'Intersex',
      unknown: 'Non lo so',
      preferNotToSay: 'Preferisco non rispondere',
    },
    pedigreeRelationship: {
      partner: 'Partner',
      biological: 'Genitore biologico',
      adoptive: 'Genitore adottivo',
      social: 'Genitore acquisito o sociale',
      donor: 'Donatore o donatrice di ovuli o sperma',
      surrogate: 'Gestante per altri',
    },
  },
  'nl': {
    pedigreeSexAssignedAtBirth: {
      female: 'Vrouwelijk',
      male: 'Mannelijk',
      intersex: 'Intersekse',
      unknown: 'Weet ik niet',
      preferNotToSay: 'Zeg ik liever niet',
    },
    pedigreeRelationship: {
      partner: 'Partner',
      biological: 'Biologische ouder',
      adoptive: 'Adoptiefouder',
      social: 'Stiefouder of sociale ouder',
      donor: 'Eicel- of zaaddonor',
      surrogate: 'Draagmoeder',
    },
  },
  'pt-BR': {
    pedigreeSexAssignedAtBirth: {
      female: 'Feminino',
      male: 'Masculino',
      intersex: 'Intersexo',
      unknown: 'Não sei',
      preferNotToSay: 'Prefiro não dizer',
    },
    pedigreeRelationship: {
      partner: 'Parceiro(a)',
      biological: 'Pai/mãe biológico(a)',
      adoptive: 'Pai/mãe adotivo(a)',
      social: 'Padrasto/madrasta ou pai/mãe socioafetivo(a)',
      donor: 'Doador(a) de óvulo ou esperma',
      surrogate: 'Gestante substituta',
    },
  },
  'zh-Hans': {
    pedigreeSexAssignedAtBirth: {
      female: '女性',
      male: '男性',
      intersex: '间性',
      unknown: '不知道',
      preferNotToSay: '不愿透露',
    },
    pedigreeRelationship: {
      partner: '伴侣',
      biological: '亲生父母',
      adoptive: '养父母',
      social: '继父母或社会意义上的父母',
      donor: '卵子或精子捐赠者',
      surrogate: '代孕者',
    },
  },
  'zh-Hant': {
    pedigreeSexAssignedAtBirth: {
      female: '女性',
      male: '男性',
      intersex: '雙性人',
      unknown: '不知道',
      preferNotToSay: '不願透露',
    },
    pedigreeRelationship: {
      partner: '伴侶',
      biological: '親生父母',
      adoptive: '養父母',
      social: '繼父母或社會意義上的父母',
      donor: '卵子或精子捐贈者',
      surrogate: '代理孕母',
    },
  },
} as const satisfies Readonly<Record<LocaleTag, SuppliedOptionLabels>>;

const supplied: Readonly<Record<string, SuppliedOptionLabels>> =
  SUPPLIED_PEDIGREE_OPTION_LABELS;

export const isSuppliedOptionLabelSet = (
  set: InterfaceOwnedOptionSetKey,
): set is SuppliedOptionLabelSet =>
  set === 'pedigreeSexAssignedAtBirth' || set === 'pedigreeRelationship';

/**
 * The supplied label for one value of a set in a protocol language, as the
 * literal message the protocol stores, or `undefined` when the language has
 * no supplied labels (see `suppliedTextFor`).
 */
export const suppliedOptionLabel = (
  set: SuppliedOptionLabelSet,
  value: string,
  locale: LocaleTag,
): string | undefined => {
  const labels: Readonly<Record<string, string>> | undefined = suppliedTextFor(
    supplied,
    locale,
  )?.[set];
  const text = labels?.[value];
  return text === undefined ? undefined : escapeMessageText(text);
};

/**
 * The label for one value of a set in each of the protocol's languages that
 * has a supplied label. A protocol written only in languages Network Canvas
 * supplies none for still needs one translation, so it gets the English label
 * in its default language, as a protocol migrated from schema 8 does.
 */
export const suppliedOptionLabels = (
  set: SuppliedOptionLabelSet,
  value: string,
  localization: LocalizationDeclaration,
): LocalizedString => {
  const label: Record<LocaleTag, string> = {};
  for (const locale of localization.locales) {
    const text = suppliedOptionLabel(set, value, locale);
    if (text !== undefined) label[locale] = text;
  }
  if (Object.keys(label).length > 0) return label;
  return {
    [localization.defaultLocale]:
      suppliedOptionLabel(set, value, 'en') ?? escapeMessageText(value),
  };
};

type LabelledOption = Readonly<{ value: unknown; label?: unknown }>;

const labelIn = (option: LabelledOption, locale: LocaleTag) =>
  typeof option.label === 'object' && option.label !== null
    ? (option.label as Readonly<Record<string, unknown>>)[locale]
    : undefined;

/**
 * Whether every option's label in `locale` is still exactly the supplied
 * label for its value: the researcher has not reworded any of them.
 */
export const hasSuppliedOptionLabels = (
  set: SuppliedOptionLabelSet,
  options: readonly LabelledOption[],
  locale: LocaleTag,
): boolean =>
  options.every((option) => {
    const text =
      typeof option.value === 'string'
        ? suppliedOptionLabel(set, option.value, locale)
        : undefined;
    return text !== undefined && labelIn(option, locale) === text;
  });

/**
 * The options with the supplied label added in `locale`, when every label in
 * the protocol's default language is still the supplied one and `locale` has
 * supplied labels. A label the option already has in `locale` is kept.
 * Returns the options unchanged otherwise.
 */
export const withSuppliedOptionLabelTranslation = <
  Option extends LabelledOption,
>(
  set: SuppliedOptionLabelSet,
  options: readonly Option[],
  locale: LocaleTag,
  defaultLocale: LocaleTag,
): readonly Option[] => {
  if (!hasSuppliedOptionLabels(set, options, defaultLocale)) return options;
  let changed = false;
  const next = options.map((option) => {
    if (labelIn(option, locale) !== undefined) return option;
    const text =
      typeof option.value === 'string'
        ? suppliedOptionLabel(set, option.value, locale)
        : undefined;
    if (text === undefined) return option;
    changed = true;
    return {
      ...option,
      label: {
        ...(option.label as Readonly<Record<string, string>>),
        [locale]: text,
      },
    };
  });
  return changed ? next : options;
};
