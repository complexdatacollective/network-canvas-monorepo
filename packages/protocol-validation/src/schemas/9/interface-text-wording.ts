import type { MessageArguments } from '../../localization/messageArguments.ts';
import type { LocalizedStringFormat } from './localized-string.ts';
import { ADD_NAME_PLACEHOLDER } from './stage-wording/network-composer.ts';
import type { SuppliedWording } from './supplied-stage-setting.ts';

// The wording Network Canvas supplies for the interface text a protocol holds
// (`interface-text.ts`), in every language Network Canvas supplies, with the
// arguments the English message uses. Each entry's English is the English of
// the message it stands in for, as the interview, fresco-ui and app-i18n word
// it; the exceptions are the entries that merge several messages
// (`buttons.yes`, `messages.error` and `search.searchLabel`, see their
// `ids`). The interview's own messages are written in English only: their
// translations are these, and live nowhere else. Update the wording here when
// a message's English changes.

export type InterfaceTextEntry = Readonly<{
  /**
   * The messages the text stands in for in the interview and the controls it
   * uses: its wording shows wherever any of them is asked for. Usually one;
   * several where one wording serves them all (the Yes answer is also the
   * discard dialog's confirm button).
   */
  ids: readonly string[];
  arguments?: MessageArguments;
  /**
   * How the text is written: markdown for a message the researcher may format
   * and add links to, which the interview renders as markdown. Absent, the
   * text is plain.
   */
  format?: LocalizedStringFormat;
  message: SuppliedWording;
}>;

