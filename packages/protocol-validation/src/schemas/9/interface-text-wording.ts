import type { MessageArguments } from '../../localization/messageArguments.ts';
import type { SuppliedWording } from './supplied-stage-setting.ts';

// Generated from the interview, fresco-ui and app-i18n catalogs: the wording
// Network Canvas supplies for the interface text a protocol holds
// (`interface-text.ts`), each entry the catalog text of the message it
// stands in for, in every language Network Canvas ships, with the arguments
// the English message uses. Regenerate rather than edit by hand when a
// catalog's wording changes.

export type InterfaceTextEntry = Readonly<{
  /** The message the text stands in for in the interview. */
  id: string;
  arguments?: MessageArguments;
  message: SuppliedWording;
}>;

export const INTERVIEW_INTERFACE_TEXT = {
  exitInterview: {
    id: 'interview.navigation.exitInterview',
    message: {
      'en': 'Exit interview',
      'de': 'Interview verlassen',
      'es': 'Salir de la entrevista',
      'fr': 'Quitter l’entretien',
      'it': 'Esci dall’intervista',
      'nl': 'Interview verlaten',
      'pt-BR': 'Sair da entrevista',
      'zh-Hans': '退出访谈',
      'zh-Hant': '離開訪談',
    },
  },
  exitInterviewDescription: {
    id: 'interview.navigation.exitInterviewDescription',
    message: {
      'en': 'Your answers so far will be saved and you can continue later.',
      'de': 'Ihre bisherigen Antworten werden gespeichert und Sie können später weitermachen.',
      'es': 'Tus respuestas hasta ahora se guardarán y podrás continuar más adelante.',
      'fr': 'Vos réponses seront enregistrées et vous pourrez reprendre plus tard.',
      'it': 'Le risposte date finora verranno salvate e potrai continuare in seguito.',
      'nl': 'Je antwoorden tot nu toe worden opgeslagen en je kunt later verdergaan.',
      'pt-BR':
        'Suas respostas até agora serão salvas, e você poderá continuar depois.',
      'zh-Hans': '您目前的回答将被保存，之后可以继续。',
      'zh-Hant': '系統會儲存您目前的回答，您可以稍後再繼續。',
    },
  },
  stageError: {
    id: 'interview.runtime.taskErrorDescription',
    message: {
      'en': 'There was an error with the interview software, and this task could not be displayed. Some tasks, such as maps, need an internet connection, so check your connection and then try refreshing the page. If the problem persists, please contact the study organizer and send them the debug information, which you can copy with the button below. You may be able to continue your interview by clicking the next button.',
      'de': 'In der Interview-Software ist ein Fehler aufgetreten, daher konnte diese Aufgabe nicht angezeigt werden. Manche Aufgaben (zum Beispiel Karten) benötigen eine Internetverbindung. Prüfen Sie daher Ihre Verbindung und laden Sie dann die Seite neu. Wenn das Problem weiterhin besteht, wenden Sie sich bitte an die Studienleitung und senden Sie ihr die Diagnoseinformationen, die Sie mit der Schaltfläche unten kopieren können. Möglicherweise können Sie das Interview fortsetzen, indem Sie auf „Weiter“ klicken.',
      'es': 'Se produjo un error en el programa de la entrevista y no se pudo mostrar esta tarea. Algunas tareas, como los mapas, necesitan conexión a internet, así que comprueba tu conexión y después prueba a actualizar la página. Si el problema persiste, ponte en contacto con la persona que organiza el estudio y envíale la información de diagnóstico, que puedes copiar con el botón de abajo. Es posible que puedas continuar la entrevista pulsando la flecha de avance.',
      'fr': 'Une erreur s’est produite dans le logiciel d’entretien et cette tâche n’a pas pu être affichée. Certaines tâches, comme les cartes, nécessitent une connexion Internet : vérifiez votre connexion, puis essayez d’actualiser la page. Si le problème persiste, contactez l’équipe responsable de l’étude et transmettez-lui les informations de débogage, que vous pouvez copier avec le bouton ci-dessous. Vous pourrez peut-être poursuivre votre entretien en cliquant sur le bouton Suivant.',
      'it': 'Si è verificato un errore nel software dell’intervista e non è stato possibile visualizzare questa attività. Alcune attività, come le mappe, richiedono una connessione a internet: controlla la connessione, poi prova ad aggiornare la pagina. Se il problema persiste, contatta chi organizza lo studio e inviagli le informazioni di debug, che puoi copiare con il pulsante qui sotto. Potresti riuscire a continuare l’intervista facendo clic sul pulsante Avanti.',
      'nl': 'Er is een fout opgetreden in de interviewsoftware, waardoor deze taak niet kan worden weergegeven. Sommige taken, zoals kaarten, hebben een internetverbinding nodig. Controleer je verbinding en vernieuw daarna de pagina. Blijft het probleem bestaan, neem dan contact op met de organisator van het onderzoek en stuur de foutopsporingsgegevens, die je met de knop hieronder kunt kopiëren. Mogelijk kun je verder met je interview door op de knop Volgende te klikken.',
      'pt-BR':
        'Ocorreu um erro no software da entrevista, e esta tarefa não pôde ser exibida. Algumas tarefas, como mapas, precisam de conexão com a internet: verifique sua conexão e depois tente atualizar a página. Se o problema persistir, entre em contato com a equipe responsável pelo estudo e envie os dados de depuração, que você pode copiar com o botão abaixo. Talvez você consiga continuar sua entrevista clicando no botão de avançar.',
      'zh-Hans':
        '访谈软件出现错误，无法显示此任务。某些任务（例如地图）需要网络连接，请先检查网络连接，然后尝试刷新页面。如果问题仍然存在，请联系研究组织者，并发送下方可通过按钮复制的调试信息。您也许可以点击“下一步”按钮继续访谈。',
      'zh-Hant':
        '訪談軟體發生錯誤，因此無法顯示此任務。部分任務（例如地圖）需要網路連線，請先檢查網路連線，然後嘗試重新整理頁面。如果問題持續發生，請聯絡研究團隊，並傳送下方可透過按鈕複製的偵錯資訊。您或許可以點選「下一步」按鈕，繼續進行訪談。',
    },
  },
  itemUnavailable: {
    id: 'interview.runtime.itemUnavailable',
    message: {
      'en': 'This item could not be displayed.',
      'de': 'Dieser Inhalt konnte nicht angezeigt werden.',
      'es': 'No se pudo mostrar este elemento.',
      'fr': 'Cet élément n’a pas pu être affiché.',
      'it': 'Non è stato possibile visualizzare questo elemento.',
      'nl': 'Dit item kan niet worden weergegeven.',
      'pt-BR': 'Não foi possível exibir este item.',
      'zh-Hans': '无法显示此项内容。',
      'zh-Hant': '無法顯示此項目。',
    },
  },
  back: {
    id: 'common.back',
    message: {
      'en': 'Back',
      'de': 'Zurück',
      'es': 'Volver',
      'fr': 'Retour',
      'it': 'Indietro',
      'nl': 'Terug',
      'pt-BR': 'Voltar',
      'zh-Hans': '返回',
      'zh-Hant': '上一步',
    },
  },
  continue: {
    id: 'common.continue',
    message: {
      'en': 'Continue',
      'de': 'Weiter',
      'es': 'Continuar',
      'fr': 'Continuer',
      'it': 'Continua',
      'nl': 'Doorgaan',
      'pt-BR': 'Continuar',
      'zh-Hans': '继续',
      'zh-Hant': '繼續',
    },
  },
  cancel: {
    id: 'common.cancel',
    message: {
      'en': 'Cancel',
      'de': 'Abbrechen',
      'es': 'Cancelar',
      'fr': 'Annuler',
      'it': 'Annulla',
      'nl': 'Annuleren',
      'pt-BR': 'Cancelar',
      'zh-Hans': '取消',
      'zh-Hant': '取消',
    },
  },
  done: {
    id: 'common.done',
    message: {
      'en': 'Done',
      'de': 'Fertig',
      'es': 'Listo',
      'fr': 'Terminé',
      'it': 'Fine',
      'nl': 'Gereed',
      'pt-BR': 'Concluído',
      'zh-Hans': '完成',
      'zh-Hant': '完成',
    },
  },
  delete: {
    id: 'common.delete',
    message: {
      'en': 'Delete',
      'de': 'Löschen',
      'es': 'Eliminar',
      'fr': 'Supprimer',
      'it': 'Elimina',
      'nl': 'Verwijderen',
      'pt-BR': 'Excluir',
      'zh-Hans': '删除',
      'zh-Hant': '刪除',
    },
  },
  genericError: {
    id: 'common.genericError',
    message: {
      'en': 'Something went wrong.',
      'de': 'Etwas ist schiefgelaufen.',
      'es': 'Se ha producido un error.',
      'fr': 'Une erreur s’est produite.',
      'it': 'Si è verificato un errore.',
      'nl': 'Er is iets misgegaan.',
      'pt-BR': 'Algo deu errado.',
      'zh-Hans': '出现问题。',
      'zh-Hant': '發生錯誤。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const PASSPHRASE_INTERFACE_TEXT = {
  passphrase: {
    id: 'interview.runtime.passphrase',
    message: {
      'en': 'Passphrase',
      'de': 'Passphrase',
      'es': 'Frase de contraseña',
      'fr': 'Phrase secrète',
      'it': 'Passphrase',
      'nl': 'Wachtzin',
      'pt-BR': 'Frase secreta',
      'zh-Hans': '密码短语',
      'zh-Hant': '通關密語',
    },
  },
  choosePassphraseHelp: {
    id: 'interview.runtime.choosePassphraseHelp',
    message: {
      'en': 'Some answers on this screen are protected by a passphrase. Keep it safe: you will need it to see or change these answers later, and it cannot be recovered if it is forgotten.',
      'de': 'Einige Antworten auf dieser Seite werden durch eine Passphrase geschützt. Bewahren Sie sie sicher auf: Sie benötigen sie, um diese Antworten später anzuzeigen oder zu ändern, und sie kann nicht wiederhergestellt werden, wenn sie vergessen wird.',
      'es': 'Algunas respuestas de esta pantalla están protegidas por una frase de contraseña. Guárdala en un lugar seguro: la necesitarás para ver o cambiar estas respuestas más adelante, y no se puede recuperar si la olvidas.',
      'fr': 'Certaines réponses de cet écran sont protégées par une phrase secrète. Conservez-la en lieu sûr : vous en aurez besoin pour afficher ou modifier ces réponses plus tard, et elle ne pourra pas être récupérée si vous l’oubliez.',
      'it': 'Alcune risposte in questa schermata sono protette da una passphrase. Conservala al sicuro: ti servirà per vedere o modificare queste risposte in seguito, e non potrà essere recuperata se la dimentichi.',
      'nl': 'Sommige antwoorden op dit scherm worden beschermd met een wachtzin. Bewaar hem goed: je hebt hem later nodig om deze antwoorden te bekijken of te wijzigen, en hij kan niet worden hersteld als je hem vergeet.',
      'pt-BR':
        'Algumas respostas desta tela são protegidas por uma frase secreta. Guarde-a em segurança: você precisará dela para ver ou alterar essas respostas depois, e ela não poderá ser recuperada se for esquecida.',
      'zh-Hans':
        '此页面上的部分回答受密码短语保护。请妥善保管密码短语：之后查看或修改这些回答时需要用到它，一旦忘记将无法找回。',
      'zh-Hant':
        '此畫面上的部分回答受通關密語保護。請妥善保管通關密語：之後查看或修改這些回答時需要用到它，一旦忘記將無法找回。',
    },
  },
  passphraseIncorrect: {
    id: 'interview.runtime.passphraseIncorrect',
    message: {
      'en': 'This passphrase does not match the one used earlier in this interview. Check it and try again.',
      'de': 'Diese Passphrase stimmt nicht mit der überein, die zuvor in diesem Interview verwendet wurde. Bitte prüfen Sie sie und versuchen Sie es erneut.',
      'es': 'Esta frase de contraseña no coincide con la que se usó antes en esta entrevista. Compruébala e inténtalo de nuevo.',
      'fr': 'Cette phrase secrète ne correspond pas à celle utilisée plus tôt dans cet entretien. Vérifiez-la et réessayez.',
      'it': 'Questa passphrase non corrisponde a quella usata in precedenza in questa intervista. Controllala e riprova.',
      'nl': 'Deze wachtzin komt niet overeen met de wachtzin die eerder in dit interview is gebruikt. Controleer hem en probeer het opnieuw.',
      'pt-BR':
        'Esta frase secreta não corresponde à usada anteriormente nesta entrevista. Verifique-a e tente novamente.',
      'zh-Hans':
        '此密码短语与本次访谈中先前使用的密码短语不一致。请检查后重试。',
      'zh-Hant':
        '此通關密語與本次訪談先前使用的通關密語不符。請檢查後再試一次。',
    },
  },
  protectedAnswersLocked: {
    id: 'interview.runtime.protectedAnswersLocked',
    message: {
      'en': 'Some answers here are protected by your passphrase. Enter your passphrase to see and change them.',
      'de': 'Einige Antworten hier sind durch Ihre Passphrase geschützt. Geben Sie Ihre Passphrase ein, um sie anzuzeigen und zu ändern.',
      'es': 'Algunas respuestas de aquí están protegidas por tu frase de contraseña. Introduce tu frase de contraseña para verlas y cambiarlas.',
      'fr': 'Certaines réponses ici sont protégées par votre phrase secrète. Saisissez votre phrase secrète pour les afficher et les modifier.',
      'it': 'Alcune risposte qui sono protette dalla tua passphrase. Inserisci la passphrase per vederle e modificarle.',
      'nl': 'Sommige antwoorden hier zijn beschermd met je wachtzin. Voer je wachtzin in om ze te bekijken en te wijzigen.',
      'pt-BR':
        'Algumas respostas aqui estão protegidas pela sua frase secreta. Digite sua frase secreta para vê-las e alterá-las.',
      'zh-Hans':
        '此处的部分回答受您的密码短语保护。请输入您的密码短语以查看和修改这些回答。',
      'zh-Hant':
        '此處的部分回答受您的通關密語保護。請輸入您的通關密語以查看及修改這些回答。',
    },
  },
  protectedAnswersNotSaved: {
    id: 'interview.runtime.protectedAnswersNotSaved',
    message: {
      'en': 'Your answers have not been saved. Enter your passphrase, then try again.',
      'de': 'Ihre Antworten wurden nicht gespeichert. Geben Sie Ihre Passphrase ein und versuchen Sie es dann erneut.',
      'es': 'Tus respuestas no se han guardado. Introduce tu frase de contraseña y vuelve a intentarlo.',
      'fr': 'Vos réponses n’ont pas été enregistrées. Saisissez votre phrase secrète, puis réessayez.',
      'it': 'Le tue risposte non sono state salvate. Inserisci la passphrase, poi riprova.',
      'nl': 'Je antwoorden zijn niet opgeslagen. Voer je wachtzin in en probeer het daarna opnieuw.',
      'pt-BR':
        'Suas respostas não foram salvas. Digite sua frase secreta e tente novamente.',
      'zh-Hans': '您的回答尚未保存。请输入您的密码短语，然后重试。',
      'zh-Hant': '您的回答尚未儲存。請輸入您的通關密語，然後再試一次。',
    },
  },
  protectedAnswersUnavailable: {
    id: 'interview.runtime.protectedAnswersUnavailable',
    message: {
      'en': 'Answers protected by a passphrase cannot be shown or saved in this interview. Please let the person who recruited you to this study know.',
      'de': 'Durch eine Passphrase geschützte Antworten können in diesem Interview nicht angezeigt oder gespeichert werden. Bitte informieren Sie die Person, die Sie für diese Studie gewonnen hat.',
      'es': 'Las respuestas protegidas por una frase de contraseña no se pueden mostrar ni guardar en esta entrevista. Avisa a la persona que te invitó a participar en este estudio.',
      'fr': 'Les réponses protégées par une phrase secrète ne peuvent être ni affichées ni enregistrées dans cet entretien. Veuillez en informer la personne responsable de votre recrutement dans cette étude.',
      'it': 'Le risposte protette da una passphrase non possono essere mostrate né salvate in questa intervista. Avvisa la persona che ti ha invitato a partecipare a questo studio.',
      'nl': 'Antwoorden die met een wachtzin zijn beschermd, kunnen in dit interview niet worden getoond of opgeslagen. Laat het de persoon weten die je voor dit onderzoek heeft geworven.',
      'pt-BR':
        'Respostas protegidas por uma frase secreta não podem ser exibidas nem salvas nesta entrevista. Avise a pessoa que recrutou você para este estudo.',
      'zh-Hans':
        '本次访谈无法显示或保存受密码短语保护的回答。请告知招募您参与本研究的人员。',
      'zh-Hant':
        '本次訪談無法顯示或儲存受通關密語保護的回答。請告知邀請您參加本研究的人員。',
    },
  },
  answerUnavailable: {
    id: 'interview.runtime.answerUnavailable',
    message: {
      'en': 'Answer unavailable',
      'de': 'Antwort nicht verfügbar',
      'es': 'Respuesta no disponible',
      'fr': 'Réponse indisponible',
      'it': 'Risposta non disponibile',
      'nl': 'Antwoord niet beschikbaar',
      'pt-BR': 'Resposta indisponível',
      'zh-Hans': '回答不可用',
      'zh-Hant': '回答不可用',
    },
  },
  answerUnavailableKept: {
    id: 'interview.runtime.answerUnavailableKept',
    message: {
      'en': 'This answer was saved earlier but cannot be shown here. Entering a new answer will replace it, so leave the field empty to keep the earlier answer.',
      'de': 'Diese Antwort wurde zuvor gespeichert, kann hier aber nicht angezeigt werden. Wenn Sie eine neue Antwort eingeben, ersetzt sie diese; lassen Sie das Feld leer, um die frühere Antwort zu behalten.',
      'es': 'Esta respuesta se guardó antes, pero no se puede mostrar aquí. Si introduces una nueva respuesta, sustituirá a esta; deja el campo vacío para conservar la respuesta anterior.',
      'fr': 'Cette réponse a été enregistrée plus tôt, mais ne peut pas être affichée ici. Saisir une nouvelle réponse remplacera celle-ci ; laissez le champ vide pour conserver la réponse précédente.',
      'it': 'Questa risposta è stata salvata in precedenza, ma non può essere mostrata qui. Inserire una nuova risposta la sostituirà; lascia il campo vuoto per conservare la risposta precedente.',
      'nl': 'Dit antwoord is eerder opgeslagen, maar kan hier niet worden getoond. Een nieuw antwoord invoeren vervangt het; laat het veld leeg om het eerdere antwoord te behouden.',
      'pt-BR':
        'Esta resposta foi salva anteriormente, mas não pode ser exibida aqui. Digitar uma nova resposta vai substituí-la; deixe o campo vazio para manter a resposta anterior.',
      'zh-Hans':
        '此回答先前已保存，但无法在此显示。输入新的回答将替换它；如要保留先前的回答，请将此处留空。',
      'zh-Hant':
        '此回答先前已儲存，但無法在此顯示。輸入新的回答將取代它；如要保留先前的回答，請將此處留空。',
    },
  },
  confirmPassphrase: {
    id: 'interview.interfaces.confirmPassphrase',
    message: {
      'en': 'Confirm Passphrase',
      'de': 'Passphrase bestätigen',
      'es': 'Confirmar frase de contraseña',
      'fr': 'Confirmer la phrase secrète',
      'it': 'Conferma la passphrase',
      'nl': 'Wachtzin bevestigen',
      'pt-BR': 'Confirmar frase secreta',
      'zh-Hans': '确认密码短语',
      'zh-Hant': '確認通關密語',
    },
  },
  passphraseAccepted: {
    id: 'interview.interfaces.passphraseAccepted',
    message: {
      'en': 'Passphrase accepted! Click "Next" to continue.',
      'de': 'Passphrase akzeptiert! Klicken Sie auf „Weiter“, um fortzufahren.',
      'es': '¡Frase de contraseña aceptada! Pulsa la flecha de avance para continuar.',
      'fr': 'Phrase secrète acceptée ! Cliquez sur « Suivant » pour continuer.',
      'it': 'Passphrase accettata! Fai clic su «Avanti» per continuare.',
      'nl': 'Wachtzin geaccepteerd! Klik op “Volgende” om verder te gaan.',
      'pt-BR': 'Frase secreta aceita! Clique em “Avançar” para continuar.',
      'zh-Hans': '密码短语验证通过！点击“下一步”继续。',
      'zh-Hant': '通關密語驗證成功！請點選「下一步」繼續。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const FORMS_INTERFACE_TEXT = {
  discardChanges: {
    id: 'interview.interfaces.discardChanges',
    message: {
      'en': 'Discard changes',
      'de': 'Änderungen verwerfen',
      'es': 'Descartar cambios',
      'fr': 'Abandonner les modifications',
      'it': 'Scarta le modifiche',
      'nl': 'Wijzigingen verwerpen',
      'pt-BR': 'Descartar alterações',
      'zh-Hans': '放弃更改',
      'zh-Hant': '捨棄變更',
    },
  },
  discardChangesTitle: {
    id: 'interview.interfaces.discardChangesTitle',
    message: {
      'en': 'Discard changes?',
      'de': 'Änderungen verwerfen?',
      'es': '¿Descartar los cambios?',
      'fr': 'Abandonner les modifications ?',
      'it': 'Vuoi scartare le modifiche?',
      'nl': 'Wijzigingen verwerpen?',
      'pt-BR': 'Descartar alterações?',
      'zh-Hans': '放弃更改？',
      'zh-Hant': '要捨棄變更嗎？',
    },
  },
  discardChangesDescription: {
    id: 'interview.interfaces.discardChangesDescription',
    message: {
      'en': 'This form contains invalid data, so it cannot be saved. If you continue it will be reset, and your changes will be lost. Do you want to discard your changes?',
      'de': 'Dieses Formular enthält ungültige Angaben und kann daher nicht gespeichert werden. Wenn Sie fortfahren, wird es zurückgesetzt und Ihre Änderungen gehen verloren. Möchten Sie Ihre Änderungen verwerfen?',
      'es': 'Este formulario contiene datos que no son válidos y no se puede guardar. Si continúas, se restablecerá y se perderán los cambios. ¿Quieres descartar los cambios?',
      'fr': 'Ce formulaire contient des données non valides et ne peut donc pas être enregistré. Si vous continuez, il sera réinitialisé et vos modifications seront perdues. Voulez-vous abandonner vos modifications ?',
      'it': 'Questo modulo contiene dati non validi, quindi non può essere salvato. Se continui, verrà reimpostato e le modifiche andranno perse. Vuoi scartare le modifiche?',
      'nl': 'Dit formulier bevat ongeldige gegevens en kan daarom niet worden opgeslagen. Als je doorgaat, wordt het formulier teruggezet en gaan je wijzigingen verloren. Wil je je wijzigingen verwerpen?',
      'pt-BR':
        'Este formulário contém dados inválidos e, por isso, não pode ser salvo. Se você continuar, ele será redefinido e suas alterações serão perdidas. Deseja descartar suas alterações?',
      'zh-Hans':
        '此表单包含无效数据，因此无法保存。如果继续，表单将被重置，您的更改将会丢失。是否放弃更改？',
      'zh-Hant':
        '此表單含有無效的資料，因此無法儲存。如果繼續，表單將會重設，您所做的變更也會遺失。要捨棄變更嗎？',
    },
  },
  yes: {
    id: 'frescoUi.booleanField.yes',
    message: {
      'en': 'Yes',
      'de': 'Ja',
      'es': 'Sí',
      'fr': 'Oui',
      'it': 'Sì',
      'nl': 'Ja',
      'pt-BR': 'Sim',
      'zh-Hans': '是',
      'zh-Hant': '是',
    },
  },
  no: {
    id: 'frescoUi.booleanField.no',
    message: {
      'en': 'No',
      'de': 'Nein',
      'es': 'No',
      'fr': 'Non',
      'it': 'No',
      'nl': 'Nee',
      'pt-BR': 'Não',
      'zh-Hans': '否',
      'zh-Hant': '否',
    },
  },
  submitFailed: {
    id: 'frescoUi.form.submitFailed',
    message: {
      'en': 'An error occurred while submitting the form.',
      'de': 'Beim Absenden des Formulars ist ein Fehler aufgetreten.',
      'es': 'Se ha producido un error al enviar el formulario.',
      'fr': 'Une erreur s’est produite lors de l’envoi du formulaire.',
      'it': 'Si è verificato un errore durante l’invio del modulo.',
      'nl': 'Er is een fout opgetreden bij het versturen van het formulier.',
      'pt-BR': 'Ocorreu um erro ao enviar o formulário.',
      'zh-Hans': '提交表单时发生错误。',
      'zh-Hant': '送出表單時發生錯誤。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;
