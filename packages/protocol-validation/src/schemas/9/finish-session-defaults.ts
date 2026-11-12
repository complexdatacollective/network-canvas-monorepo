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
 * ship in. It is written into the protocol — by the v8 → v9 migration and when
 * Architect creates a protocol or adds a language — so a researcher can edit
 * and translate it like any other protocol text; nothing reads it at interview
 * time.
 *
 * Each translation was checked by blind back-translation and adversarial
 * comparison (#2131; the finished-screen text when it was added). Only the
 * exact language is served (`suppliedTextFor`): British English gets none,
 * and falls back to `en` where the protocol has that language too.
 */
export const DEFAULT_FINISH_SESSION_TEXT = {
  'en': {
    label: 'Finish Interview',
    content:
      '# Finish Interview\n\nYou have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
    finishedContent: '# Interview Finished\n\nThank you for participating!',
  },
  'ar': {
    label: 'إنهاء المقابلة',
    content:
      '# إنهاء المقابلة\n\nلقد وصلت إلى نهاية المقابلة. إذا كانت المعلومات التي أدخلتها مُرضية لك، يمكنك إنهاء المقابلة الآن.',
    finishedContent: '# انتهت المقابلة\n\nشكرًا لمشاركتك!',
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
 * protocol's languages that has it. A language without supplied text is left
 * out, and reported as untranslated like any other missing translation; in
 * the default language, the researcher must write it before the protocol
 * leaves its editor (`findFinishStageTextProblems`).
 */
export const defaultFinishSessionFields = (
  localization: LocalizationDeclaration,
): Record<FinishSessionTextField, LocalizedString> => {
  const fields: Record<FinishSessionTextField, Record<LocaleTag, string>> = {
    label: {},
    content: {},
    finishedContent: {},
  };
  for (const locale of localization.locales) {
    const text = defaultFinishSessionText(locale);
    if (text === undefined) continue;
    for (const field of FINISH_SESSION_TEXT_FIELDS) {
      fields[field][locale] = text[field];
    }
  }
  return fields;
};

/**
 * A finish stage carrying the supplied closing text in each of the
 * protocol's languages that has it, asking the participant to confirm and
 * ending the interview as `completed`. It holds none of the settings Network
 * Canvas words (see `stage-wording/finish-session.ts`): the interview shows
 * that wording for a stage that does not hold it.
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
  ...defaultFinishSessionFields(localization),
  outcome,
});

/**
 * The finish stage's text as it reads after a change to the protocol's
 * languages (see `suppliedTextAfterLanguageChange`): each of its closing
 * text, finished text and stage name that it holds. A language the protocol
 * did not have gains the supplied text for each of them with no translation
 * in it, whether or not the researcher has changed it in another language,
 * and the supplied text for a corrected language becomes the supplied text
 * for the language as corrected. A closing text the stage does not hold (an
 * automatic stage whose closing text was cleared) is left out.
 */
export const defaultFinishSessionTextAfterLanguageChange = (
  stage: Pick<FinishSessionStage, FinishSessionTextField>,
  change: LanguageChange,
): Partial<Record<FinishSessionTextField, LocalizedString>> =>
  Object.fromEntries(
    FINISH_SESSION_TEXT_FIELDS.flatMap((field) => {
      const held = stage[field];
      if (held === undefined) return [];
      return [
        [
          field,
          suppliedTextAfterLanguageChange(
            held,
            (locale) => defaultFinishSessionText(locale)?.[field],
            change,
          ),
        ],
      ];
    }),
  );
