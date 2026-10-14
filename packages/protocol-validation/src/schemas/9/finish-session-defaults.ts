import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';
import type {
  FinishMode,
  FinishOutcome,
  FinishSessionStage,
} from './stages/finish-session.ts';
import { suppliedStageText } from './supplied-stage-text.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The text a finish stage starts with, in one language. Every value is an ICU
 * message made only of literal text; `content` (the closing screen) and
 * `finishedContent` (the finished screen) are markdown, each opening with its
 * heading.
 */
export type FinishSessionText = Readonly<{
  label: string;
  content: string;
  finishedContent: string;
}>;

/**
 * The finish stage text Network Canvas supplies, in every language its apps
 * ship in, and in Hungarian, which a bundled template is written in. It is written into the protocol — by the v8 → v9 migration and when
 * Architect creates a protocol or adds a language — so a researcher can edit
 * and translate it like any other protocol text; nothing reads it at interview
 * time.
 *
 * Each translation was checked by blind back-translation and adversarial
 * comparison (#2131; the finished-screen text when it was added). A regional variant is served by its language
 * (`suppliedTextFor`), so British English reads the `en` text.
 */
export const DEFAULT_FINISH_SESSION_TEXT = {
  'en': {
    label: 'Finish Interview',
    content:
      '# Finish Interview\n\nYou have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
    finishedContent: '# Interview Finished\n\nThank you for participating!',
  },
  'de': {
    label: 'Interview beenden',
    content:
      '# Interview beenden\n\nSie haben das Ende des Interviews erreicht. Wenn Sie mit den eingegebenen Angaben zufrieden sind, können Sie das Interview jetzt beenden.',
    finishedContent: '# Interview beendet\n\nVielen Dank für Ihre Teilnahme!',
  },
  'es': {
    label: 'Finalizar entrevista',
    content:
      '# Finalizar entrevista\n\nHas llegado al final de la entrevista. Si estás conforme con la información que has introducido, puedes finalizar la entrevista ahora.',
    finishedContent: '# Entrevista finalizada\n\n¡Gracias por participar!',
  },
  'fr': {
    label: 'Terminer l’entretien',
    content:
      '# Terminer l’entretien\n\nVous avez atteint la fin de l’entretien. Si les informations que vous avez saisies vous conviennent, vous pouvez maintenant terminer l’entretien.',
    finishedContent:
      '# Entretien terminé\n\nMerci de votre participation\u00a0!',
  },
  'hu': {
    label: 'Interjú befejezése',
    content:
      '# Interjú befejezése\n\nElérte az interjú végét. Ha elégedett az Ön által megadott információkkal, most befejezheti az interjút.',
    finishedContent: '# Az interjú véget ért\n\nKöszönjük a részvételt!',
  },
  'it': {
    label: 'Termina l’intervista',
    content:
      '# Termina l’intervista\n\nHai raggiunto la fine dell’intervista. Se le informazioni che hai inserito ti soddisfano, puoi terminare l’intervista ora.',
    finishedContent: '# Intervista terminata\n\nGrazie per aver partecipato!',
  },
  'nl': {
    label: 'Interview voltooien',
    content:
      '# Interview voltooien\n\nJe bent aan het einde van het interview. Als je tevreden bent met de gegevens die je hebt ingevuld, kun je het interview nu voltooien.',
    finishedContent: '# Interview voltooid\n\nBedankt voor je deelname!',
  },
  'pt-BR': {
    label: 'Concluir entrevista',
    content:
      '# Concluir entrevista\n\nVocê chegou ao fim da entrevista. Se estiver de acordo com as informações que inseriu, pode concluir a entrevista agora.',
    finishedContent:
      '# Entrevista concluída\n\nAgradecemos a sua participação!',
  },
  'zh-Hans': {
    label: '完成访谈',
    content:
      '# 完成访谈\n\n您已到达访谈的结尾。如果您对所填写的信息感到满意，现在即可完成访谈。',
    finishedContent: '# 访谈已完成\n\n感谢您的参与！',
  },
  'zh-Hant': {
    label: '完成訪談',
    content:
      '# 完成訪談\n\n您已來到訪談的尾聲。如果您對填寫的資訊感到滿意，現在就可以完成訪談。',
    finishedContent: '# 訪談已完成\n\n感謝您的參與！',
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
  'content',
  'finishedContent',
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
    content: {},
    finishedContent: {},
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

/** The finish stage's settings whose wording Network Canvas supplies. */
const FINISH_SESSION_SETTINGS = [
  'finishLabel',
  'finishConfirmation',
  'finishFailed',
] as const;

type FinishSessionSetting = (typeof FINISH_SESSION_SETTINGS)[number];

const suppliedFinishSessionSettings = (
  localization: LocalizationDeclaration,
): Record<FinishSessionSetting, LocalizedString> => {
  const texts = suppliedStageText('FinishSession', localization);
  const settings: Partial<Record<FinishSessionSetting, LocalizedString>> = {};
  for (const setting of FINISH_SESSION_SETTINGS) {
    const value = texts.find(({ path }) => path[0] === setting)?.value;
    if (value === undefined) {
      throw new Error(`Network Canvas supplies no wording for ${setting}.`);
    }
    settings[setting] = value;
  }
  return settings as Record<FinishSessionSetting, LocalizedString>;
};

/**
 * A finish stage carrying the supplied text in each of the protocol's
 * languages that has it, and the supplied wording of its settings (see
 * `stage-wording/finish-session.ts`), asking the participant to confirm and
 * ending the interview as `completed`.
 */
export const createDefaultFinishSessionStage = ({
  id,
  localization,
  mode = 'confirmation',
  outcome = 'completed',
}: {
  id: string;
  localization: LocalizationDeclaration;
  mode?: FinishMode;
  outcome?: FinishOutcome;
}): FinishSessionStage => ({
  id,
  type: 'FinishSession',
  mode,
  ...defaultFinishSessionFields(localization.locales),
  ...suppliedFinishSessionSettings(localization),
  outcome,
});

/**
 * The text a participant reads: what decides whether a stage is still ours.
 * An automatic stage never shows its closing screen, so only its finished
 * screen counts; the closing text it keeps (empty, or left from before the
 * mode changed) says nothing about whether the researcher has written their
 * own.
 */
const shownTextFields = (
  mode: FinishMode,
): readonly FinishSessionTextField[] =>
  mode === 'automatic'
    ? ['finishedContent']
    : (['content', 'finishedContent'] as const);

const PARTICIPANT_TEXT_FIELDS = [
  'content',
  'finishedContent',
] as const satisfies readonly FinishSessionTextField[];

type FinishSessionScreens = Pick<
  FinishSessionStage,
  FinishSessionTextField | 'mode'
>;

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
 * Whether a finish stage's screens in one language are still
 * exactly the supplied text for that language: the researcher has not changed
 * what the participant reads. Only the screens the stage's mode shows count.
 * Architect only fills in a newly added language when this holds for the
 * default language, because supplied text beside a researcher's own wording
 * would say something else. The stage's label is a name, not something the
 * participant reads, so renaming it does not count.
 */
export const hasDefaultFinishSessionText = (
  stage: FinishSessionScreens,
  locale: LocaleTag,
): boolean => holdsSuppliedText(stage, locale, shownTextFields(stage.mode));

/**
 * The finish stage's text as Network Canvas writes it after a change to the
 * protocol's languages (see `suppliedTextAfterLanguageChange`): the screens it
 * shows when, in the default language before the change, they are still the
 * supplied text, any screen it hides that is still supplied text as well, and
 * its label while that too is the supplied one. Only those fields are
 * returned; text the researcher has changed is theirs.
 */
export const defaultFinishSessionTextAfterLanguageChange = (
  stage: FinishSessionScreens,
  change: LanguageChange,
): Partial<Record<FinishSessionTextField, LocalizedString>> => {
  const { defaultLocale } = change.before;
  if (!hasDefaultFinishSessionText(stage, defaultLocale)) return {};
  const fields = [...PARTICIPANT_TEXT_FIELDS, 'label' as const].filter(
    (field) => holdsSuppliedText(stage, defaultLocale, [field]),
  );
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