export const NAVIGATION_INTERFACE_TEXT = {
  exitInterview: {
    ids: ['interview.navigation.exitInterview'],
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
    ids: ['interview.navigation.exitInterviewDescription'],
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
  back: {
    ids: ['common.back'],
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
    ids: ['common.continue'],
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
  exitFailed: {
    ids: ['interview.navigation.exitFailed'],
    message: {
      'en': 'Your answers could not be saved, so the interview has not been closed. Please try again. If the problem continues, contact the study organizer.',
      'de': 'Ihre Antworten konnten nicht gespeichert werden, daher wurde das Interview nicht geschlossen. Bitte versuchen Sie es erneut. Wenn das Problem weiterhin besteht, wenden Sie sich an die Studienleitung.',
      'es': 'No se pudieron guardar tus respuestas, así que la entrevista no se ha cerrado. Inténtalo de nuevo. Si el problema continúa, ponte en contacto con la persona que organiza el estudio.',
      'fr': 'Vos réponses n’ont pas pu être enregistrées, l’entretien n’a donc pas été fermé. Veuillez réessayer. Si le problème persiste, contactez l’équipe responsable de l’étude.',
      'it': 'Non è stato possibile salvare le tue risposte, quindi l’intervista non è stata chiusa. Riprova. Se il problema persiste, contatta chi organizza lo studio.',
      'nl': 'Je antwoorden konden niet worden opgeslagen, daarom is het interview niet gesloten. Probeer het opnieuw. Blijft het probleem zich voordoen, neem dan contact op met de organisator van het onderzoek.',
      'pt-BR':
        'Não foi possível salvar suas respostas, por isso a entrevista não foi fechada. Tente novamente. Se o problema continuar, entre em contato com a equipe responsável pelo estudo.',
      'zh-Hans':
        '无法保存您的回答，因此访谈尚未关闭。请重试。如果问题仍然存在，请联系研究组织者。',
      'zh-Hant':
        '無法儲存您的回答，因此訪談尚未關閉。請再試一次。如果問題持續發生，請聯絡研究團隊。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const INTERVIEWER_INTERFACE_TEXT = {
  exitReview: {
    ids: ['interview.navigation.exitReview'],
    message: {
      'en': 'Exit review',
      'de': 'Durchsicht verlassen',
      'es': 'Salir de la revisión',
      'fr': 'Quitter la consultation',
      'it': 'Esci dalla revisione',
      'nl': 'Bekijkmodus verlaten',
      'pt-BR': 'Sair da revisão',
      'zh-Hans': '退出查看',
      'zh-Hant': '離開檢閱',
    },
  },
  exitReviewTitle: {
    ids: ['interview.navigation.exitReviewTitle'],
    message: {
      'en': 'Exit this review?',
      'de': 'Diese Durchsicht verlassen?',
      'es': '¿Salir de esta revisión?',
      'fr': 'Quitter cette consultation ?',
      'it': 'Vuoi uscire da questa revisione?',
      'nl': 'Bekijkmodus verlaten?',
      'pt-BR': 'Sair desta revisão?',
      'zh-Hans': '退出此次查看？',
      'zh-Hant': '要離開這次檢閱嗎？',
    },
  },
  exitReviewDescription: {
    ids: ['interview.navigation.exitReviewDescription'],
    message: {
      'en': 'Changes made during this review will not be saved.',
      'de': 'Änderungen, die Sie während dieser Durchsicht vornehmen, werden nicht gespeichert.',
      'es': 'Los cambios realizados durante esta revisión no se guardarán.',
      'fr': 'Les modifications apportées pendant cette consultation ne seront pas enregistrées.',
      'it': 'Le modifiche apportate durante questa revisione non verranno salvate.',
      'nl': 'Wijzigingen die je in de bekijkmodus aanbrengt, worden niet opgeslagen.',
      'pt-BR': 'As alterações feitas durante esta revisão não serão salvas.',
      'zh-Hans': '查看期间所做的更改不会被保存。',
      'zh-Hant': '在這次檢閱中所做的變更不會儲存。',
    },
  },
  hiddenScreen: {
    ids: ['interview.runtime.hiddenByAnswers'],
    message: {
      'en': 'Hidden by answers',
      'de': 'Durch Antworten ausgeblendet',
      'es': 'Oculta por las respuestas',
      'fr': 'Masqué par les réponses',
      'it': 'Nascosta in base alle risposte',
      'nl': 'Verborgen door antwoorden',
      'pt-BR': 'Oculta pelas respostas',
      'zh-Hans': '因回答而隐藏',
      'zh-Hant': '因回答而隱藏',
    },
  },
  outsidePath: {
    ids: ['interview.runtime.outsideCurrentPath'],
    message: {
      'en': 'Outside current path',
      'de': 'Außerhalb des aktuellen Verlaufs',
      'es': 'Fuera del recorrido actual',
      'fr': 'En dehors du parcours actuel',
      'it': 'Fuori dal percorso attuale',
      'nl': 'Buiten het huidige pad',
      'pt-BR': 'Fora do caminho atual',
      'zh-Hans': '不在当前路径中',
      'zh-Hant': '不在目前路徑上',
    },
  },
  showScreenTitle: {
    ids: ['interview.navigation.showTitle'],
    message: {
      'en': 'Show this screen?',
      'de': 'Diese Seite anzeigen?',
      'es': '¿Mostrar esta pantalla?',
      'fr': 'Afficher cet écran ?',
      'it': 'Vuoi mostrare questa schermata?',
      'nl': 'Dit scherm tonen?',
      'pt-BR': 'Mostrar esta tela?',
      'zh-Hans': '显示此页面？',
      'zh-Hant': '要顯示此畫面嗎？',
    },
  },
  hiddenScreenDescription: {
    ids: ['interview.navigation.hiddenScreen'],
    message: {
      'en': 'This screen is hidden based on the answers given so far. Do you want to show it anyway?',
      'de': 'Diese Seite ist aufgrund der bisherigen Antworten ausgeblendet. Möchten Sie sie trotzdem anzeigen?',
      'es': 'Esta pantalla está oculta según las respuestas dadas hasta ahora. ¿Quieres mostrarla de todos modos?',
      'fr': 'Cet écran est masqué en fonction des réponses données jusqu’à présent. Voulez-vous quand même l’afficher ?',
      'it': 'Questa schermata è nascosta in base alle risposte date finora. Vuoi mostrarla comunque?',
      'nl': 'Dit scherm is verborgen op basis van de antwoorden die tot nu toe zijn gegeven. Wil je het toch tonen?',
      'pt-BR':
        'Esta tela está oculta com base nas respostas dadas até agora. Deseja mostrá-la mesmo assim?',
      'zh-Hans': '根据目前的回答，此页面已被隐藏。仍要显示吗？',
      'zh-Hant': '根據目前的回答，此畫面已隱藏。仍要顯示嗎？',
    },
  },
  outsidePathDescription: {
    ids: ['interview.navigation.outsidePath'],
    message: {
      'en': 'This screen is outside the current interview path based on the answers given so far. Do you want to show it anyway?',
      'de': 'Diese Seite liegt aufgrund der bisherigen Antworten außerhalb des aktuellen Interviewverlaufs. Möchten Sie sie trotzdem anzeigen?',
      'es': 'Esta pantalla queda fuera del recorrido actual de la entrevista según las respuestas dadas hasta ahora. ¿Quieres mostrarla de todos modos?',
      'fr': 'Cet écran se trouve en dehors du parcours actuel de l’entretien, compte tenu des réponses données jusqu’à présent. Voulez-vous quand même l’afficher ?',
      'it': 'Questa schermata è al di fuori del percorso attuale dell’intervista, in base alle risposte date finora. Vuoi mostrarla comunque?',
      'nl': 'Dit scherm valt op basis van de antwoorden die tot nu toe zijn gegeven buiten het huidige pad van het interview. Wil je het toch tonen?',
      'pt-BR':
        'Esta tela está fora do caminho atual da entrevista, com base nas respostas dadas até agora. Deseja mostrá-la mesmo assim?',
      'zh-Hans': '根据目前的回答，此页面不在当前的访谈路径中。仍要显示吗？',
      'zh-Hant': '根據目前的回答，此畫面不在目前的訪談路徑上。仍要顯示嗎？',
    },
  },
  showScreen: {
    ids: ['interview.navigation.showScreen'],
    message: {
      'en': 'Show screen',
      'de': 'Seite anzeigen',
      'es': 'Mostrar pantalla',
      'fr': 'Afficher l’écran',
      'it': 'Mostra la schermata',
      'nl': 'Scherm tonen',
      'pt-BR': 'Mostrar tela',
      'zh-Hans': '显示页面',
      'zh-Hant': '顯示畫面',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const BUTTONS_INTERFACE_TEXT = {
  cancel: {
    ids: ['common.cancel'],
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
    ids: ['common.done'],
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
    ids: ['common.delete'],
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
  yes: {
    ids: ['frescoUi.booleanField.yes', 'interview.interfaces.discardChanges'],
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
    ids: ['frescoUi.booleanField.no'],
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
  save: {
    ids: ['common.save'],
    message: {
      'en': 'Save',
      'de': 'Speichern',
      'es': 'Guardar',
      'fr': 'Enregistrer',
      'it': 'Salva',
      'nl': 'Opslaan',
      'pt-BR': 'Salvar',
      'zh-Hans': '保存',
      'zh-Hant': '儲存',
    },
  },
  dontKnow: {
    ids: ['interview.interfaces.dontKnow'],
    message: {
      'en': 'Don’t know',
      'de': 'Weiß ich nicht',
      'es': 'No lo sé',
      'fr': 'Je ne sais pas',
      'it': 'Non lo so',
      'nl': 'Weet ik niet',
      'pt-BR': 'Não sei',
      'zh-Hans': '不知道',
      'zh-Hant': '不知道',
    },
  },
  pauseLayout: {
    ids: ['interview.interfaces.pauseLayout'],
    message: {
      'en': 'Pause automatic layout',
      'de': 'Automatisches Layout pausieren',
      'es': 'Pausar la disposición automática',
      'fr': 'Suspendre la disposition automatique',
      'it': 'Sospendi la disposizione automatica',
      'nl': 'Automatische lay-out pauzeren',
      'pt-BR': 'Pausar a disposição automática',
      'zh-Hans': '暂停自动布局',
      'zh-Hant': '暫停自動版面配置',
    },
  },
  resumeLayout: {
    ids: ['interview.interfaces.resumeLayout'],
    message: {
      'en': 'Resume automatic layout',
      'de': 'Automatisches Layout fortsetzen',
      'es': 'Reanudar la disposición automática',
      'fr': 'Reprendre la disposition automatique',
      'it': 'Riprendi la disposizione automatica',
      'nl': 'Automatische lay-out hervatten',
      'pt-BR': 'Retomar a disposição automática',
      'zh-Hans': '恢复自动布局',
      'zh-Hant': '繼續自動版面配置',
    },
  },
  copy: {
    ids: ['interview.runtime.copy'],
    message: {
      'en': 'Copy',
      'de': 'Kopieren',
      'es': 'Copiar',
      'fr': 'Copier',
      'it': 'Copia',
      'nl': 'Kopiëren',
      'pt-BR': 'Copiar',
      'zh-Hans': '复制',
      'zh-Hant': '複製',
    },
  },
  copied: {
    ids: ['interview.runtime.copied'],
    message: {
      'en': 'Copied',
      'de': 'Kopiert',
      'es': 'Copiado',
      'fr': 'Copié',
      'it': 'Copiato',
      'nl': 'Gekopieerd',
      'pt-BR': 'Copiado',
      'zh-Hans': '已复制',
      'zh-Hant': '已複製',
    },
  },
  zoomOut: {
    ids: ['interview.interfaces.zoomOut'],
    message: {
      'en': 'Zoom out',
      'de': 'Verkleinern',
      'es': 'Alejar',
      'fr': 'Zoom arrière',
      'it': 'Riduci',
      'nl': 'Uitzoomen',
      'pt-BR': 'Diminuir zoom',
      'zh-Hans': '缩小',
      'zh-Hant': '縮小',
    },
  },

  zoomIn: {
    ids: ['interview.interfaces.zoomIn'],
    message: {
      'en': 'Zoom in',
      'de': 'Vergrößern',
      'es': 'Acercar',
      'fr': 'Zoom avant',
      'it': 'Ingrandisci',
      'nl': 'Inzoomen',
      'pt-BR': 'Aumentar zoom',
      'zh-Hans': '放大',
      'zh-Hant': '放大',
    },
  },

  undo: {
    ids: ['interview.interfaces.undo'],
    message: {
      'en': 'Undo',
      'de': 'Rückgängig',
      'es': 'Deshacer',
      'fr': 'Annuler',
      'it': 'Annulla',
      'nl': 'Ongedaan maken',
      'pt-BR': 'Desfazer',
      'zh-Hans': '撤销',
      'zh-Hant': '復原',
    },
  },

  redo: {
    ids: ['interview.interfaces.redo'],
    message: {
      'en': 'Redo',
      'de': 'Wiederholen',
      'es': 'Rehacer',
      'fr': 'Rétablir',
      'it': 'Ripeti',
      'nl': 'Opnieuw uitvoeren',
      'pt-BR': 'Refazer',
      'zh-Hans': '重做',
      'zh-Hant': '重做',
    },
  },

  skip: {
    ids: ['interview.familyPedigree.skipStep'],
    message: {
      'en': 'Skip',
      'de': 'Überspringen',
      'es': 'Omitir',
      'fr': 'Passer',
      'it': 'Salta',
      'nl': 'Overslaan',
      'pt-BR': 'Pular',
      'zh-Hans': '跳过',
      'zh-Hant': '略過',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const MESSAGES_INTERFACE_TEXT = {
  stageError: {
    ids: ['interview.runtime.taskErrorDescription'],
    format: 'markdown',
    message: {
      'en': '# There was an error\n\nThere was an error with the interview software, and this task could not be displayed.\n\nSome tasks, such as maps, need an internet connection, so check your connection and then try refreshing the page.\n\nIf the problem persists, please contact the study organizer and send them the debug information, which you can copy with the button below. You may be able to continue your interview by clicking the next button.',
      'en-GB':
        '# There was an error\n\nThere was an error with the interview software, and this task could not be displayed.\n\nSome tasks, such as maps, need an internet connection, so check your connection and then try refreshing the page.\n\nIf the problem persists, please contact the study organiser and send them the debug information, which you can copy with the button below. You may be able to continue your interview by clicking the next button.',
      'de': '# Es ist ein Fehler aufgetreten\n\nIn der Interview-Software ist ein Fehler aufgetreten, daher konnte diese Aufgabe nicht angezeigt werden.\n\nManche Aufgaben (zum Beispiel Karten) benötigen eine Internetverbindung. Prüfen Sie daher Ihre Verbindung und versuchen Sie dann, die Seite neu zu laden.\n\nWenn das Problem weiterhin besteht, wenden Sie sich bitte an die Studienleitung und senden Sie ihr die Diagnoseinformationen, die Sie mit der Schaltfläche unten kopieren können. Möglicherweise können Sie das Interview fortsetzen, indem Sie auf die Schaltfläche zum nächsten Schritt klicken.',
      'es': '# Se produjo un error\n\nSe produjo un error en el programa de la entrevista y no se pudo mostrar esta tarea.\n\nAlgunas tareas, como los mapas, necesitan conexión a internet, así que comprueba tu conexión y después prueba a actualizar la página.\n\nSi el problema persiste, ponte en contacto con la persona que organiza el estudio y envíale la información de diagnóstico, que puedes copiar con el botón de abajo. Quizá puedas continuar la entrevista pulsando el botón para ir al siguiente paso.',
      'fr': '# Une erreur s’est produite\n\nUne erreur s’est produite dans le logiciel d’entretien et cette tâche n’a pas pu être affichée.\n\nCertaines tâches, comme les cartes, nécessitent une connexion Internet : vérifiez votre connexion, puis essayez d’actualiser la page.\n\nSi le problème persiste, contactez l’équipe responsable de l’étude et transmettez-lui les informations de débogage, que vous pouvez copier avec le bouton ci-dessous. Vous pourrez peut-être poursuivre votre entretien en cliquant sur le bouton d’étape suivante.',
      'it': '# Si è verificato un errore\n\nSi è verificato un errore nel software dell’intervista e non è stato possibile visualizzare questa attività.\n\nAlcune attività, come le mappe, richiedono una connessione a internet: controlla la connessione, poi prova ad aggiornare la pagina.\n\nSe il problema persiste, contatta chi organizza lo studio e inviagli le informazioni di debug, che puoi copiare con il pulsante qui sotto. Potresti riuscire a continuare l’intervista facendo clic sul pulsante per andare avanti.',
      'nl': '# Er is een fout opgetreden\n\nEr is een fout opgetreden in de interviewsoftware, waardoor deze taak niet kan worden weergegeven.\n\nSommige taken, zoals kaarten, hebben een internetverbinding nodig. Controleer je verbinding en probeer daarna de pagina te vernieuwen.\n\nBlijft het probleem bestaan, neem dan contact op met de organisator van het onderzoek en stuur de foutopsporingsgegevens, die je met de knop hieronder kunt kopiëren. Mogelijk kun je verder met je interview door op de knop voor de volgende stap te klikken.',
      'pt-BR':
        '# Ocorreu um erro\n\nOcorreu um erro no software da entrevista, e esta tarefa não pôde ser exibida.\n\nAlgumas tarefas, como mapas, precisam de conexão com a internet: verifique sua conexão e depois tente atualizar a página.\n\nSe o problema persistir, entre em contato com a equipe responsável pelo estudo e envie os dados de depuração, que você pode copiar com o botão abaixo. Talvez você consiga continuar sua entrevista clicando no botão de próxima etapa.',
      'zh-Hans':
        '# 出现错误\n\n访谈软件出现错误，无法显示此任务。\n\n某些任务（例如地图）需要网络连接，请先检查网络连接，然后尝试刷新页面。\n\n如果问题仍然存在，请联系研究组织者，并将调试信息发送给他们（可使用下方的按钮复制该信息）。您也许可以点击下一步按钮继续访谈。',
      'zh-Hant':
        '# 發生錯誤\n\n訪談軟體發生錯誤，因此無法顯示此任務。\n\n部分任務（例如地圖）需要網路連線，請先檢查網路連線，然後嘗試重新整理頁面。\n\n如果問題持續發生，請聯絡研究團隊，並將偵錯資訊傳送給他們。您可以使用下方的按鈕複製這些資訊。您或許可以點選下一步按鈕，繼續進行訪談。',
    },
  },
  itemUnavailable: {
    ids: ['interview.runtime.itemUnavailable'],
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
  error: {
    ids: ['common.genericError', 'frescoUi.form.submitFailed'],
    message: {
      'en': 'An error occurred.',
      'de': 'Es ist ein Fehler aufgetreten.',
      'es': 'Se ha producido un error.',
      'fr': 'Une erreur s’est produite.',
      'it': 'Si è verificato un errore.',
      'nl': 'Er is een fout opgetreden.',
      'pt-BR': 'Ocorreu um erro.',
      'zh-Hans': '发生错误。',
      'zh-Hant': '發生錯誤。',
    },
  },
  externalDataError: {
    ids: ['interview.interfaces.externalDataError'],
    message: {
      'en': 'External data could not be loaded.',
      'de': 'Externe Daten konnten nicht geladen werden.',
      'es': 'No se pudieron cargar los datos externos.',
      'fr': 'Les données externes n’ont pas pu être chargées.',
      'it': 'Non è stato possibile caricare i dati esterni.',
      'nl': 'Externe gegevens konden niet worden geladen.',
      'pt-BR': 'Não foi possível carregar os dados externos.',
      'zh-Hans': '无法加载外部数据。',
      'zh-Hant': '無法載入外部資料。',
    },
  },
  loading: {
    ids: ['common.loading'],
    message: {
      'en': 'Loading…',
      'de': 'Wird geladen…',
      'es': 'Cargando…',
      'fr': 'Chargement…',
      'it': 'Caricamento…',
      'nl': 'Laden…',
      'pt-BR': 'Carregando…',
      'zh-Hans': '正在加载…',
      'zh-Hant': '正在載入…',
    },
  },
  unnamed: {
    ids: ['interview.runtime.unnamed'],
    message: {
      'en': 'Unnamed',
      'de': 'Ohne Namen',
      'es': 'Sin nombre',
      'fr': 'Sans nom',
      'it': 'Senza nome',
      'nl': 'Zonder naam',
      'pt-BR': 'Sem nome',
      'zh-Hans': '未命名',
      'zh-Hant': '未命名',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const SEARCH_INTERFACE_TEXT = {
  searchLabel: {
    ids: [
      'common.search',
      'interview.runtime.filter',
      'frescoUi.collectionFilterInput.searchPlaceholder',
    ],
    message: {
      'en': 'Search',
      'de': 'Suchen',
      'es': 'Buscar',
      'fr': 'Rechercher',
      'it': 'Cerca',
      'nl': 'Zoeken',
      'pt-BR': 'Buscar',
      'zh-Hans': '搜索',
      'zh-Hant': '搜尋',
    },
  },
  searchNoMatch: {
    ids: ['interview.runtime.noSearchMatch'],
    message: {
      'en': 'Nothing matched your search term.',
      'de': 'Keine Treffer für Ihren Suchbegriff.',
      'es': 'No hay resultados que coincidan con tu búsqueda.',
      'fr': 'Aucun résultat ne correspond à votre recherche.',
      'it': 'Nessun risultato per il termine cercato.',
      'nl': 'Niets gevonden voor je zoekterm.',
      'pt-BR': 'Nenhum resultado corresponde ao termo buscado.',
      'zh-Hans': '没有与您的搜索词匹配的结果。',
      'zh-Hant': '找不到符合搜尋字詞的結果。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const PASSPHRASE_INTERFACE_TEXT = {
  passphrase: {
    ids: ['interview.runtime.passphrase'],
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
    ids: ['interview.runtime.choosePassphraseHelp'],
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
    ids: ['interview.runtime.passphraseIncorrect'],
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
    ids: ['interview.runtime.protectedAnswersLocked'],
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
    ids: ['interview.runtime.protectedAnswersNotSaved'],
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
    ids: ['interview.runtime.protectedAnswersUnavailable'],
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
    ids: ['interview.runtime.answerUnavailable'],
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
    ids: ['interview.runtime.answerUnavailableKept'],
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
    ids: ['interview.interfaces.confirmPassphrase'],
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
    ids: ['interview.interfaces.passphraseAccepted'],
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
  checkingPassphrase: {
    ids: ['interview.runtime.checkingPassphrase'],
    message: {
      'en': 'Checking your passphrase…',
      'de': 'Ihre Passphrase wird geprüft…',
      'es': 'Comprobando tu frase de contraseña…',
      'fr': 'Vérification de votre phrase secrète…',
      'it': 'Verifica della passphrase in corso…',
      'nl': 'Je wachtzin wordt gecontroleerd…',
      'pt-BR': 'Verificando sua frase secreta…',
      'zh-Hans': '正在检查您的密码短语…',
      'zh-Hant': '正在檢查您的通關密語…',
    },
  },
  passwordPlaceholder: {
    ids: ['frescoUi.passwordField.placeholder'],
    message: {
      'en': 'Enter password',
      'de': 'Passwort eingeben',
      'es': 'Introduce la contraseña',
      'fr': 'Saisissez le mot de passe',
      'it': 'Inserisci la password',
      'nl': 'Wachtwoord invoeren',
      'pt-BR': 'Digite a senha',
      'zh-Hans': '输入密码',
      'zh-Hant': '輸入密碼',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const FORMS_INTERFACE_TEXT = {
  discardChangesTitle: {
    ids: ['interview.interfaces.discardChangesTitle'],
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
    ids: ['interview.interfaces.discardChangesDescription'],
    message: {
      'en': 'Do you want to discard your changes?',
      'de': 'Möchten Sie Ihre Änderungen verwerfen?',
      'es': '¿Quieres descartar los cambios?',
      'fr': 'Voulez-vous abandonner vos modifications ?',
      'it': 'Vuoi scartare le modifiche?',
      'nl': 'Wil je je wijzigingen verwerpen?',
      'pt-BR': 'Deseja descartar suas alterações?',
      'zh-Hans': '是否放弃更改？',
      'zh-Hant': '要捨棄變更嗎？',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const VALIDATION_INTERFACE_TEXT = {
  required: {
    ids: ['frescoUi.validation.required'],
    message: {
      'en': 'You must answer this question before continuing.',
      'de': 'Sie müssen diese Frage beantworten, bevor Sie fortfahren können.',
      'es': 'Debes responder a esta pregunta antes de continuar.',
      'fr': 'Vous devez répondre à cette question avant de continuer.',
      'it': 'Devi rispondere a questa domanda prima di continuare.',
      'nl': 'Je moet deze vraag beantwoorden voordat je verdergaat.',
      'pt-BR': 'Você precisa responder a esta pergunta antes de continuar.',
      'zh-Hans': '您必须先回答此问题才能继续。',
      'zh-Hant': '請先回答此問題再繼續。',
    },
  },
  minLength: {
    ids: ['frescoUi.validation.minLengthError'],
    arguments: { min: { kind: 'plural' } },
    message: {
      'en': '{min, plural, one {Enter at least # character.} other {Enter at least # characters.}}',
      'de': '{min, plural, one {Geben Sie mindestens # Zeichen ein.} other {Geben Sie mindestens # Zeichen ein.}}',
      'es': '{min, plural, one {Introduce al menos # carácter.} other {Introduce al menos # caracteres.}}',
      'fr': '{min, plural, one {Saisissez au moins # caractère.} other {Saisissez au moins # caractères.}}',
      'it': '{min, plural, one {Inserisci almeno # carattere.} many {Inserisci almeno # di caratteri.} other {Inserisci almeno # caratteri.}}',
      'nl': '{min, plural, one {Voer minimaal # teken in.} other {Voer minimaal # tekens in.}}',
      'pt-BR':
        '{min, plural, one {Mínimo de caracteres: #} other {Mínimo de caracteres: #}}',
      'zh-Hans': '{min, plural, other {至少输入 # 个字符。}}',
      'zh-Hant': '{min, plural, other {請至少輸入 # 個字元。}}',
    },
  },
  maxLength: {
    ids: ['frescoUi.validation.maxLengthError'],
    arguments: { max: { kind: 'plural' } },
    message: {
      'en': '{max, plural, one {Enter at most # character.} other {Enter at most # characters.}}',
      'de': '{max, plural, one {Geben Sie höchstens # Zeichen ein.} other {Geben Sie höchstens # Zeichen ein.}}',
      'es': '{max, plural, one {Introduce como máximo # carácter.} other {Introduce como máximo # caracteres.}}',
      'fr': '{max, plural, one {Saisissez # caractère au maximum.} other {Saisissez # caractères au maximum.}}',
      'it': '{max, plural, one {Inserisci al massimo # carattere.} many {Inserisci al massimo # di caratteri.} other {Inserisci al massimo # caratteri.}}',
      'nl': '{max, plural, one {Voer maximaal # teken in.} other {Voer maximaal # tekens in.}}',
      'pt-BR':
        '{max, plural, one {Máximo de caracteres: #} other {Máximo de caracteres: #}}',
      'zh-Hans': '{max, plural, other {最多输入 # 个字符。}}',
      'zh-Hant': '{max, plural, other {最多可輸入 # 個字元。}}',
    },
  },
  minValue: {
    ids: ['frescoUi.validation.minValueError'],
    arguments: { min: { kind: 'text' } },
    message: {
      'en': 'Enter a value greater than or equal to {min}.',
      'de': 'Geben Sie einen Wert größer oder gleich {min} ein.',
      'es': 'Introduce un valor mayor o igual que {min}.',
      'fr': 'Saisissez une valeur supérieure ou égale à {min}.',
      'it': 'Inserisci un valore maggiore o uguale a {min}.',
      'nl': 'Voer een waarde in die groter is dan of gelijk is aan {min}.',
      'pt-BR': 'Digite um valor maior ou igual a {min}.',
      'zh-Hans': '请输入大于或等于 {min} 的值。',
      'zh-Hant': '請輸入大於或等於 {min} 的值。',
    },
  },
  maxValue: {
    ids: ['frescoUi.validation.maxValueError'],
    arguments: { max: { kind: 'text' } },
    message: {
      'en': 'Enter a value less than or equal to {max}.',
      'de': 'Geben Sie einen Wert kleiner oder gleich {max} ein.',
      'es': 'Introduce un valor menor o igual que {max}.',
      'fr': 'Saisissez une valeur inférieure ou égale à {max}.',
      'it': 'Inserisci un valore minore o uguale a {max}.',
      'nl': 'Voer een waarde in die kleiner is dan of gelijk is aan {max}.',
      'pt-BR': 'Digite um valor menor ou igual a {max}.',
      'zh-Hans': '请输入小于或等于 {max} 的值。',
      'zh-Hant': '請輸入小於或等於 {max} 的值。',
    },
  },
  minDate: {
    ids: ['frescoUi.validation.minDate'],
    arguments: { min: { kind: 'text' } },
    message: {
      'en': 'Must be on or after {min}.',
      'de': 'Darf nicht früher als {min} sein.',
      'es': 'Debe ser igual o posterior a {min}.',
      'fr': 'Au plus tôt : {min}.',
      'it': 'Non deve essere precedente a {min}.',
      'nl': 'Moet {min} of later zijn.',
      'pt-BR': 'Precisa ser igual ou posterior a {min}.',
      'zh-Hans': '必须在 {min} 或之后。',
      'zh-Hant': '必須在 {min} 或之後。',
    },
  },
  maxDate: {
    ids: ['frescoUi.validation.maxDate'],
    arguments: { max: { kind: 'text' } },
    message: {
      'en': 'Must be on or before {max}.',
      'de': 'Darf nicht später als {max} sein.',
      'es': 'Debe ser igual o anterior a {max}.',
      'fr': 'Au plus tard : {max}.',
      'it': 'Deve essere uguale o precedente a {max}.',
      'nl': 'Moet {max} of eerder zijn.',
      'pt-BR': 'Precisa ser igual ou anterior a {max}.',
      'zh-Hans': '必须在 {max} 或之前。',
      'zh-Hant': '必須在 {max} 或之前。',
    },
  },
  minSelected: {
    ids: ['frescoUi.validation.minSelectedError'],
    arguments: { count: { kind: 'plural' } },
    message: {
      'en': '{count, plural, one {Select at least # value.} other {Select at least # values.}}',
      'de': '{count, plural, one {Wählen Sie mindestens # Wert aus.} other {Wählen Sie mindestens # Werte aus.}}',
      'es': '{count, plural, one {Selecciona al menos # valor.} other {Selecciona al menos # valores.}}',
      'fr': '{count, plural, one {Sélectionnez au moins # valeur.} other {Sélectionnez au moins # valeurs.}}',
      'it': '{count, plural, one {Seleziona almeno # valore.} many {Seleziona almeno # di valori.} other {Seleziona almeno # valori.}}',
      'nl': '{count, plural, one {Selecteer minimaal # waarde.} other {Selecteer minimaal # waarden.}}',
      'pt-BR':
        '{count, plural, one {Mínimo de valores selecionados: #} other {Mínimo de valores selecionados: #}}',
      'zh-Hans': '{count, plural, other {至少选择 # 个值。}}',
      'zh-Hant': '{count, plural, other {請至少選取 # 項。}}',
    },
  },
  maxSelected: {
    ids: ['frescoUi.validation.maxSelectedError'],
    arguments: { count: { kind: 'plural' } },
    message: {
      'en': '{count, plural, one {Select a maximum of # value.} other {Select a maximum of # values.}}',
      'de': '{count, plural, one {Wählen Sie höchstens # Wert aus.} other {Wählen Sie höchstens # Werte aus.}}',
      'es': '{count, plural, one {Selecciona como máximo # valor.} other {Selecciona como máximo # valores.}}',
      'fr': '{count, plural, one {Sélectionnez # valeur au maximum.} other {Sélectionnez # valeurs au maximum.}}',
      'it': '{count, plural, one {Seleziona al massimo # valore.} many {Seleziona al massimo # di valori.} other {Seleziona al massimo # valori.}}',
      'nl': '{count, plural, one {Selecteer maximaal # waarde.} other {Selecteer maximaal # waarden.}}',
      'pt-BR':
        '{count, plural, one {Máximo de valores selecionados: #} other {Máximo de valores selecionados: #}}',
      'zh-Hans': '{count, plural, other {最多选择 # 个值。}}',
      'zh-Hant': '{count, plural, other {最多可選取 # 項。}}',
    },
  },
  unique: {
    ids: ['frescoUi.validation.uniqueError'],
    message: {
      'en': 'Must be unique.',
      'de': 'Muss eindeutig sein.',
      'es': 'Debe ser una respuesta única.',
      'fr': 'Doit être unique.',
      'it': 'Deve essere univoco.',
      'nl': 'Moet uniek zijn.',
      'pt-BR': 'Precisa ser único.',
      'zh-Hans': '必须唯一。',
      'zh-Hant': '必須是唯一值。',
    },
  },
  differentFrom: {
    ids: ['frescoUi.validation.differentFromError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be different from your answer to ''{label}''.} other {Your answer must be different from your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort muss sich von Ihrer Antwort auf „{label}“ unterscheiden.} other {Ihre Antwort muss sich von Ihrer vorherigen Antwort unterscheiden.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser distinta de tu respuesta a «{label}».} other {Tu respuesta debe ser distinta de la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être différente de votre réponse à « {label} ».} other {Votre réponse doit être différente de votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere diversa dalla risposta a «{label}».} other {La tua risposta deve essere diversa dalla risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord moet verschillen van je antwoord op “{label}”.} other {Je antwoord moet verschillen van je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser diferente da sua resposta a “{label}”.} other {Sua resposta precisa ser diferente da sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须与“{label}”的回答不同。} other {您的回答必须与之前的回答不同。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須與「{label}」的答案不同。} other {您的答案必須與先前的答案不同。}}',
    },
  },
  sameAs: {
    ids: ['frescoUi.validation.sameAsError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be the same as your answer to ''{label}''.} other {Your answer must be the same as your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort muss mit Ihrer Antwort auf „{label}“ übereinstimmen.} other {Ihre Antwort muss mit Ihrer vorherigen Antwort übereinstimmen.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser igual a tu respuesta a «{label}».} other {Tu respuesta debe ser igual a la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être identique à votre réponse à « {label} ».} other {Votre réponse doit être identique à votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere uguale alla risposta a «{label}».} other {La tua risposta deve essere uguale alla risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord moet hetzelfde zijn als je antwoord op “{label}”.} other {Je antwoord moet hetzelfde zijn als je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser igual à sua resposta a “{label}”.} other {Sua resposta precisa ser igual à sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须与“{label}”的回答相同。} other {您的回答必须与之前的回答相同。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須與「{label}」的答案相同。} other {您的答案必須與先前的答案相同。}}',
    },
  },
  greaterThan: {
    ids: ['frescoUi.validation.greaterThanError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be greater than your answer to ''{label}''.} other {Your answer must be greater than your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort muss größer sein als Ihre Antwort auf „{label}“.} other {Ihre Antwort muss größer sein als Ihre vorherige Antwort.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser mayor que tu respuesta a «{label}».} other {Tu respuesta debe ser mayor que la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être supérieure à votre réponse à « {label} ».} other {Votre réponse doit être supérieure à votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere maggiore della risposta a «{label}».} other {La tua risposta deve essere maggiore della risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord moet groter zijn dan je antwoord op “{label}”.} other {Je antwoord moet groter zijn dan je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser maior que a sua resposta a “{label}”.} other {Sua resposta precisa ser maior que a sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须大于“{label}”的回答。} other {您的回答必须大于之前的回答。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須大於「{label}」的答案。} other {您的答案必須大於先前的答案。}}',
    },
  },
  lessThan: {
    ids: ['frescoUi.validation.lessThanError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be less than your answer to ''{label}''.} other {Your answer must be less than your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort muss kleiner sein als Ihre Antwort auf „{label}“.} other {Ihre Antwort muss kleiner sein als Ihre vorherige Antwort.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser menor que tu respuesta a «{label}».} other {Tu respuesta debe ser menor que la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être inférieure à votre réponse à « {label} ».} other {Votre réponse doit être inférieure à votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere minore della risposta a «{label}».} other {La tua risposta deve essere minore della risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord moet kleiner zijn dan je antwoord op “{label}”.} other {Je antwoord moet kleiner zijn dan je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser menor que a sua resposta a “{label}”.} other {Sua resposta precisa ser menor que a sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须小于“{label}”的回答。} other {您的回答必须小于之前的回答。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須小於「{label}」的答案。} other {您的答案必須小於先前的答案。}}',
    },
  },
  greaterThanOrEqual: {
    ids: ['frescoUi.validation.greaterThanOrEqualError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be the same as or greater than your answer to ''{label}''.} other {Your answer must be the same as or greater than your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort muss mindestens so groß sein wie Ihre Antwort auf „{label}“.} other {Ihre Antwort muss mindestens so groß sein wie Ihre vorherige Antwort.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser igual o mayor que tu respuesta a «{label}».} other {Tu respuesta debe ser igual o mayor que la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être supérieure ou égale à votre réponse à « {label} ».} other {Votre réponse doit être supérieure ou égale à votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere maggiore o uguale alla risposta a «{label}».} other {La tua risposta deve essere maggiore o uguale alla risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord mag niet kleiner zijn dan je antwoord op “{label}”.} other {Je antwoord mag niet kleiner zijn dan je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser igual ou maior que a sua resposta a “{label}”.} other {Sua resposta precisa ser igual ou maior que a sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须等于或大于“{label}”的回答。} other {您的回答必须等于或大于之前的回答。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須等於或大於「{label}」的答案。} other {您的答案必須等於或大於先前的答案。}}',
    },
  },
  lessThanOrEqual: {
    ids: ['frescoUi.validation.lessThanOrEqualError'],
    arguments: {
      hasLabel: { kind: 'select', cases: ['true'] },
      label: { kind: 'text' },
    },
    message: {
      'en': "{hasLabel, select, true {Your answer must be the same as or less than your answer to ''{label}''.} other {Your answer must be the same as or less than your earlier answer.}}",
      'de': '{hasLabel, select, true {Ihre Antwort darf höchstens so groß sein wie Ihre Antwort auf „{label}“.} other {Ihre Antwort darf höchstens so groß sein wie Ihre vorherige Antwort.}}',
      'es': '{hasLabel, select, true {Tu respuesta debe ser igual o menor que tu respuesta a «{label}».} other {Tu respuesta debe ser igual o menor que la anterior.}}',
      'fr': '{hasLabel, select, true {Votre réponse doit être inférieure ou égale à votre réponse à « {label} ».} other {Votre réponse doit être inférieure ou égale à votre réponse précédente.}}',
      'it': '{hasLabel, select, true {La tua risposta deve essere minore o uguale alla risposta a «{label}».} other {La tua risposta deve essere minore o uguale alla risposta precedente.}}',
      'nl': '{hasLabel, select, true {Je antwoord mag niet groter zijn dan je antwoord op “{label}”.} other {Je antwoord mag niet groter zijn dan je eerdere antwoord.}}',
      'pt-BR':
        '{hasLabel, select, true {Sua resposta precisa ser igual ou menor que a sua resposta a “{label}”.} other {Sua resposta precisa ser igual ou menor que a sua resposta anterior.}}',
      'zh-Hans':
        '{hasLabel, select, true {您的回答必须等于或小于“{label}”的回答。} other {您的回答必须等于或小于之前的回答。}}',
      'zh-Hant':
        '{hasLabel, select, true {您的答案必須等於或小於「{label}」的答案。} other {您的答案必須等於或小於先前的答案。}}',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** The family tree view controls both pedigree stages show. */
export const FAMILY_TREE_VIEW_INTERFACE_TEXT = {
  zoomOutDescription: {
    ids: ['interview.familyPedigree.zoomOutDescription'],
    message: {
      'en': 'Make your family tree smaller, to see more of it at once.',
      'de': 'Verkleinern Sie Ihren Stammbaum, um mehr davon auf einmal zu sehen.',
      'es': 'Aleja la vista para ver más de tu árbol familiar a la vez.',
      'fr': 'Réduisez l’affichage de votre arbre généalogique pour en voir davantage à la fois.',
      'it': 'Riduci il tuo albero genealogico per vederne di più alla volta.',
      'nl': 'Maak je stamboom kleiner om er meer tegelijk van te zien.',
      'pt-BR':
        'Diminua o zoom para ver mais da sua árvore genealógica de uma vez.',
      'zh-Hans': '缩小您的家谱图，以便一次查看更多内容。',
      'zh-Hant': '縮小您的家譜圖，以便一次檢視更多內容。',
    },
  },
  zoomInDescription: {
    ids: ['interview.familyPedigree.zoomInDescription'],
    message: {
      'en': 'Make your family tree bigger, to see part of it more closely.',
      'de': 'Vergrößern Sie Ihren Stammbaum, um einen Teil davon genauer zu sehen.',
      'es': 'Acerca la vista para ver una parte de tu árbol familiar con más detalle.',
      'fr': 'Agrandissez l’affichage de votre arbre généalogique pour en voir une partie de plus près.',
      'it': 'Ingrandisci il tuo albero genealogico per vederne una parte più da vicino.',
      'nl': 'Maak je stamboom groter om een deel ervan van dichterbij te bekijken.',
      'pt-BR':
        'Aumente o zoom para ver uma parte da sua árvore genealógica mais de perto.',
      'zh-Hans': '放大您的家谱图，以便更仔细地查看其中一部分。',
      'zh-Hant': '放大您的家譜圖，以便更仔細地檢視其中一部分。',
    },
  },
  showWholeFamily: {
    ids: ['interview.familyPedigree.showWholeFamily'],
    message: {
      'en': 'Show the whole family',
      'de': 'Ganze Familie anzeigen',
      'es': 'Mostrar toda la familia',
      'fr': 'Afficher toute la famille',
      'it': 'Mostra tutta la famiglia',
      'nl': 'Hele familie tonen',
      'pt-BR': 'Mostrar a família inteira',
      'zh-Hans': '显示整个家庭',
      'zh-Hant': '顯示整個家庭',
    },
  },
  showWholeFamilyDescription: {
    ids: ['interview.familyPedigree.showWholeFamilyDescription'],
    message: {
      'en': 'Fit your whole family tree on the screen.',
      'de': 'Stellen Sie die Ansicht so ein, dass Ihr ganzer Stammbaum auf den Bildschirm passt.',
      'es': 'Ajusta la vista para que todo tu árbol familiar quepa en la pantalla.',
      'fr': 'Ajustez l’affichage pour que tout votre arbre généalogique tienne à l’écran.',
      'it': 'Adatta la vista per far stare tutto il tuo albero genealogico sullo schermo.',
      'nl': 'Pas de weergave aan zodat je hele stamboom op het scherm past.',
      'pt-BR':
        'Ajuste a visualização para que toda a sua árvore genealógica caiba na tela.',
      'zh-Hans': '调整视图，使您的整个家谱图显示在屏幕上。',
      'zh-Hant': '調整檢視，使您的整個家譜圖顯示在螢幕上。',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every Family Pedigree stage's own controls. */
export const FAMILY_PEDIGREE_INTERFACE_TEXT = {
  pointerToolDescription: {
    ids: ['interview.familyPedigree.pointerToolDescription'],
    message: {
      'en': 'Select a family member to edit their details or add their relatives.',
      'de': 'Wählen Sie ein Familienmitglied aus, um Angaben zu dieser Person zu bearbeiten oder ihre Verwandten hinzuzufügen.',
      'es': 'Selecciona a un familiar para editar sus datos o añadirle familiares.',
      'fr': 'Sélectionnez un membre de votre famille pour modifier ses informations ou lui ajouter des proches.',
      'it': 'Seleziona un familiare per modificarne i dettagli o aggiungere i suoi familiari.',
      'nl': 'Selecteer een familielid om de gegevens van die persoon te bewerken of familieleden toe te voegen.',
      'pt-BR':
        'Selecione um familiar para editar as informações dessa pessoa ou adicionar familiares a ela.',
      'zh-Hans': '选择一位家庭成员，以编辑其信息或添加其亲属。',
      'zh-Hant': '選擇一位家庭成員，以編輯其資料或新增其親屬。',
    },
  },
  connectToolDescription: {
    ids: ['interview.familyPedigree.connectToolDescription'],
    message: {
      'en': 'Select two family members to connect them and say how they are related.',
      'de': 'Wählen Sie zwei Familienmitglieder aus, um sie zu verbinden und anzugeben, in welcher Beziehung sie zueinander stehen.',
      'es': 'Selecciona a dos familiares para conectarlos e indicar qué relación hay entre ellos.',
      'fr': 'Sélectionnez deux membres de votre famille pour les relier et choisir leur lien de parenté.',
      'it': 'Seleziona due familiari per collegarli e indicare come sono imparentati.',
      'nl': 'Selecteer twee familieleden om ze te verbinden en aan te geven wat hun relatie is.',
      'pt-BR':
        'Selecione dois familiares para conectá-los e indicar qual é o parentesco entre eles.',
      'zh-Hans': '选择两位家庭成员，将他们连接起来，并选择他们的亲属关系。',
      'zh-Hant': '選擇兩位家庭成員，將他們連結起來，並選擇他們的親屬關係。',
    },
  },
  disconnectToolDescription: {
    ids: ['interview.familyPedigree.disconnectToolDescription'],
    message: {
      'en': 'Select two connected family members to remove the connection between them.',
      'de': 'Wählen Sie zwei verbundene Familienmitglieder aus, um die Verbindung zwischen ihnen zu entfernen.',
      'es': 'Selecciona a dos familiares conectados para eliminar la conexión entre ellos.',
      'fr': 'Sélectionnez deux membres de votre famille reliés entre eux pour supprimer le lien qui les unit.',
      'it': 'Seleziona due familiari collegati per rimuovere il collegamento tra loro.',
      'nl': 'Selecteer twee verbonden familieleden om de verbinding tussen hen te verwijderen.',
      'pt-BR':
        'Selecione dois familiares conectados para remover a conexão entre eles.',
      'zh-Hans': '选择两位已连接的家庭成员，以移除他们之间的连接。',
      'zh-Hant': '選擇兩位已連結的家庭成員，以解除他們之間的連結。',
    },
  },
  framingControlDescription: {
    ids: ['interview.familyPedigree.framingControlDescription'],
    message: {
      'en': 'Choose the relationship words your family tree uses for your relatives.',
      'de': 'Wählen Sie, welche Bezeichnungen für Verwandte Ihr Stammbaum verwendet.',
      'es': 'Elige qué términos de parentesco usa tu árbol familiar para nombrar a tus familiares.',
      'fr': 'Choisissez les termes de parenté utilisés dans votre arbre généalogique pour désigner vos proches.',
      'it': 'Scegli i termini di parentela usati nel tuo albero genealogico per indicare i tuoi familiari.',
      'nl': 'Kies welke benamingen voor familieleden je stamboom gebruikt.',
      'pt-BR':
        'Escolha os termos de parentesco que sua árvore genealógica usa para seus familiares.',
      'zh-Hans': '选择您的家谱图使用哪一套亲属称谓。',
      'zh-Hant': '選擇您的家譜圖使用哪一套親屬稱謂。',
    },
  },
  undoDescription: {
    ids: ['interview.familyPedigree.undoDescription'],
    message: {
      'en': 'Undo your last change to your family tree.',
      'de': 'Machen Sie Ihre letzte Änderung an Ihrem Stammbaum rückgängig.',
      'es': 'Deshaz el último cambio que hiciste en tu árbol familiar.',
      'fr': 'Annulez la dernière modification apportée à votre arbre généalogique.',
      'it': 'Annulla l’ultima modifica al tuo albero genealogico.',
      'nl': 'Maak je laatste wijziging aan je stamboom ongedaan.',
      'pt-BR': 'Desfaça a última alteração feita na sua árvore genealógica.',
      'zh-Hans': '撤销您对家谱图所做的最近一次更改。',
      'zh-Hant': '復原您對家譜圖所做的最近一次變更。',
    },
  },
  redoDescription: {
    ids: ['interview.familyPedigree.redoDescription'],
    message: {
      'en': 'Bring back the change you undid.',
      'de': 'Stellen Sie die Änderung wieder her, die Sie rückgängig gemacht haben.',
      'es': 'Vuelve a hacer el cambio que deshiciste.',
      'fr': 'Rétablissez la modification que vous avez annulée.',
      'it': 'Ripristina la modifica che hai annullato.',
      'nl': 'Voer de wijziging die je ongedaan hebt gemaakt opnieuw uit.',
      'pt-BR': 'Traga de volta a alteração que você desfez.',
      'zh-Hans': '恢复您最近一次撤销的更改。',
      'zh-Hant': '重新套用您最近一次復原的變更。',
    },
  },
  trackerAllDetails: {
    ids: ['interview.familyPedigree.trackerAllDetails'],
    message: {
      'en': 'Add required details for all family members',
      'de': 'Fügen Sie die erforderlichen Angaben für alle Familienmitglieder hinzu',
      'es': 'Añade los datos obligatorios de todos los miembros de la familia',
      'fr': 'Ajoutez les informations requises pour tous les membres de la famille',
      'it': 'Aggiungi le informazioni obbligatorie per tutti i familiari',
      'nl': 'Voeg de vereiste gegevens over alle familieleden toe',
      'pt-BR': 'Adicione as informações obrigatórias de todos os familiares',
      'zh-Hans': '补全所有家庭成员的必要信息',
      'zh-Hant': '填寫所有家庭成員的必要資訊',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every Categorical Bin stage's own controls. */
export const CATEGORICAL_BIN_INTERFACE_TEXT = {
  placeHere: {
    ids: ['interview.interfaces.binSelectPlaceHere'],
    message: {
      'en': 'Place here',
      'de': 'Hier platzieren',
      'es': 'Colocar aquí',
      'fr': 'Placer ici',
      'it': 'Posiziona qui',
      'nl': 'Hier plaatsen',
      'pt-BR': 'Posicionar aqui',
      'zh-Hans': '放在这里',
      'zh-Hant': '放在這裡',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every roster name generator's own words. */
export const ROSTER_INTERFACE_TEXT = {
  unnamedNumbered: {
    ids: ['interview.runtime.unnamedNumbered'],
    arguments: { count: { kind: 'text' } },
    message: {
      'en': 'Unnamed {count}',
      'de': 'Ohne Namen {count}',
      'es': 'Sin nombre {count}',
      'fr': 'Sans nom {count}',
      'it': 'Senza nome {count}',
      'nl': 'Zonder naam {count}',
      'pt-BR': 'Sem nome {count}',
      'zh-Hans': '未命名 {count}',
      'zh-Hant': '未命名 {count}',
    },
  },
  dropToRemove: {
    ids: ['interview.runtime.dropToRemove'],
    message: {
      'en': 'Drop here to remove',
      'de': 'Zum Entfernen hier ablegen',
      'es': 'Suelta aquí para quitar',
      'fr': 'Déposer ici pour retirer',
      'it': 'Rilascia qui per rimuovere',
      'nl': 'Hier neerzetten om weg te halen',
      'pt-BR': 'Solte aqui para remover',
      'zh-Hans': '放置到此处以移除',
      'zh-Hant': '放到這裡即可移除',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * Every quick-add Name Generator stage's own words. The name field is worded
 * as a Network Composer's is by default (`stage-wording/network-composer.ts`),
 * where each stage holds its own.
 */
export const QUICK_ADD_INTERFACE_TEXT = {
  addNamePlaceholder: {
    ids: ['interview.interfaces.addNamePlaceholder'],
    message: ADD_NAME_PLACEHOLDER,
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every Network Composer stage's own words. */
export const NETWORK_COMPOSER_INTERFACE_TEXT = {
  connection: {
    ids: ['interview.runtime.connection'],
    message: {
      'en': 'Connection',
      'de': 'Verbindung',
      'es': 'Conexión',
      'fr': 'Lien',
      'it': 'Collegamento',
      'nl': 'Verbinding',
      'pt-BR': 'Conexão',
      'zh-Hans': '连接',
      'zh-Hant': '連結',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every Ego Form stage's own words. */
export const EGO_FORM_INTERFACE_TEXT = {
  scrollForQuestions: {
    ids: ['interview.interfaces.scrollForQuestions'],
    message: {
      'en': 'Scroll to see more questions',
      'de': 'Scrollen Sie, um weitere Fragen zu sehen',
      'es': 'Desplázate para ver más preguntas',
      'fr': 'Faites défiler pour voir d’autres questions',
      'it': 'Scorri per vedere altre domande',
      'nl': 'Scroll om meer vragen te zien',
      'pt-BR': 'Role para ver mais perguntas',
      'zh-Hans': '向下滚动查看更多问题',
      'zh-Hant': '向下捲動以查看更多問題',
    },
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;
