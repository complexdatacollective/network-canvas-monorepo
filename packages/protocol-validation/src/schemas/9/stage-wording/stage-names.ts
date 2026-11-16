import type { LocaleTag } from '../../../localization/localeTag.ts';
import type { StageType } from '../stages/index.ts';
import { suppliedTextFor } from '../supplied-text.ts';

/**
 * Which parts a proposed stage name has, as the `parts` argument of
 * `StageNameWording.name`: the node type the stage is about (`subject`), the
 * kind of stage (`type`, always present) and what tells it apart from another
 * of its kind (`qualifier`).
 */
export type StageNameParts =
  | 'subjectTypeQualifier'
  | 'subjectType'
  | 'typeQualifier'
  | 'type';

/** Where a name generator's panels draw their people from. */
export type PanelSource = 'network' | 'roster' | 'both';

/**
 * The media an Information stage holds, in the order a name lists them
 * (image, then video, then audio), as the `media` argument of
 * `StageNameWording.media`; `summary` stands for all of them.
 */
export type MediaKinds =
  | 'image'
  | 'video'
  | 'audio'
  | 'imageVideo'
  | 'imageAudio'
  | 'videoAudio'
  | 'imageVideoAudio'
  | 'summary';

/**
 * How a finish stage's interview ends there and whether the stage ends it
 * without asking, as the `finish` argument of `StageNameWording.finish`.
 */
export type FinishKinds =
  | 'completed'
  | 'ineligible'
  | 'terminated'
  | 'completedAutomatic'
  | 'ineligibleAutomatic'
  | 'terminatedAutomatic'
  | 'automatic';

/**
 * Everything Architect needs to propose a stage's name in one language: ICU
 * messages, so that each language puts the parts in its own order.
 *
 * - `name` puts the parts together (arguments `parts`, `subject`, `type`,
 *   `qualifier`). `subject` is the researcher's own name for the node type and
 *   is never translated.
 * - `types` names each kind of stage.
 * - `panels`, `media` and `finish` say what tells two stages of one kind
 *   apart (argument `source`, `media`, `finish`).
 *
 * The messages are plain text with arguments: no markup, and no apostrophe
 * other than the typographic one.
 */
export type StageNameWording = Readonly<{
  name: string;
  types: Readonly<Record<StageType, string>>;
  panels: string;
  media: string;
  finish: string;
}>;

/**
 * Writes a name in a language that puts the type first: the subject follows
 * after a colon, so that it needs no agreement with the type's name, and the
 * qualifier follows after a dash.
 */
const NAME_TYPE_FIRST =
  '{parts, select, subjectTypeQualifier {{type}: {subject} – {qualifier}} subjectType {{type}: {subject}} typeQualifier {{type} – {qualifier}} other {{type}}}';

/**
 * French sets a non-breaking space before a colon, and one before the dash
 * keeps a line from beginning with it.
 */
const NAME_TYPE_FIRST_FRENCH =
  '{parts, select, subjectTypeQualifier {{type}\u00a0: {subject}\u00a0– {qualifier}} subjectType {{type}\u00a0: {subject}} typeQualifier {{type}\u00a0– {qualifier}} other {{type}}}';

const NAME_TYPE_FIRST_CHINESE =
  '{parts, select, subjectTypeQualifier {{type}：{subject}——{qualifier}} subjectType {{type}：{subject}} typeQualifier {{type}——{qualifier}} other {{type}}}';

/**
 * The names Architect proposes for a stage, in every language Network Canvas
 * supplies wording in. A proposal is not read at interview time: it is text
 * written into a stage's name for the researcher, who then owns it, so it is
 * not among the stage settings whose wording follows a change of language
 * (`SUPPLIED_STAGE_TEXT`).
 *
 * The kinds of stage are named as the Architect interface names them in the
 * same language, so that a stage is not called one thing in its editor and
 * another in the name proposed for it; English is the exception, naming a
 * kind of stage the way it reads in front of a node type ("Person Quick Add
 * Name Generator"). A test in the protocol builder keeps the two in step.
 *
 * Each translation was checked by blind back-translation and adversarial
 * comparison.
 */
