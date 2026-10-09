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
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

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
      identicalTwin: 'Eineiiger Zwilling',
      fraternalTwin: 'Zweieiiger Zwilling',
      unknownZygosityTwin: 'Zwilling, unbekannt ob eineiig',
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
      identicalTwin: 'Gemelo idéntico',
      fraternalTwin: 'Mellizo',
      unknownZygosityTwin: 'Gemelo, sin saber si idéntico',
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
      identicalTwin: 'Jumeau ou jumelle monozygote',
      fraternalTwin: 'Jumeau ou jumelle dizygote',
      unknownZygosityTwin: 'Jumeau ou jumelle, sans savoir si monozygote',
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
      identicalTwin: 'Gemello identico',
      fraternalTwin: 'Gemello fraterno',
      unknownZygosityTwin: 'Gemello, non si sa se identico',
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
      identicalTwin: 'Eeneiige tweeling',
      fraternalTwin: 'Twee-eiige tweeling',
      unknownZygosityTwin: 'Tweeling, onbekend of eeneiig',
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
      identicalTwin: 'Gêmeo(a) idêntico(a)',
      fraternalTwin: 'Gêmeo(a) fraterno(a)',
      unknownZygosityTwin: 'Gêmeo(a), não se sabe se idêntico(a)',
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
      identicalTwin: '同卵双胞胎',
      fraternalTwin: '异卵双胞胎',
      unknownZygosityTwin: '双胞胎，不知是否同卵',
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
      identicalTwin: '同卵雙胞胎',
      fraternalTwin: '異卵雙胞胎',
      unknownZygosityTwin: '雙胞胎，不知是否同卵',
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
 * The label Network Canvas writes for one value of a set in a protocol
 * language: the language's supplied label, or, in the default language of a
 * protocol whose default Network Canvas supplies no labels in, the English
 * one, since participants choose from these answers and a protocol needs one
 * in its default language. `undefined` where it writes none.
 */
const writtenOptionLabel = (
  set: SuppliedOptionLabelSet,
  value: string,
  locale: LocaleTag,
  isDefault: boolean,
): string | undefined =>
  suppliedOptionLabel(set, value, locale) ??
  (isDefault ? suppliedOptionLabel(set, value, 'en') : undefined);

/**
 * The label Network Canvas writes for one value of a set in each of the
 * protocol's languages (see `writtenOptionLabel`).
 */
export const suppliedOptionLabels = (
  set: SuppliedOptionLabelSet,
  value: string,
  localization: LocalizationDeclaration,
): LocalizedString => {
  const label: Record<LocaleTag, string> = {};
  for (const locale of localization.locales) {
    const text = writtenOptionLabel(
      set,
      value,
      locale,
      locale === localization.defaultLocale,
    );
    if (text !== undefined) label[locale] = text;
  }
  return label;
};

type LabelledOption = Readonly<{ value: unknown; label?: unknown }>;

const labelOf = (option: LabelledOption): LocalizedString =>
  typeof option.label === 'object' && option.label !== null
    ? (option.label as LocalizedString)
    : {};

/**
 * Whether every option's label in the protocol's default language is still
 * exactly the label Network Canvas wrote there: the researcher has not
 * reworded any of them.
 */
export const hasSuppliedOptionLabels = (
  set: SuppliedOptionLabelSet,
  options: readonly LabelledOption[],
  defaultLocale: LocaleTag,
): boolean =>
  options.every((option) => {
    const text =
      typeof option.value === 'string'
        ? writtenOptionLabel(set, option.value, defaultLocale, true)
        : undefined;
    return text !== undefined && labelOf(option)[defaultLocale] === text;
  });

/**
 * The options as Network Canvas labels them after a change to the protocol's
 * languages (see `suppliedTextAfterLanguageChange`), when their labels in the
 * default language before it are still the ones it wrote; `undefined`
 * otherwise, as the labels are then the researcher's.
 */
export const suppliedOptionLabelsAfterLanguageChange = <
  Option extends LabelledOption,
>(
  set: SuppliedOptionLabelSet,
  options: readonly Option[],
  change: LanguageChange,
): Option[] | undefined => {
  if (!hasSuppliedOptionLabels(set, options, change.before.defaultLocale))
    return undefined;
  return options.map((option) => {
    const { value } = option;
    if (typeof value !== 'string') return option;
    return {
      ...option,
      label: suppliedTextAfterLanguageChange(
        labelOf(option),
        (locale, isDefault) =>
          writtenOptionLabel(set, value, locale, isDefault),
        change,
      ),
    };
  });
};
