import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

type Stage = Readonly<Record<string, unknown>>;

/** The name field that adds a person, before anything is typed in it. */
const ADD_NAME_PLACEHOLDER = {
  'en': 'Type a name, then press Enter',
  'de': 'Namen eingeben und mit Enter bestätigen',
  'es': 'Escribe un nombre y pulsa Intro',
  'fr': 'Saisissez un nom, puis appuyez sur Entrée',
  'it': 'Digita un nome, poi premi Invio',
  'nl': 'Typ een naam en druk op Enter',
  'pt-BR': 'Digite um nome e pressione Enter',
  'zh-Hans': '输入姓名，然后按 Enter',
  'zh-Hant': '輸入名字後按 Enter',
} as const satisfies SuppliedWording;

/** What the participant is told when an undo or redo has overtaken an edit. */
const OVERTAKEN_EDIT_NOTICE = {
  'en': 'Undo or redo changed an answer while you were editing it, so your edit has not been saved. To keep your edit, change that answer again. If you continue, your edit will be lost.',
  'de': '„Rückgängig“ oder „Wiederholen“ hat eine Antwort geändert, während Sie sie bearbeitet haben. Deshalb wurde Ihre Änderung nicht gespeichert. Um Ihre Änderung zu behalten, ändern Sie diese Antwort erneut. Wenn Sie fortfahren, geht Ihre Änderung verloren.',
  'es': 'Deshacer o rehacer cambió una respuesta mientras la editabas, así que tu cambio no se ha guardado. Para conservarlo, vuelve a cambiar esa respuesta. Si continúas, se perderá tu cambio.',
  'fr': 'Annuler ou Rétablir a modifié une réponse pendant que vous la modifiiez. Votre modification n’a donc pas été enregistrée. Pour la conserver, modifiez de nouveau cette réponse. Si vous continuez, votre modification sera perdue.',
  'it': 'Annulla o Ripeti ha cambiato una risposta mentre la stavi modificando, quindi la modifica non è stata salvata. Per mantenerla, cambia di nuovo quella risposta. Se continui, la modifica andrà persa.',
  'nl': 'Ongedaan maken of opnieuw uitvoeren heeft een antwoord gewijzigd terwijl je het aan het bewerken was, dus je wijziging is niet opgeslagen. Wijzig dat antwoord opnieuw om je wijziging te behouden. Als je doorgaat, gaat je wijziging verloren.',
  'pt-BR':
    'Desfazer ou refazer alterou uma resposta enquanto você a editava, por isso sua alteração não foi salva. Para mantê-la, altere essa resposta novamente. Se você continuar, sua alteração será perdida.',
  'zh-Hans':
    '撤销或重做在您编辑某个回答时更改了该回答，因此您的修改尚未保存。如要保留您的修改，请再次更改该回答。如果继续，您的修改将会丢失。',
  'zh-Hant':
    '復原或重做在您編輯某個回答時變更了該回答，因此您的修改尚未儲存。若要保留您的修改，請再次變更該回答。如果繼續，您的修改將會遺失。',
} as const satisfies SuppliedWording;

/** The heading over the groups, and the words on the Groups tool. */
export const GROUPS_HEADING = {
  'en': 'Groups',
  'de': 'Gruppen',
  'es': 'Grupos',
  'fr': 'Groupes',
  'it': 'Gruppi',
  'nl': 'Groepen',
  'pt-BR': 'Grupos',
  'zh-Hans': '群组',
  'zh-Hant': '群組',
} as const satisfies SuppliedWording;

const ADD_PERSON_TOOLTIP = {
  'en': 'Add node',
  'de': 'Knoten hinzufügen',
  'es': 'Añadir un elemento',
  'fr': 'Ajouter un nœud',
  'it': 'Aggiungi nodo',
  'nl': 'Knooppunt toevoegen',
  'pt-BR': 'Adicionar nó',
  'zh-Hans': '添加节点',
  'zh-Hant': '新增節點',
} as const satisfies SuppliedWording;

const AUTOMATIC_LAYOUT_TOOLTIP = {
  'en': 'Automatic layout',
  'de': 'Automatisches Layout',
  'es': 'Disposición automática',
  'fr': 'Disposition automatique',
  'it': 'Disposizione automatica',
  'nl': 'Automatische lay-out',
  'pt-BR': 'Disposição automática',
  'zh-Hans': '自动布局',
  'zh-Hant': '自動版面配置',
} as const satisfies SuppliedWording;

const DRAW_CONNECTION_TOOLTIP = {
  'en': 'Draw edge',
  'de': 'Verbindung zeichnen',
  'es': 'Dibujar una conexión',
  'fr': 'Tracer un lien',
  'it': 'Traccia un legame',
  'nl': 'Relatie tekenen',
  'pt-BR': 'Desenhar laço',
  'zh-Hans': '绘制关系',
  'zh-Hant': '繪製關係',
} as const satisfies SuppliedWording;

/** The Groups tool and its heading appear only once the stage has groups. */
const hasGroups = (stage: Stage) => stage.convexHullVariable !== undefined;

/** The connection tool appears only once the stage has edge types. */
const hasEdgeTypes = (stage: Stage) => {
  const edges = stage.edges;
  return Array.isArray(edges) && edges.length > 0;
};

/** The Network Composer's settings Network Canvas words. */
export const NETWORK_COMPOSER_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  { path: ['addNamePlaceholder'], message: ADD_NAME_PLACEHOLDER },
  { path: ['overtakenEditNotice'], message: OVERTAKEN_EDIT_NOTICE },
  {
    path: ['groupsHeading'],
    message: GROUPS_HEADING,
    when: hasGroups,
  },
  { path: ['tooltips', 'addPerson'], message: ADD_PERSON_TOOLTIP },
  { path: ['tooltips', 'automaticLayout'], message: AUTOMATIC_LAYOUT_TOOLTIP },
  {
    path: ['tooltips', 'drawConnection'],
    message: DRAW_CONNECTION_TOOLTIP,
    when: hasEdgeTypes,
  },
];