export const STAGE_NAME_WORDING = {
  'en': {
    name: '{parts, select, subjectTypeQualifier {{subject} {type} {qualifier}} subjectType {{subject} {type}} typeQualifier {{type} {qualifier}} other {{type}}}',
    types: {
      NameGenerator: 'Form Name Generator',
      NameGeneratorQuickAdd: 'Quick Add Name Generator',
      NameGeneratorRoster: 'Roster Name Generator',
      FamilyPedigree: 'Family Pedigree',
      NarrativePedigree: 'Narrative Pedigree',
      DyadCensus: 'Dyad Census',
      OneToManyDyadCensus: 'One to Many Dyad Census',
      TieStrengthCensus: 'Tie-Strength Census',
      Sociogram: 'Sociogram',
      NetworkComposer: 'Network Composer',
      Narrative: 'Narrative',
      OrdinalBin: 'Ordinal Bin',
      CategoricalBin: 'Categorical Bin',
      AlterForm: 'Per Alter Form',
      Geospatial: 'Geospatial',
      AlterEdgeForm: 'Per Alter Edge Form',
      EgoForm: 'Ego Form',
      Information: 'Information',
      Anonymisation: 'Anonymisation',
      LanguageChooser: 'Language Chooser',
      FinishSession: 'Finish Screen',
    },
    panels:
      '{source, select, network {with Network Panels} roster {with Roster Panels} other {with Panels}}',
    media:
      '{media, select, image {with Image} video {with Video} audio {with Audio} imageVideo {with Image & Video} imageAudio {with Image & Audio} videoAudio {with Video & Audio} imageVideoAudio {with Image, Video & Audio} other {with Media}}',
    finish:
      '{finish, select, completed {(Completed)} ineligible {(Ineligible)} terminated {(Ended Early)} completedAutomatic {(Completed, Automatic)} ineligibleAutomatic {(Ineligible, Automatic)} terminatedAutomatic {(Ended Early, Automatic)} automatic {(Automatic)} other {}}',
  },
  'ar': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'مولّد الأسماء (باستخدام النماذج)',
      NameGeneratorQuickAdd: 'مولّد الأسماء (إضافة سريعة)',
      NameGeneratorRoster: 'مولّد الأسماء من قائمة مُعدّة مسبقًا',
      FamilyPedigree: 'شجرة نسب العائلة',
      NarrativePedigree: 'شجرة النسب السردية',
      DyadCensus: 'تعداد الثنائيات',
      OneToManyDyadCensus: 'تعداد الثنائيات من واحد إلى متعدد',
      TieStrengthCensus: 'تعداد قوة الروابط',
      Sociogram: 'المخطط الاجتماعي',
      NetworkComposer: 'منشئ الشبكة',
      Narrative: 'السرد',
      OrdinalBin: 'التصنيف الترتيبي',
      CategoricalBin: 'التصنيف الفئوي',
      AlterForm: 'نموذج لكل طرف آخر',
      Geospatial: 'الواجهة الجغرافية المكانية',
      AlterEdgeForm: 'نموذج لكل رابطة بين طرفين',
      EgoForm: 'نموذج الأنا',
      Information: 'معلومات',
      Anonymisation: 'واجهة إخفاء الهوية',
      LanguageChooser: 'اختيار اللغة',
      FinishSession: 'شاشة الإنهاء',
    },
    panels:
      '{source, select, network {مع اللوحات من الشبكة} roster {مع اللوحات من القائمة} other {مع اللوحات}}',
    media:
      '{media, select, image {مع صورة} video {مع فيديو} audio {مع صوت} imageVideo {مع صورة وفيديو} imageAudio {مع صورة وصوت} videoAudio {مع فيديو وصوت} imageVideoAudio {مع صورة وفيديو وصوت} other {مع وسائط}}',
    finish:
      '{finish, select, completed {(مكتملة)} ineligible {(عدم الأهلية)} terminated {(أُنهيت مبكرًا)} completedAutomatic {(مكتملة، إنهاء تلقائي)} ineligibleAutomatic {(عدم الأهلية، إنهاء تلقائي)} terminatedAutomatic {(أُنهيت مبكرًا، إنهاء تلقائي)} automatic {(إنهاء تلقائي)} other {}}',
  },
  'de': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'Namensgenerator (mit Formularen)',
      NameGeneratorQuickAdd: 'Namensgenerator (Schnelleingabe)',
      NameGeneratorRoster: 'Namensgenerator mit Namensliste',
      FamilyPedigree: 'Familienstammbaum',
      NarrativePedigree: 'Narrativer Stammbaum',
      DyadCensus: 'Dyadenzensus',
      OneToManyDyadCensus: 'Eins-zu-viele-Dyadenzensus',
      TieStrengthCensus: 'Beziehungsstärke-Zensus',
      Sociogram: 'Soziogramm',
      NetworkComposer: 'Netzwerkeditor',
      Narrative: 'Narrativ',
      OrdinalBin: 'Ordinale Einordnung',
      CategoricalBin: 'Kategoriale Einordnung',
      AlterForm: 'Formular für jeden Alter',
      Geospatial: 'Geodaten-Oberfläche',
      AlterEdgeForm: 'Kantenformular für jedes Alteri-Paar',
      EgoForm: 'Ego-Formular',
      Information: 'Information',
      Anonymisation: 'Anonymisierungsoberfläche',
      LanguageChooser: 'Sprachauswahl',
      FinishSession: 'Abschlussbildschirm',
    },
    panels:
      '{source, select, network {mit Netzwerk-Panels} roster {mit Namenslisten-Panels} other {mit Panels}}',
    media:
      '{media, select, image {mit Bild} video {mit Video} audio {mit Audio} imageVideo {mit Bild und Video} imageAudio {mit Bild und Audio} videoAudio {mit Video und Audio} imageVideoAudio {mit Bild, Video und Audio} other {mit Medien}}',
    finish:
      '{finish, select, completed {Interview abgeschlossen} ineligible {Person nicht teilnahmeberechtigt} terminated {Interview vorzeitig beendet} completedAutomatic {Interview abgeschlossen, ohne Bestätigungsabfrage} ineligibleAutomatic {Person nicht teilnahmeberechtigt, ohne Bestätigungsabfrage} terminatedAutomatic {Interview vorzeitig beendet, ohne Bestätigungsabfrage} automatic {ohne Bestätigungsabfrage} other {}}',
  },
  'es': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'Generador de nombres (con formularios)',
      NameGeneratorQuickAdd: 'Generador de nombres (adición rápida)',
      NameGeneratorRoster: 'Generador de nombres a partir de una lista',
      FamilyPedigree: 'Genealogía familiar',
      NarrativePedigree: 'Genealogía narrativa',
      DyadCensus: 'Censo de díadas',
      OneToManyDyadCensus: 'Censo de díadas de uno a muchos',
      TieStrengthCensus: 'Censo de fuerza de vínculos',
      Sociogram: 'Sociograma',
      NetworkComposer: 'Compositor de redes',
      Narrative: 'Narrativa',
      OrdinalBin: 'Clasificación ordinal',
      CategoricalBin: 'Clasificación por categorías',
      AlterForm: 'Formulario por álter',
      Geospatial: 'Interfaz geoespacial',
      AlterEdgeForm: 'Formulario de vínculos por álter',
      EgoForm: 'Formulario del ego',
      Information: 'Información',
      Anonymisation: 'Interfaz de anonimización',
      LanguageChooser: 'Selector de idioma',
      FinishSession: 'Pantalla de finalización',
    },
    panels:
      '{source, select, network {con paneles de la red} roster {con paneles de la lista} other {con paneles}}',
    media:
      '{media, select, image {con imagen} video {con vídeo} audio {con audio} imageVideo {con imagen y vídeo} imageAudio {con imagen y audio} videoAudio {con vídeo y audio} imageVideoAudio {con imagen, vídeo y audio} other {con contenido multimedia}}',
    finish:
      '{finish, select, completed {entrevista completada} ineligible {participante no elegible} terminated {entrevista finalizada antes de tiempo} completedAutomatic {entrevista completada, sin pedir confirmación} ineligibleAutomatic {participante no elegible, sin pedir confirmación} terminatedAutomatic {entrevista finalizada antes de tiempo, sin pedir confirmación} automatic {sin pedir confirmación} other {}}',
  },
  'fr': {
    name: NAME_TYPE_FIRST_FRENCH,
    types: {
      NameGenerator: 'Générateur de noms (avec formulaires)',
      NameGeneratorQuickAdd: 'Générateur de noms (ajout rapide)',
      NameGeneratorRoster: 'Générateur de noms à partir d’une liste',
      FamilyPedigree: 'Arbre généalogique',
      NarrativePedigree: 'Arbre généalogique narratif',
      DyadCensus: 'Recensement des dyades',
      OneToManyDyadCensus: 'Recensement des dyades (un à plusieurs)',
      TieStrengthCensus: 'Recensement de la force des liens',
      Sociogram: 'Sociogramme',
      NetworkComposer: 'Compositeur de réseau',
      Narrative: 'Narration',
      OrdinalBin: 'Classement ordinal',
      CategoricalBin: 'Classement par catégories',
      AlterForm: 'Formulaire par alter',
      Geospatial: 'Interface géospatiale',
      AlterEdgeForm: 'Formulaire par lien entre alters',
      EgoForm: 'Formulaire ego',
      Information: 'Information',
      Anonymisation: 'Interface d’anonymisation',
      LanguageChooser: 'Choix de la langue',
      FinishSession: 'Écran de fin',
    },
    panels:
      '{source, select, network {avec panneaux du réseau} roster {avec panneaux de la liste} other {avec panneaux}}',
    media:
      '{media, select, image {avec image} video {avec vidéo} audio {avec audio} imageVideo {avec image et vidéo} imageAudio {avec image et audio} videoAudio {avec vidéo et audio} imageVideoAudio {avec image, vidéo et audio} other {avec médias}}',
    finish:
      '{finish, select, completed {entretien terminé} ineligible {participant non éligible} terminated {entretien arrêté prématurément} completedAutomatic {entretien terminé, sans demande de confirmation} ineligibleAutomatic {participant non éligible, sans demande de confirmation} terminatedAutomatic {entretien arrêté prématurément, sans demande de confirmation} automatic {sans demande de confirmation} other {}}',
  },
  'it': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'Generatore di nomi (con moduli)',
      NameGeneratorQuickAdd: 'Generatore di nomi (aggiunta rapida)',
      NameGeneratorRoster: 'Generatore di nomi da elenco',
      FamilyPedigree: 'Albero genealogico',
      NarrativePedigree: 'Albero genealogico narrativo',
      DyadCensus: 'Censimento delle diadi',
      OneToManyDyadCensus: 'Censimento delle diadi uno-a-molti',
      TieStrengthCensus: 'Censimento della forza dei legami',
      Sociogram: 'Sociogramma',
      NetworkComposer: 'Compositore di reti',
      Narrative: 'Narrazione',
      OrdinalBin: 'Classificazione ordinale',
      CategoricalBin: 'Classificazione per categorie',
      AlterForm: 'Modulo per ciascun alter',
      Geospatial: 'Interfaccia geospaziale',
      AlterEdgeForm: 'Modulo dei legami per ciascun alter',
      EgoForm: 'Modulo di ego',
      Information: 'Informazioni',
      Anonymisation: 'Interfaccia di anonimizzazione',
      LanguageChooser: 'Scelta della lingua',
      FinishSession: 'Schermata finale',
    },
    panels:
      '{source, select, network {con pannelli della rete} roster {con pannelli dell’elenco} other {con pannelli}}',
    media:
      '{media, select, image {con immagine} video {con video} audio {con audio} imageVideo {con immagine e video} imageAudio {con immagine e audio} videoAudio {con video e audio} imageVideoAudio {con immagine, video e audio} other {con contenuti multimediali}}',
    finish:
      '{finish, select, completed {intervista completata} ineligible {partecipante non idoneo} terminated {intervista conclusa in anticipo} completedAutomatic {intervista completata, senza richiesta di conferma} ineligibleAutomatic {partecipante non idoneo, senza richiesta di conferma} terminatedAutomatic {intervista conclusa in anticipo, senza richiesta di conferma} automatic {senza richiesta di conferma} other {}}',
  },
  'nl': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'Naamgenerator (met formulieren)',
      NameGeneratorQuickAdd: 'Naamgenerator (snel toevoegen)',
      NameGeneratorRoster: 'Naamgenerator voor gegevens uit een namenlijst',
      FamilyPedigree: 'Familiestamboom',
      NarrativePedigree: 'Narratieve stamboom',
      DyadCensus: 'Dyadencensus',
      OneToManyDyadCensus: 'Een-op-veel-dyadencensus',
      TieStrengthCensus: 'Relatiesterktecensus',
      Sociogram: 'Sociogram',
      NetworkComposer: 'Netwerkbouwer',
      Narrative: 'Narratief',
      OrdinalBin: 'Ordinale indeling',
      CategoricalBin: 'Categorische indeling',
      AlterForm: 'Formulier per alter',
      Geospatial: 'Interface voor geografische gegevens',
      AlterEdgeForm: 'Formulier per relatie',
      EgoForm: 'Egoformulier',
      Information: 'Informatie',
      Anonymisation: 'Interface voor anonimisering',
      LanguageChooser: 'Taalkeuze',
      FinishSession: 'Afsluitscherm',
    },
    panels:
      '{source, select, network {met netwerkpanelen} roster {met namenlijstpanelen} other {met panelen}}',
    media:
      '{media, select, image {met afbeelding} video {met video} audio {met audio} imageVideo {met afbeelding en video} imageAudio {met afbeelding en audio} videoAudio {met video en audio} imageVideoAudio {met afbeelding, video en audio} other {met media}}',
    finish:
      '{finish, select, completed {interview voltooid} ineligible {deelnemer niet in aanmerking komend} terminated {interview vroegtijdig beëindigd} completedAutomatic {interview voltooid, zonder bevestigingsstap} ineligibleAutomatic {deelnemer niet in aanmerking komend, zonder bevestigingsstap} terminatedAutomatic {interview vroegtijdig beëindigd, zonder bevestigingsstap} automatic {zonder bevestigingsstap} other {}}',
  },
  'pt-BR': {
    name: NAME_TYPE_FIRST,
    types: {
      NameGenerator: 'Gerador de nomes (com formulários)',
      NameGeneratorQuickAdd: 'Gerador de nomes (adição rápida)',
      NameGeneratorRoster: 'Gerador de nomes a partir de lista',
      FamilyPedigree: 'Heredograma familiar',
      NarrativePedigree: 'Heredograma narrativo',
      DyadCensus: 'Censo de díades',
      OneToManyDyadCensus: 'Censo de díades de um para muitos',
      TieStrengthCensus: 'Censo de força dos laços',
      Sociogram: 'Sociograma',
      NetworkComposer: 'Compositor de redes',
      Narrative: 'Narrativa',
      OrdinalBin: 'Classificação ordinal',
      CategoricalBin: 'Classificação categórica',
      AlterForm: 'Formulário por alter',
      Geospatial: 'Interface geoespacial',
      AlterEdgeForm: 'Formulário por laço entre alters',
      EgoForm: 'Formulário do ego',
      Information: 'Informação',
      Anonymisation: 'Interface de anonimização',
      LanguageChooser: 'Seletor de idioma',
      FinishSession: 'Tela de conclusão',
    },
    panels:
      '{source, select, network {com painéis da rede} roster {com painéis da lista} other {com painéis}}',
    media:
      '{media, select, image {com imagem} video {com vídeo} audio {com áudio} imageVideo {com imagem e vídeo} imageAudio {com imagem e áudio} videoAudio {com vídeo e áudio} imageVideoAudio {com imagem, vídeo e áudio} other {com mídia}}',
    finish:
      '{finish, select, completed {entrevista concluída} ineligible {participante inelegível} terminated {entrevista encerrada antecipadamente} completedAutomatic {entrevista concluída, sem pedir confirmação} ineligibleAutomatic {participante inelegível, sem pedir confirmação} terminatedAutomatic {entrevista encerrada antecipadamente, sem pedir confirmação} automatic {sem pedir confirmação} other {}}',
  },
  'zh-Hans': {
    name: NAME_TYPE_FIRST_CHINESE,
    types: {
      NameGenerator: '姓名生成器（使用表单）',
      NameGeneratorQuickAdd: '姓名生成器（快速添加）',
      NameGeneratorRoster: '名册数据姓名生成器',
      FamilyPedigree: '家族谱系',
      NarrativePedigree: '叙事谱系',
      DyadCensus: '二元组普查',
      OneToManyDyadCensus: '一对多二元组普查',
      TieStrengthCensus: '关系强度普查',
      Sociogram: '社会关系图',
      NetworkComposer: '网络构建器',
      Narrative: '叙事',
      OrdinalBin: '有序分箱',
      CategoricalBin: '分类分箱',
      AlterForm: '逐一他者表单',
      Geospatial: '地理空间界面',
      AlterEdgeForm: '逐一他者关系表单',
      EgoForm: '自我表单',
      Information: '信息',
      Anonymisation: '匿名化界面',
      LanguageChooser: '语言选择',
      FinishSession: '完成屏幕',
    },
    panels:
      '{source, select, network {含网络面板} roster {含名册面板} other {含面板}}',
    media:
      '{media, select, image {含图像} video {含视频} audio {含音频} imageVideo {含图像和视频} imageAudio {含图像和音频} videoAudio {含视频和音频} imageVideoAudio {含图像、视频和音频} other {含多媒体}}',
    finish:
      '{finish, select, completed {访谈已完成} ineligible {参与者不符合资格} terminated {访谈提前结束} completedAutomatic {访谈已完成，且无需由参与者确认} ineligibleAutomatic {参与者不符合资格，且无需由参与者确认} terminatedAutomatic {访谈提前结束，且无需由参与者确认} automatic {无需由参与者确认} other {}}',
  },
  'zh-Hant': {
    name: NAME_TYPE_FIRST_CHINESE,
    types: {
      NameGenerator: '名字產生器（使用表單）',
      NameGeneratorQuickAdd: '名字產生器（快速新增）',
      NameGeneratorRoster: '名冊資料名字產生器',
      FamilyPedigree: '家族譜系',
      NarrativePedigree: '敘事譜系',
      DyadCensus: '二元組普查',
      OneToManyDyadCensus: '一對多二元組普查',
      TieStrengthCensus: '關係強度普查',
      Sociogram: '社會關係圖',
      NetworkComposer: '網絡編輯器',
      Narrative: '敘事',
      OrdinalBin: '順序分箱',
      CategoricalBin: '類別分箱',
      AlterForm: '逐一他者表單',
      Geospatial: '地理空間介面',
      AlterEdgeForm: '逐一他者關係表單',
      EgoForm: '自我表單',
      Information: '資訊',
      Anonymisation: '匿名化介面',
      LanguageChooser: '語言選擇',
      FinishSession: '完成畫面',
    },
    panels:
      '{source, select, network {含網絡面板} roster {含名冊面板} other {含面板}}',
    media:
      '{media, select, image {含圖片} video {含影片} audio {含音訊} imageVideo {含圖片和影片} imageAudio {含圖片和音訊} videoAudio {含影片和音訊} imageVideoAudio {含圖片、影片和音訊} other {含多媒體}}',
    finish:
      '{finish, select, completed {訪談已完成} ineligible {參與者不符合資格} terminated {訪談提前結束} completedAutomatic {訪談已完成，且無需由參與者確認} ineligibleAutomatic {參與者不符合資格，且無需由參與者確認} terminatedAutomatic {訪談提前結束，且無需由參與者確認} automatic {無需由參與者確認} other {}}',
  },
} as const satisfies Readonly<Record<LocaleTag, StageNameWording>>;

const supplied: Readonly<Record<string, StageNameWording>> = STAGE_NAME_WORDING;

/**
 * The wording a stage's proposed name is made from in a protocol language, or
 * `undefined` when Network Canvas supplies none in it (see `suppliedTextFor`):
 * a protocol whose default language is one of those gets no proposed name.
 */
export const stageNameWordingFor = (
  locale: LocaleTag,
): StageNameWording | undefined => suppliedTextFor(supplied, locale);
