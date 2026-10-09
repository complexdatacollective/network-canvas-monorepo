import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';
import type {
  FinishOutcome,
  FinishSessionStage,
} from './stages/finish-session.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The text a finish stage starts with, in one language. Every value is an ICU
 * message made only of literal text; `title` and `content` are markdown.
 */
export type FinishSessionText = Readonly<{
  label: string;
  title: string;
  content: string;
}>;

/**
 * The finish stage text Network Canvas supplies, in every language its apps
 * ship in, and in Hungarian, which a bundled template is written in. It is written into the protocol — by the v8 → v9 migration and when
 * Architect creates a protocol or adds a language — so a researcher can edit
 * and translate it like any other protocol text; nothing reads it at interview
 * time.
 *
 * Each translation was checked by blind back-translation and adversarial
 * comparison (#2131). A regional variant is served by its language
 * (`suppliedTextFor`), so British English reads the `en` text.
 */
export const DEFAULT_FINISH_SESSION_TEXT = {
  'en': {
    label: 'Finish Interview',
    title: 'Finish Interview',
    content:
      'You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
  },
  'de': {
    label: 'Interview beenden',
    title: 'Interview beenden',
    content:
      'Sie haben das Ende des Interviews erreicht. Wenn Sie mit den eingegebenen Angaben zufrieden sind, können Sie das Interview jetzt beenden.',
  },
  'es': {
    label: 'Finalizar entrevista',
    title: 'Finalizar entrevista',
    content:
      'Has llegado al final de la entrevista. Si estás conforme con la información que has introducido, puedes finalizar la entrevista ahora.',
  },
  'fr': {
    label: 'Terminer l’entretien',
    title: 'Terminer l’entretien',
    content:
      'Vous avez atteint la fin de l’entretien. Si les informations que vous avez saisies vous conviennent, vous pouvez maintenant terminer l’entretien.',
  },
  'hu': {
    label: 'Interjú befejezése',
    title: 'Interjú befejezése',
    content:
      'Elérte az interjú végét. Ha elégedett az Ön által megadott információkkal, most befejezheti az interjút.',
  },
  'it': {
    label: 'Termina l’intervista',
    title: 'Termina l’intervista',
    content:
      'Hai raggiunto la fine dell’intervista. Se le informazioni che hai inserito ti soddisfano, puoi terminare l’intervista ora.',
  },
  'nl': {
    label: 'Interview voltooien',
    title: 'Interview voltooien',
    content:
      'Je bent aan het einde van het interview. Als je tevreden bent met de gegevens die je hebt ingevuld, kun je het interview nu voltooien.',
  },
  'pt-BR': {
    label: 'Concluir entrevista',
    title: 'Concluir entrevista',
    content:
      'Você chegou ao fim da entrevista. Se estiver de acordo com as informações que inseriu, pode concluir a entrevista agora.',
  },
  'zh-Hans': {
    label: '完成访谈',
    title: '完成访谈',
    content:
      '您已到达访谈的结尾。如果您对所填写的信息感到满意，现在即可完成访谈。',
  },
  'zh-Hant': {
    label: '完成訪談',
    title: '完成訪談',
    content:
      '您已來到訪談的尾聲。如果您對填寫的資訊感到滿意，現在就可以完成訪談。',
  },
} as const satisfies Readonly<Record<LocaleTag, FinishSessionText>>;

const supplied: Readonly<Record<string, FinishSessionText>> =
  DEFAULT_FINISH_SESSION_TEXT;

/**
 * The supplied finish text for a protocol language, or `undefined` when there
 * is none (see `suppliedTextFor`).
 */
export const defaultFinishSessionText = (
  locale: LocaleTag,
): FinishSessionText | undefined => suppliedTextFor(supplied, locale);

type FinishSessionTextField = keyof FinishSessionText;

const FINISH_SESSION_TEXT_FIELDS = [
  'label',
  'title',
  'content',
] as const satisfies readonly FinishSessionTextField[];

/**
 * The finish stage's text fields with the supplied text for every one of the
 * given languages that has it. A language without supplied text is left out,
 * and reported as untranslated like any other missing translation.
 */
export const defaultFinishSessionFields = (
  locales: readonly LocaleTag[],
): Record<FinishSessionTextField, LocalizedString> => {
  const fields: Record<FinishSessionTextField, Record<LocaleTag, string>> = {
    label: {},
    title: {},
    content: {},
  };
  for (const locale of locales) {
    const text = defaultFinishSessionText(locale);
    if (text === undefined) continue;
    for (const field of FINISH_SESSION_TEXT_FIELDS) {
      fields[field][locale] = text[field];
    }
  }
  return fields;
};

/**
 * A finish stage carrying the supplied text in each of the protocol's
 * languages that has it, ending the interview as `completed`.
 */
export const createDefaultFinishSessionStage = ({
  id,
  localization,
  outcome = 'completed',
}: {
  id: string;
  localization: LocalizationDeclaration;
  outcome?: FinishOutcome;
}): FinishSessionStage => ({
  id,
  type: 'FinishSession',
  ...defaultFinishSessionFields(localization.locales),
  outcome,
});

/** The text a participant reads: what decides whether a stage is still ours. */
const PARTICIPANT_TEXT_FIELDS = [
  'title',
  'content',
] as const satisfies readonly FinishSessionTextField[];

const holdsSuppliedText = (
  stage: Pick<FinishSessionStage, FinishSessionTextField>,
  locale: LocaleTag,
  fields: readonly FinishSessionTextField[],
): boolean => {
  const text = defaultFinishSessionText(locale);
  if (text === undefined) return false;
  return fields.every((field) => stage[field][locale] === text[field]);
};

/**
 * Whether a finish stage's title and content in one language are still
 * exactly the supplied text for that language: the researcher has not changed
 * what the participant reads. Architect only fills in a newly added language
 * when this holds for the default language, because supplied text beside a
 * researcher's own wording would say something else. The stage's label is a
 * name, not something the participant reads, so renaming it does not count.
 */
export const hasDefaultFinishSessionText = (
  stage: Pick<FinishSessionStage, FinishSessionTextField>,
  locale: LocaleTag,
): boolean => holdsSuppliedText(stage, locale, PARTICIPANT_TEXT_FIELDS);

/**
 * The finish stage's text as Network Canvas writes it after a change to the
 * protocol's languages (see `suppliedTextAfterLanguageChange`): its title and
 * content when, in the default language before the change, they are still the
 * supplied text, and its label as well while that too is the supplied one.
 * Only those fields are returned; text the researcher has changed is theirs.
 */
export const defaultFinishSessionTextAfterLanguageChange = (
  stage: Pick<FinishSessionStage, FinishSessionTextField>,
  change: LanguageChange,
): Partial<Record<FinishSessionTextField, LocalizedString>> => {
  const { defaultLocale } = change.before;
  if (!hasDefaultFinishSessionText(stage, defaultLocale)) return {};
  const fields = holdsSuppliedText(stage, defaultLocale, ['label'])
    ? FINISH_SESSION_TEXT_FIELDS
    : PARTICIPANT_TEXT_FIELDS;
  return Object.fromEntries(
    fields.map((field) => [
      field,
      suppliedTextAfterLanguageChange(
        stage[field],
        (locale) => defaultFinishSessionText(locale)?.[field],
        change,
      ),
    ]),
  );
};
