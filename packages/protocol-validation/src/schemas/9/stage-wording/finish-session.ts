import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

/** The button that ends the interview, and the confirmation's own button. */
const FINISH_LABEL = {
  'en': 'Finish',
  'de': 'Beenden',
  'es': 'Finalizar',
  'fr': 'Terminer',
  'it': 'Termina',
  'nl': 'Voltooien',
  'pt-BR': 'Concluir',
  'zh-Hans': '完成',
  'zh-Hant': '完成',
} as const satisfies SuppliedWording;

/** The question the Finish button asks before the interview ends. */
const FINISH_CONFIRMATION = {
  'en': 'Are you sure you want to finish the interview?',
  'de': 'Möchten Sie das Interview wirklich beenden?',
  'es': '¿Seguro que quieres finalizar la entrevista?',
  'fr': 'Voulez-vous vraiment terminer l’entretien ?',
  'it': 'Vuoi davvero terminare l’intervista?',
  'nl': 'Weet je zeker dat je het interview wilt voltooien?',
  'pt-BR': 'Tem certeza de que deseja concluir a entrevista?',
  'zh-Hans': '确定要完成访谈吗？',
  'zh-Hant': '確定要完成訪談嗎？',
} as const satisfies SuppliedWording;

/** What the interview says when it could not be ended. */
const FINISH_FAILED = {
  'en': 'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
  'en-GB':
    'The interview could not be finished. Please try again. If the problem continues, contact the study organiser.',
  'de': 'Das Interview konnte nicht beendet werden. Bitte versuchen Sie es erneut. Wenn das Problem weiterhin besteht, wenden Sie sich an die Studienleitung.',
  'es': 'No se pudo finalizar la entrevista. Inténtalo de nuevo. Si el problema continúa, ponte en contacto con la persona que organiza el estudio.',
  'fr': 'L’entretien n’a pas pu être terminé. Veuillez réessayer. Si le problème persiste, contactez l’équipe responsable de l’étude.',
  'it': 'Non è stato possibile terminare l’intervista. Riprova. Se il problema persiste, contatta chi organizza lo studio.',
  'nl': 'Het interview kan niet worden voltooid. Probeer het opnieuw. Blijft het probleem zich voordoen, neem dan contact op met de organisator van het onderzoek.',
  'pt-BR':
    'Não foi possível concluir a entrevista. Tente novamente. Se o problema continuar, entre em contato com a equipe responsável pelo estudo.',
  'zh-Hans': '无法完成访谈，请重试。如果问题仍然存在，请联系研究组织者。',
  'zh-Hant': '無法完成訪談。請再試一次。如果問題持續發生，請聯絡研究團隊。',
} as const satisfies SuppliedWording;

/** The Finish screen's settings Network Canvas words. */
export const FINISH_SESSION_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  { path: ['finishLabel'], message: FINISH_LABEL },
  { path: ['finishConfirmation'], message: FINISH_CONFIRMATION },
  { path: ['finishFailed'], message: FINISH_FAILED },
];
