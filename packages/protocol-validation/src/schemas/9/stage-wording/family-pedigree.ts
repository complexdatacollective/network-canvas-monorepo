import type { LocaleTag } from '../../../localization/localeTag.ts';
import {
  CHILDREN_ITEM,
  CHILDREN_NONE,
  CHILDREN_QUESTION,
  DETAILS_ITEM,
  NAME_HINT,
  NAME_PROMPT,
  PARENTS_ITEM,
  RECOMMENDED_NOTE,
  SIBLINGS_ITEM,
  SIBLINGS_NONE,
  SIBLINGS_QUESTION,
} from '../family-pedigree-wording.ts';
import type { LocalizedString } from '../localized-string.ts';
import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

const pedigreeCompleteness = (
  path: readonly string[],
  message: SuppliedWording,
): SuppliedStageSetting => ({
  path: ['completeness', ...path],
  message,
  within: ['completeness'],
});

/**
 * Whether the participant chooses the words used for family members, which
 * asks the framing question and shows its control.
 */
export const choosesFraming = (
  stage: Readonly<{ framing?: unknown }>,
): boolean => stage.framing === 'participantPreference';

/**
 * Whether the stage asks about gender identity, which it does when
 * `nodeConfiguration.genderIdentity` is set.
 */
export const asksGenderIdentity = (
  stage: Readonly<{ nodeConfiguration?: unknown }>,
): boolean => {
  const { nodeConfiguration } = stage;
  return (
    typeof nodeConfiguration === 'object' &&
    nodeConfiguration !== null &&
    'genderIdentity' in nodeConfiguration &&
    nodeConfiguration.genderIdentity !== undefined
  );
};

/** The question introducing the siblings the new parent may also be the parent of. */
const ALSO_PARENT_OF_LABEL = {
  'en': 'Are they also the parent of…',
  'de': 'Ist diese Person auch Elternteil von…',
  'es': '¿También es progenitor de…?',
  'fr': 'Cette personne est-elle aussi parent de…',
  'it': 'È anche genitore di…',
  'nl': 'Is deze persoon ook de ouder van…',
  'pt-BR': 'Essa pessoa também é pai/mãe de…',
  'zh-Hans': '此人也是以下哪些人的父母？',
  'zh-Hant': '此人也是以下哪些人的父母？',
} as const satisfies SuppliedWording;

/** The option that both parents of a new child are its biological parents. */
const BIOLOGICAL_PARENT_BOTH = {
  'en': '{firstIsYou, select, true {Both you and “{second}”} other {Both “{first}” and “{second}”}}',
  'de': '{firstIsYou, select, true {Sowohl Sie als auch „{second}“} other {Sowohl „{first}“ als auch „{second}“}}',
  'es': '{firstIsYou, select, true {Tanto tú como «{second}»} other {Tanto «{first}» como «{second}»}}',
  'fr': '{firstIsYou, select, true {Les deux : vous et « {second} »} other {Les deux : « {first} » et « {second} »}}',
  'it': '{firstIsYou, select, true {Sia tu sia «{second}»} other {Sia «{first}» sia «{second}»}}',
  'nl': '{firstIsYou, select, true {Zowel jij als “{second}”} other {Zowel “{first}” als “{second}”}}',
  'pt-BR':
    '{firstIsYou, select, true {Tanto você quanto “{second}”} other {Tanto “{first}” quanto “{second}”}}',
  'zh-Hans':
    '{firstIsYou, select, true {您和“{second}”两人} other {“{first}”和“{second}”两人}}',
  'zh-Hant':
    '{firstIsYou, select, true {您和「{second}」兩人} other {「{first}」和「{second}」兩人}}',
} as const satisfies SuppliedWording;

/** The hint under the question asking which parent is biological. */
const BIOLOGICAL_PARENT_HINT = {
  'en': 'A parent who is not a biological parent is added as a step or social parent.',
  'de': 'Ein Elternteil, der kein leiblicher Elternteil ist, wird als Stief- oder sozialer Elternteil hinzugefügt.',
  'es': 'Un progenitor que no sea biológico se añade como padrastro, madrastra o progenitor social.',
  'fr': 'Un parent qui n’est pas un parent biologique est ajouté comme beau-parent ou parent social.',
  'it': 'Un genitore che non è biologico viene aggiunto come genitore acquisito o sociale.',
  'nl': 'Een ouder die geen biologische ouder is, wordt toegevoegd als stiefouder of sociale ouder.',
  'pt-BR':
    'Quem não for pai/mãe biológico(a) será adicionado(a) como padrasto/madrasta ou pai/mãe socioafetivo(a).',
  'zh-Hans': '不是亲生父母的一方，会被添加为继父母或社会意义上的父母。',
  'zh-Hant': '不是親生父母的一方，會新增為繼父母或社會意義上的父母。',
} as const satisfies SuppliedWording;

/** The question asking which parents of a new child are biological, when the child has a partner as the other parent. */
const BIOLOGICAL_PARENT_LABEL = {
  'en': 'Who is the child’s biological parent?',
  'de': 'Wer ist der leibliche Elternteil des Kindes?',
  'es': '¿Quién es el progenitor biológico del hijo/a?',
  'fr': 'Qui est le parent biologique de l’enfant ?',
  'it': 'Chi è il genitore biologico di questo figlio o figlia?',
  'nl': 'Wie is de biologische ouder van het kind?',
  'pt-BR': 'Quem é o pai/mãe biológico(a) desse filho(a)?',
  'zh-Hans': '这个子女的亲生父母是谁？',
  'zh-Hant': '這名子女的親生父母是誰？',
} as const satisfies SuppliedWording;

/** The yes or no question asking whether a parent carried the pregnancy of each person chosen who has no recorded carrier. */
const CARRIED_SIBLINGS_PREGNANCY_LABEL = {
  'en': '{single, select, true {{isYou, select, true {Was this parent pregnant with you?} other {Was this parent pregnant with “{name}”?}}} other {Was this parent pregnant with each of the {count} people chosen above who have nobody recorded as having carried them?}}',
  'de': '{single, select, true {{isYou, select, true {Hat dieser Elternteil Sie ausgetragen?} other {Hat dieser Elternteil „{name}“ ausgetragen?}}} other {Hat dieser Elternteil jede der {count} oben ausgewählten Personen ausgetragen, bei denen noch niemand als austragende Person erfasst ist?}}',
  'es': '{single, select, true {{isYou, select, true {¿Fue este progenitor quien te gestó?} other {¿Fue este progenitor quien gestó a «{name}»?}}} other {¿Fue este progenitor quien gestó a cada una de las {count} personas elegidas arriba que aún no tienen a nadie registrado como gestante?}}',
  'fr': '{single, select, true {{isYou, select, true {Est-ce ce parent qui vous a porté pendant la grossesse ?} other {Est-ce ce parent qui a porté « {name} » pendant la grossesse ?}}} other {Est-ce ce parent qui a porté pendant la grossesse chacune des {count} personnes choisies ci-dessus pour lesquelles personne n’est encore indiqué comme l’ayant portée ?}}',
  'it': '{single, select, true {{isYou, select, true {È stato questo genitore a portarti in grembo?} other {È stato questo genitore a portare in grembo «{name}»?}}} other {È stato questo genitore a portare in grembo ciascuna delle {count} persone scelte sopra per cui non è ancora indicato chi le ha portate in grembo?}}',
  'nl': '{single, select, true {{isYou, select, true {Was deze ouder zwanger van jou?} other {Was deze ouder zwanger van “{name}”?}}} other {Was deze ouder zwanger van elk van de {count} hierboven gekozen personen voor wie nog niet is vastgelegd wie de zwangerschap droeg?}}',
  'pt-BR':
    '{single, select, true {{isYou, select, true {Foi essa pessoa quem gestou você?} other {Foi essa pessoa quem gestou “{name}”?}}} other {Foi essa pessoa quem gestou cada uma das {count} pessoas escolhidas acima que ainda não têm ninguém registrado como gestante?}}',
  'zh-Hans':
    '{single, select, true {{isYou, select, true {您是由这位家长怀孕生下的吗？} other {“{name}”是由这位家长怀孕生下的吗？}}} other {上面选中的、尚未记录由谁怀孕的 {count} 人，是否都由这位家长怀孕生下？}}',
  'zh-Hant':
    '{single, select, true {{isYou, select, true {您是由這位家長懷孕生下的嗎？} other {「{name}」是由這位家長懷孕生下的嗎？}}} other {上面選中的、尚未記錄由誰懷孕的 {count} 人，是否都由這位家長懷孕生下？}}',
} as const satisfies SuppliedWording;

/** The question asking who carried the pregnancy. */
const CARRIER_LABEL = {
  'en': 'Who carried the pregnancy?',
  'de': 'Wer hat das Kind ausgetragen?',
  'es': '¿Quién llevó el embarazo?',
  'fr': 'Qui a porté la grossesse ?',
  'it': 'Chi ha portato avanti la gravidanza?',
  'nl': 'Wie heeft de zwangerschap gedragen?',
  'pt-BR': 'Quem gestou?',
  'zh-Hans': '由谁怀孕？',
  'zh-Hant': '由誰懷孕？',
} as const satisfies SuppliedWording;

/** The option that none of the parents offered carried the pregnancy, or the participant does not know. */
const CARRIER_UNKNOWN = {
  'en': 'Someone else, or I don’t know',
  'de': 'Jemand anderes, oder ich weiß es nicht',
  'es': 'Otra persona, o no lo sé',
  'fr': 'Quelqu’un d’autre, ou je ne sais pas',
  'it': 'Un’altra persona, oppure non lo so',
  'nl': 'Iemand anders, of ik weet het niet',
  'pt-BR': 'Outra pessoa, ou não sei',
  'zh-Hans': '其他人，或我不知道',
  'zh-Hant': '其他人，或我不知道',
} as const satisfies SuppliedWording;

/** The option for a child through adoption. */
const CHILD_KIND_ADOPTIVE = {
  'en': 'An adopted child',
  'de': 'Ein adoptiertes Kind',
  'es': 'Un hijo/a adoptivo/a',
  'fr': 'Un enfant adopté',
  'it': 'Un figlio o una figlia adottivi',
  'nl': 'Een geadopteerd kind',
  'pt-BR': 'Um filho(a) adotivo(a)',
  'zh-Hans': '养子女',
  'zh-Hant': '養子女',
} as const satisfies SuppliedWording;

/** The option for a genetically related child. */
const CHILD_KIND_BIOLOGICAL = {
  'en': 'A biological child',
  'de': 'Ein leibliches Kind',
  'es': 'Un hijo/a biológico/a',
  'fr': 'Un enfant biologique',
  'it': 'Un figlio o una figlia biologici',
  'nl': 'Een biologisch kind',
  'pt-BR': 'Um filho(a) biológico(a)',
  'zh-Hans': '亲生子女',
  'zh-Hant': '親生子女',
} as const satisfies SuppliedWording;

/** The option for a child who is neither genetically related nor adopted, such as a step-child. */
const CHILD_KIND_SOCIAL = {
  'en': 'A step-child or other child they raise',
  'de': 'Ein Stiefkind oder ein anderes Kind, das bei ihnen aufwächst',
  'es': 'Un hijastro/a u otro hijo/a que crían',
  'fr': 'Un enfant par alliance ou un autre enfant qu’ils élèvent',
  'it': 'Un figlio o una figlia acquisiti, o un altro figlio che crescono',
  'nl': 'Een stiefkind of ander kind dat ze opvoeden',
  'pt-BR': 'Um enteado(a) ou outro filho(a) que criam',
  'zh-Hans': '继子女，或由其抚养的其他子女',
  'zh-Hant': '繼子女，或由其撫養的其他子女',
} as const satisfies SuppliedWording;

/** The question asking how a child is related to their parents. */
const CHILD_KIND_LABEL = {
  'en': 'Is this child…',
  'de': 'Ist dieses Kind…',
  'es': 'Este hijo/a es…',
  'fr': 'Cet enfant est-il…',
  'it': 'Questo figlio o figlia è…',
  'nl': 'Is dit kind…',
  'pt-BR': 'Esse filho(a) é…',
  'zh-Hans': '这个子女是……',
  'zh-Hant': '這名子女是……',
} as const satisfies SuppliedWording;

/** The instruction shown while the connect tool is on. */
const CONNECT_HINT = {
  'en': 'Select a person, then select another to connect them.',
  'de': 'Wählen Sie eine Person aus und dann eine weitere, um die beiden zu verbinden.',
  'es': 'Selecciona una persona y luego otra para conectarlas.',
  'fr': 'Sélectionnez une personne, puis une autre pour les relier.',
  'it': 'Seleziona una persona, poi un’altra per collegarle.',
  'nl': 'Selecteer een persoon en daarna een andere om ze te verbinden.',
  'pt-BR': 'Selecione uma pessoa e depois outra para conectá-las.',
  'zh-Hans': '选择一个人，再选择另一个人，即可将两人相连。',
  'zh-Hant': '選取一個人，再選取另一個人，即可連結兩人。',
} as const satisfies SuppliedWording;

/** The menu option for connecting a parent and child, naming both. */
const CONNECT_PARENT = {
  'en': '{parentIsYou, select, true {You are a parent of “{child}”} other {{childIsYou, select, true {“{parent}” is your parent} other {“{parent}” is a parent of “{child}”}}}}',
  'de': '{parentIsYou, select, true {Sie sind ein Elternteil von „{child}“} other {{childIsYou, select, true {„{parent}“ ist Ihr Elternteil} other {„{parent}“ ist ein Elternteil von „{child}“}}}}',
  'es': '{parentIsYou, select, true {Eres progenitor de «{child}»} other {{childIsYou, select, true {«{parent}» es tu progenitor} other {«{parent}» es progenitor de «{child}»}}}}',
  'fr': '{parentIsYou, select, true {Vous êtes parent de « {child} »} other {{childIsYou, select, true {« {parent} » est votre parent} other {« {parent} » est parent de « {child} »}}}}',
  'it': '{parentIsYou, select, true {Sei un genitore di «{child}»} other {{childIsYou, select, true {«{parent}» è un tuo genitore} other {«{parent}» è un genitore di «{child}»}}}}',
  'nl': '{parentIsYou, select, true {Jij bent een ouder van “{child}”} other {{childIsYou, select, true {“{parent}” is jouw ouder} other {“{parent}” is een ouder van “{child}”}}}}',
  'pt-BR':
    '{parentIsYou, select, true {Você é pai/mãe de “{child}”} other {{childIsYou, select, true {“{parent}” é seu pai/mãe} other {“{parent}” é pai/mãe de “{child}”}}}}',
  'zh-Hans':
    '{parentIsYou, select, true {您是“{child}”的父母} other {{childIsYou, select, true {“{parent}”是您的父母} other {“{parent}”是“{child}”的父母}}}}',
  'zh-Hant':
    '{parentIsYou, select, true {您是「{child}」的父母} other {{childIsYou, select, true {「{parent}」是您的父母} other {「{parent}」是「{child}」的父母}}}}',
} as const satisfies SuppliedWording;

/** The menu option for connecting two people who are, or were, partners. */
const CONNECT_PARTNERS = {
  'en': '{current, select, true {{firstIsYou, select, true {You and “{second}” are partners} other {“{first}” and “{second}” are partners}}} other {{firstIsYou, select, true {You and “{second}” were partners} other {“{first}” and “{second}” were partners}}}}',
  'de': '{current, select, true {{firstIsYou, select, true {Sie und „{second}“ sind ein Paar} other {„{first}“ und „{second}“ sind ein Paar}}} other {{firstIsYou, select, true {Sie und „{second}“ waren ein Paar} other {„{first}“ und „{second}“ waren ein Paar}}}}',
  'es': '{current, select, true {{firstIsYou, select, true {«{second}» es tu pareja} other {«{first}» y «{second}» son pareja}}} other {{firstIsYou, select, true {«{second}» fue tu pareja} other {«{first}» y «{second}» fueron pareja}}}}',
  'fr': '{current, select, true {{firstIsYou, select, true {Vous et « {second} » êtes en couple} other {« {first} » et « {second} » sont en couple}}} other {{firstIsYou, select, true {Vous et « {second} » étiez en couple} other {« {first} » et « {second} » étaient en couple}}}}',
  'it': '{current, select, true {{firstIsYou, select, true {Tu e «{second}» siete una coppia} other {«{first}» e «{second}» sono una coppia}}} other {{firstIsYou, select, true {Tu e «{second}» eravate una coppia} other {«{first}» e «{second}» erano una coppia}}}}',
  'nl': '{current, select, true {{firstIsYou, select, true {Jij en “{second}” zijn partners} other {“{first}” en “{second}” zijn partners}}} other {{firstIsYou, select, true {Jij en “{second}” waren partners} other {“{first}” en “{second}” waren partners}}}}',
  'pt-BR':
    '{current, select, true {{firstIsYou, select, true {Você e “{second}” são um casal} other {“{first}” e “{second}” são um casal}}} other {{firstIsYou, select, true {Você e “{second}” foram um casal} other {“{first}” e “{second}” foram um casal}}}}',
  'zh-Hans':
    '{current, select, true {{firstIsYou, select, true {您和“{second}”是伴侣} other {“{first}”和“{second}”是伴侣}}} other {{firstIsYou, select, true {您和“{second}”曾是伴侣} other {“{first}”和“{second}”曾是伴侣}}}}',
  'zh-Hant':
    '{current, select, true {{firstIsYou, select, true {您和「{second}」是伴侶} other {「{first}」和「{second}」是伴侶}}} other {{firstIsYou, select, true {您和「{second}」曾是伴侶} other {「{first}」和「{second}」曾是伴侶}}}}',
} as const satisfies SuppliedWording;

/** The heading of the menu shown after two people are selected to connect. */
const CONNECT_QUESTION = {
  'en': '{firstIsYou, select, true {How are you and “{second}” related?} other {How are “{first}” and “{second}” related?}}',
  'de': '{firstIsYou, select, true {In welcher Beziehung stehen Sie und „{second}“ zueinander?} other {In welcher Beziehung stehen „{first}“ und „{second}“ zueinander?}}',
  'es': '{firstIsYou, select, true {¿Qué relación tienes con «{second}»?} other {¿Qué relación hay entre «{first}» y «{second}»?}}',
  'fr': '{firstIsYou, select, true {Quel est votre lien avec « {second} » ?} other {Quel est le lien entre « {first} » et « {second} » ?}}',
  'it': '{firstIsYou, select, true {Che rapporto c’è tra te e «{second}»?} other {Che rapporto c’è tra «{first}» e «{second}»?}}',
  'nl': '{firstIsYou, select, true {Wat is de relatie tussen jou en “{second}”?} other {Wat is de relatie tussen “{first}” en “{second}”?}}',
  'pt-BR':
    '{firstIsYou, select, true {Qual é a relação entre você e “{second}”?} other {Qual é a relação entre “{first}” e “{second}”?}}',
  'zh-Hans':
    '{firstIsYou, select, true {您和“{second}”是什么关系？} other {“{first}”和“{second}”是什么关系？}}',
  'zh-Hant':
    '{firstIsYou, select, true {您和「{second}」是什麼關係？} other {「{first}」和「{second}」是什麼關係？}}',
} as const satisfies SuppliedWording;

/** The explanation shown before removing the connection between two people. */
const DISCONNECT_CONFIRM_DESCRIPTION = {
  'en': 'Both people stay in your family tree. Only the connection between them is removed.',
  'de': 'Beide Personen bleiben in Ihrem Stammbaum. Nur die Verbindung zwischen ihnen wird entfernt.',
  'es': 'Ambas personas siguen en tu árbol familiar. Solo se quita la conexión entre ellas.',
  'fr': 'Les deux personnes restent dans votre arbre généalogique. Seul le lien entre elles est supprimé.',
  'it': 'Entrambe le persone restano nel tuo albero genealogico. Viene rimosso solo il collegamento tra loro.',
  'nl': 'Beide personen blijven in je stamboom. Alleen de verbinding tussen hen wordt verwijderd.',
  'pt-BR':
    'As duas pessoas continuam na sua árvore genealógica. Só a conexão entre elas é removida.',
  'zh-Hans': '两人都会保留在您的家谱图中，只会移除他们之间的连接。',
  'zh-Hant': '兩人都會保留在您的家譜圖中，只會移除他們之間的連結。',
} as const satisfies SuppliedWording;

/** The title of the confirmation shown before removing the connection between two people. */
const DISCONNECT_CONFIRM_TITLE = {
  'en': '{firstIsYou, select, true {Remove the connection between you and “{second}”?} other {Remove the connection between “{first}” and “{second}”?}}',
  'de': '{firstIsYou, select, true {Verbindung zwischen Ihnen und „{second}“ entfernen?} other {Verbindung zwischen „{first}“ und „{second}“ entfernen?}}',
  'es': '{firstIsYou, select, true {¿Quitar la conexión entre tú y «{second}»?} other {¿Quitar la conexión entre «{first}» y «{second}»?}}',
  'fr': '{firstIsYou, select, true {Supprimer le lien entre vous et « {second} » ?} other {Supprimer le lien entre « {first} » et « {second} » ?}}',
  'it': '{firstIsYou, select, true {Rimuovere il collegamento tra te e «{second}»?} other {Rimuovere il collegamento tra «{first}» e «{second}»?}}',
  'nl': '{firstIsYou, select, true {De verbinding tussen jou en “{second}” verwijderen?} other {De verbinding tussen “{first}” en “{second}” verwijderen?}}',
  'pt-BR':
    '{firstIsYou, select, true {Remover a conexão entre você e “{second}”?} other {Remover a conexão entre “{first}” e “{second}”?}}',
  'zh-Hans':
    '{firstIsYou, select, true {要移除您和“{second}”之间的连接吗？} other {要移除“{first}”和“{second}”之间的连接吗？}}',
  'zh-Hant':
    '{firstIsYou, select, true {要移除您和「{second}」之間的連結嗎？} other {要移除「{first}」和「{second}」之間的連結嗎？}}',
} as const satisfies SuppliedWording;

/** The instruction shown while the disconnect tool is on. */
const DISCONNECT_HINT = {
  'en': 'Select a person, then select someone they are connected to, to remove that connection.',
  'de': 'Wählen Sie eine Person aus und dann jemanden, mit dem sie verbunden ist, um diese Verbindung zu entfernen.',
  'es': 'Selecciona una persona y luego alguien con quien esté conectada para quitar esa conexión.',
  'fr': 'Sélectionnez une personne, puis une personne qui lui est reliée, pour supprimer ce lien.',
  'it': 'Seleziona una persona, poi qualcuno a cui è collegata, per rimuovere quel collegamento.',
  'nl': 'Selecteer een persoon en daarna iemand met wie die persoon verbonden is, om die verbinding te verwijderen.',
  'pt-BR':
    'Selecione uma pessoa e depois alguém conectado a ela para remover essa conexão.',
  'zh-Hans': '选择一个人，再选择与其相连的人，即可移除这条连接。',
  'zh-Hant': '選取一個人，再選取與其連結的人，即可移除這個連結。',
} as const satisfies SuppliedWording;

/** The notice shown when removing a connection would leave people outside the family tree. */
const DISCONNECT_WOULD_CUT_OFF = {
  'en': '{count, plural, one {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.} other {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.}}',
  'de': '{count, plural, one {Wenn Sie diese Verbindung entfernen, wäre {names} nicht mehr Teil Ihres Stammbaums. Verbinden Sie diese Person zuerst mit jemand anderem aus Ihrer Familie.} other {Wenn Sie diese Verbindung entfernen, wären {names} nicht mehr Teil Ihres Stammbaums. Verbinden Sie diese Personen zuerst mit jemand anderem aus Ihrer Familie.}}',
  'es': '{count, plural, one {Si quitas esta conexión, {names} quedaría fuera de tu árbol familiar. Primero conecta a esa persona con otra persona de tu familia.} other {Si quitas esta conexión, {names} quedarían fuera de tu árbol familiar. Primero conecta a esas personas con otra persona de tu familia.}}',
  'fr': '{count, plural, one {Supprimer ce lien laisserait {names} en dehors de votre arbre généalogique. Reliez d’abord cette personne à quelqu’un d’autre de votre famille.} other {Supprimer ce lien laisserait {names} en dehors de votre arbre généalogique. Reliez d’abord ces personnes à quelqu’un d’autre de votre famille.}}',
  'it': '{count, plural, one {Rimuovendo questo collegamento, {names} resterebbe fuori dal tuo albero genealogico. Prima collega questa persona a qualcun altro della tua famiglia.} other {Rimuovendo questo collegamento, {names} resterebbero fuori dal tuo albero genealogico. Prima collega queste persone a qualcun altro della tua famiglia.}}',
  'nl': '{count, plural, one {Als je deze verbinding verwijdert, valt {names} buiten je stamboom. Verbind deze persoon eerst met iemand anders in je familie.} other {Als je deze verbinding verwijdert, vallen {names} buiten je stamboom. Verbind deze personen eerst met iemand anders in je familie.}}',
  'pt-BR':
    '{count, plural, one {Remover essa conexão deixaria {names} fora da sua árvore genealógica. Primeiro conecte essa pessoa a outra pessoa da sua família.} other {Remover essa conexão deixaria {names} fora da sua árvore genealógica. Primeiro conecte essas pessoas a outra pessoa da sua família.}}',
  'zh-Hans':
    '{count, plural, other {移除这条连接会使{names}脱离您的家谱图。请先将其与您家庭中的其他人相连。}}',
  'zh-Hant':
    '{count, plural, other {移除這個連結會使{names}脫離您的家譜圖。請先將其與您家庭中的其他人連結。}}',
} as const satisfies SuppliedWording;

/** The answer option for a question about a family member when the participant does not know. */
const DONT_KNOW = {
  'en': 'Don’t know',
  'de': 'Weiß ich nicht',
  'es': 'No lo sé',
  'fr': 'Je ne sais pas',
  'it': 'Non lo so',
  'nl': 'Weet ik niet',
  'pt-BR': 'Não sei',
  'zh-Hans': '不知道',
  'zh-Hant': '不知道',
} as const satisfies SuppliedWording;

/** The title of the side panel for a family member being described or added. */
const PANEL_TITLE = {
  'en': '{relation, select, edit {{isYou, select, true {About you} other {About {name}}}} parent {{isYou, select, true {Add your parent} other {Add a parent of {name}}}} sibling {{isYou, select, true {Add your sibling} other {Add a sibling of {name}}}} partner {{isYou, select, true {Add your partner} other {Add a partner of {name}}}} other {{isYou, select, true {Add your child} other {Add a child of {name}}}}}',
  'de': '{relation, select, edit {{isYou, select, true {Über Sie} other {Über {name}}}} parent {{isYou, select, true {Ihren Elternteil hinzufügen} other {Einen Elternteil von {name} hinzufügen}}} sibling {{isYou, select, true {Ihr Geschwisterteil hinzufügen} other {Ein Geschwisterteil von {name} hinzufügen}}} partner {{isYou, select, true {Ihre Partnerperson hinzufügen} other {Eine Partnerperson von {name} hinzufügen}}} other {{isYou, select, true {Ihr Kind hinzufügen} other {Ein Kind von {name} hinzufügen}}}}',
  'es': '{relation, select, edit {{isYou, select, true {Sobre ti} other {Sobre {name}}}} parent {{isYou, select, true {Añadir tu progenitor} other {Añadir un progenitor de {name}}}} sibling {{isYou, select, true {Añadir tu hermano/a} other {Añadir un hermano/a de {name}}}} partner {{isYou, select, true {Añadir tu pareja} other {Añadir una pareja de {name}}}} other {{isYou, select, true {Añadir tu hijo/a} other {Añadir un hijo/a de {name}}}}}',
  'fr': '{relation, select, edit {{isYou, select, true {À propos de vous} other {À propos de {name}}}} parent {{isYou, select, true {Ajouter un de vos parents} other {Ajouter un parent de {name}}}} sibling {{isYou, select, true {Ajouter votre frère ou sœur} other {Ajouter un frère ou une sœur de {name}}}} partner {{isYou, select, true {Ajouter votre partenaire} other {Ajouter un ou une partenaire de {name}}}} other {{isYou, select, true {Ajouter votre enfant} other {Ajouter un enfant de {name}}}}}',
  'it': '{relation, select, edit {{isYou, select, true {Su di te} other {Su {name}}}} parent {{isYou, select, true {Aggiungi un tuo genitore} other {Aggiungi un genitore di {name}}}} sibling {{isYou, select, true {Aggiungi tuo fratello o tua sorella} other {Aggiungi un fratello o una sorella di {name}}}} partner {{isYou, select, true {Aggiungi il tuo partner} other {Aggiungi un partner di {name}}}} other {{isYou, select, true {Aggiungi tuo figlio o tua figlia} other {Aggiungi un figlio o una figlia di {name}}}}}',
  'nl': '{relation, select, edit {{isYou, select, true {Over jou} other {Over {name}}}} parent {{isYou, select, true {Een ouder van jou toevoegen} other {Een ouder van {name} toevoegen}}} sibling {{isYou, select, true {Je broer of zus toevoegen} other {Een broer of zus van {name} toevoegen}}} partner {{isYou, select, true {Je partner toevoegen} other {Een partner van {name} toevoegen}}} other {{isYou, select, true {Je kind toevoegen} other {Een kind van {name} toevoegen}}}}',
  'pt-BR':
    '{relation, select, edit {{isYou, select, true {Sobre você} other {Sobre {name}}}} parent {{isYou, select, true {Adicionar seu pai ou sua mãe} other {Adicionar pai ou mãe de {name}}}} sibling {{isYou, select, true {Adicionar seu irmão ou sua irmã} other {Adicionar irmão ou irmã de {name}}}} partner {{isYou, select, true {Adicionar seu parceiro ou sua parceira} other {Adicionar parceiro ou parceira de {name}}}} other {{isYou, select, true {Adicionar seu filho ou sua filha} other {Adicionar filho ou filha de {name}}}}}',
  'zh-Hans':
    '{relation, select, edit {{isYou, select, true {关于您} other {关于{name}}}} parent {{isYou, select, true {添加您的父母} other {添加{name}的父母}}} sibling {{isYou, select, true {添加您的兄弟姐妹} other {添加{name}的兄弟姐妹}}} partner {{isYou, select, true {添加您的伴侣} other {添加{name}的伴侣}}} other {{isYou, select, true {添加您的子女} other {添加{name}的子女}}}}',
  'zh-Hant':
    '{relation, select, edit {{isYou, select, true {關於您} other {關於{name}}}} parent {{isYou, select, true {新增您的父母} other {新增{name}的父母}}} sibling {{isYou, select, true {新增您的手足} other {新增{name}的手足}}} partner {{isYou, select, true {新增您的伴侶} other {新增{name}的伴侶}}} other {{isYou, select, true {新增您的子女} other {新增{name}的子女}}}}',
} as const satisfies SuppliedWording;

/** The explanation under the heading of the choice of words. Asked only when participants choose the words. */
const FRAMING_CHOICE_DESCRIPTION = {
  'en': 'Choose the words you would like us to use for the people in your family. You can change this at any time.',
  'de': 'Wählen Sie die Wörter, mit denen wir die Menschen in Ihrer Familie beschreiben sollen. Sie können das jederzeit ändern.',
  'es': 'Elige las palabras que quieres que usemos para las personas de tu familia. Puedes cambiarlo en cualquier momento.',
  'fr': 'Choisissez les mots que nous utiliserons pour désigner les personnes de votre famille. Vous pouvez modifier ce choix à tout moment.',
  'it': 'Scegli le parole che vuoi che usiamo per le persone della tua famiglia. Puoi cambiarle in qualsiasi momento.',
  'nl': 'Kies de woorden die we gebruiken voor de mensen in je familie. Je kunt dit altijd wijzigen.',
  'pt-BR':
    'Escolha as palavras que você quer que usemos para as pessoas da sua família. Você pode mudar isso a qualquer momento.',
  'zh-Hans': '请选择我们描述您家人时使用的称谓。您可以随时更改。',
  'zh-Hant': '請選擇我們描述您家人時使用的稱謂。您可以隨時變更。',
} as const satisfies SuppliedWording;

/** The heading of the choice of words. Asked only when participants choose the words. */
const FRAMING_CHOICE_TITLE = {
  'en': 'How should we describe your family?',
  'de': 'Wie sollen wir Ihre Familie beschreiben?',
  'es': '¿Cómo quieres que describamos a tu familia?',
  'fr': 'Comment devons-nous décrire votre famille ?',
  'it': 'Come dobbiamo descrivere la tua famiglia?',
  'nl': 'Hoe zullen we je familie beschrijven?',
  'pt-BR': 'Como devemos descrever sua família?',
  'zh-Hans': '我们应如何称呼您的家人？',
  'zh-Hant': '我們應如何稱呼您的家人？',
} as const satisfies SuppliedWording;

/** The question about a family member's gender identity. Asked only when the stage asks about it. */
const GENDER_IDENTITY_LABEL = {
  'en': 'Gender identity',
  'de': 'Geschlechtsidentität',
  'es': 'Identidad de género',
  'fr': 'Identité de genre',
  'it': 'Identità di genere',
  'nl': 'Genderidentiteit',
  'pt-BR': 'Identidade de gênero',
  'zh-Hans': '性别认同',
  'zh-Hant': '性別認同',
} as const satisfies SuppliedWording;

/** The label for a relative the participant did not name, which is also saved as their name. */
const GENERATED_LABEL_OF = {
  'en': '{relation, select, partner {{isYou, select, true {{term} (your partner)} other {{term} (partner of {name})}}} parent {{isYou, select, true {{term} (your parent)} other {{term} (parent of {name})}}} sibling {{isYou, select, true {{term} (your sibling)} other {{term} (sibling of {name})}}} owner {{owner}’s {term}} other {{isYou, select, true {{term} (your child)} other {{term} (child of {name})}}}}',
  'de': '{relation, select, partner {{isYou, select, true {{term} (Ihre Partnerperson)} other {{term} (Partnerperson von {name})}}} parent {{isYou, select, true {{term} (Ihr Elternteil)} other {{term} (Elternteil von {name})}}} sibling {{isYou, select, true {{term} (Ihr Geschwisterteil)} other {{term} (Geschwisterteil von {name})}}} owner {{term} von {owner}} other {{isYou, select, true {{term} (Ihr Kind)} other {{term} (Kind von {name})}}}}',
  'es': '{relation, select, partner {{isYou, select, true {{term} (tu pareja)} other {{term} (pareja de {name})}}} parent {{isYou, select, true {{term} (tu progenitor)} other {{term} (progenitor de {name})}}} sibling {{isYou, select, true {{term} (tu hermano/a)} other {{term} (hermano/a de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (tu hijo/a)} other {{term} (hijo/a de {name})}}}}',
  'fr': '{relation, select, partner {{isYou, select, true {{term} (votre partenaire)} other {{term} (partenaire de {name})}}} parent {{isYou, select, true {{term} (votre parent)} other {{term} (parent de {name})}}} sibling {{isYou, select, true {{term} (votre frère ou sœur)} other {{term} (frère ou sœur de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (votre enfant)} other {{term} (enfant de {name})}}}}',
  'it': '{relation, select, partner {{isYou, select, true {{term} (tuo partner)} other {{term} (partner di {name})}}} parent {{isYou, select, true {{term} (tuo genitore)} other {{term} (genitore di {name})}}} sibling {{isYou, select, true {{term} (tuo fratello o tua sorella)} other {{term} (fratello o sorella di {name})}}} owner {{term} di {owner}} other {{isYou, select, true {{term} (tuo figlio o tua figlia)} other {{term} (figlio o figlia di {name})}}}}',
  'nl': '{relation, select, partner {{isYou, select, true {{term} (jouw partner)} other {{term} (partner van {name})}}} parent {{isYou, select, true {{term} (jouw ouder)} other {{term} (ouder van {name})}}} sibling {{isYou, select, true {{term} (jouw broer of zus)} other {{term} (broer of zus van {name})}}} owner {{term} van {owner}} other {{isYou, select, true {{term} (jouw kind)} other {{term} (kind van {name})}}}}',
  'pt-BR':
    '{relation, select, partner {{isYou, select, true {{term} (seu parceiro ou parceira)} other {{term} (parceiro ou parceira de {name})}}} parent {{isYou, select, true {{term} (seu pai/mãe)} other {{term} (pai/mãe de {name})}}} sibling {{isYou, select, true {{term} (seu irmão/irmã)} other {{term} (irmão/irmã de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (seu filho ou filha)} other {{term} (filho ou filha de {name})}}}}',
  'zh-Hans':
    '{relation, select, partner {{isYou, select, true {{term}（您的伴侣）} other {{term}（{name}的伴侣）}}} parent {{isYou, select, true {{term}（您的家长）} other {{term}（{name}的家长）}}} sibling {{isYou, select, true {{term}（您的兄弟姐妹）} other {{term}（{name}的兄弟姐妹）}}} owner {{owner}的{term}} other {{isYou, select, true {{term}（您的子女）} other {{term}（{name}的子女）}}}}',
  'zh-Hant':
    '{relation, select, partner {{isYou, select, true {{term}（您的伴侶）} other {{term}（{name}的伴侶）}}} parent {{isYou, select, true {{term}（您的家長）} other {{term}（{name}的家長）}}} sibling {{isYou, select, true {{term}（您的手足）} other {{term}（{name}的手足）}}} owner {{owner}的{term}} other {{isYou, select, true {{term}（您的子女）} other {{term}（{name}的子女）}}}}',
} as const satisfies SuppliedWording;

/** The notice listing the questions about a family member not yet answered. */
const MISSING_DETAILS_LIST = {
  'en': 'Some details are missing: {details}.',
  'de': 'Es fehlen einige Angaben: {details}.',
  'es': 'Faltan algunos datos: {details}.',
  'fr': 'Des informations manquent : {details}.',
  'it': 'Mancano alcune informazioni: {details}.',
  'nl': 'Er ontbreken gegevens: {details}.',
  'pt-BR': 'Faltam algumas informações: {details}.',
  'zh-Hans': '缺少一些信息：{details}。',
  'zh-Hant': '缺少部分資訊：{details}。',
} as const satisfies SuppliedWording;

/** The question asking who a child's other parent is. */
const OTHER_PARENT_LABEL = {
  'en': 'Who is the child’s other parent?',
  'de': 'Wer ist der andere Elternteil des Kindes?',
  'es': '¿Quién es el otro progenitor del hijo/a?',
  'fr': 'Qui est l’autre parent de l’enfant ?',
  'it': 'Chi è l’altro genitore di questo figlio o figlia?',
  'nl': 'Wie is de andere ouder van het kind?',
  'pt-BR': 'Quem é o outro pai/mãe desse filho(a)?',
  'zh-Hans': '这个子女的另一位家长是谁？',
  'zh-Hant': '這名子女的另一位家長是誰？',
} as const satisfies SuppliedWording;

/** The option that the child has only the one parent. */
const OTHER_PARENT_NONE = {
  'en': 'No other parent',
  'de': 'Kein anderer Elternteil',
  'es': 'Ningún otro progenitor',
  'fr': 'Pas d’autre parent',
  'it': 'Nessun altro genitore',
  'nl': 'Geen andere ouder',
  'pt-BR': 'Nenhum outro pai/mãe',
  'zh-Hans': '没有另一位家长',
  'zh-Hant': '沒有另一位家長',
} as const satisfies SuppliedWording;

/** The option that the child's other parent is not in the family tree yet. */
const OTHER_PARENT_UNKNOWN = {
  'en': 'Someone not shown yet',
  'de': 'Jemand, der noch nicht angezeigt wird',
  'es': 'Alguien que aún no aparece',
  'fr': 'Une personne qui n’apparaît pas encore',
  'it': 'Qualcuno non ancora presente',
  'nl': 'Iemand die nog niet getoond wordt',
  'pt-BR': 'Alguém que ainda não aparece',
  'zh-Hans': '尚未显示的人',
  'zh-Hant': '尚未顯示的人',
} as const satisfies SuppliedWording;

/** The yes or no question asking whether a biological parent carried the pregnancy. */
const PARENT_CARRIED_LABEL = {
  'en': '{named, select, true {{parentIsYou, select, true {Did you carry the pregnancy?} other {Did {parent} carry the pregnancy?}}} other {Did this parent carry the pregnancy?}}',
  'de': '{named, select, true {{parentIsYou, select, true {Haben Sie das Kind ausgetragen?} other {Hat {parent} das Kind ausgetragen?}}} other {Hat dieser Elternteil das Kind ausgetragen?}}',
  'es': '{named, select, true {{parentIsYou, select, true {¿Llevaste tú el embarazo?} other {¿Llevó {parent} el embarazo?}}} other {¿Fue este progenitor quien llevó el embarazo?}}',
  'fr': '{named, select, true {{parentIsYou, select, true {Avez-vous porté la grossesse ?} other {Est-ce que {parent} a porté la grossesse ?}}} other {Ce parent a-t-il porté la grossesse ?}}',
  'it': '{named, select, true {{parentIsYou, select, true {Hai portato avanti tu la gravidanza?} other {{parent} ha portato avanti la gravidanza?}}} other {Questo genitore ha portato avanti la gravidanza?}}',
  'nl': '{named, select, true {{parentIsYou, select, true {Heb jij de zwangerschap gedragen?} other {Heeft {parent} de zwangerschap gedragen?}}} other {Heeft deze ouder de zwangerschap gedragen?}}',
  'pt-BR':
    '{named, select, true {{parentIsYou, select, true {Foi você quem gestou?} other {Foi {parent} quem gestou?}}} other {Foi essa pessoa quem gestou?}}',
  'zh-Hans':
    '{named, select, true {{parentIsYou, select, true {是由您怀孕的吗？} other {是由{parent}怀孕的吗？}}} other {是否由这位家长怀孕？}}',
  'zh-Hant':
    '{named, select, true {{parentIsYou, select, true {是由您懷孕的嗎？} other {是由{parent}懷孕的嗎？}}} other {是否由這位家長懷孕？}}',
} as const satisfies SuppliedWording;

/** The menu option for a genetic parent who also carried the pregnancy. The kind of parent is written in before it. */
const PARENT_KIND_BIOLOGICAL_CARRIER = {
  'en': '{parentKind} (carried the pregnancy)',
  'de': '{parentKind} (hat das Kind ausgetragen)',
  'es': '{parentKind} (llevó el embarazo)',
  'fr': '{parentKind} (a porté la grossesse)',
  'it': '{parentKind} (ha portato avanti la gravidanza)',
  'nl': '{parentKind} (droeg de zwangerschap)',
  'pt-BR': '{parentKind} (gestou a criança)',
  'zh-Hans': '{parentKind}（亲自怀孕）',
  'zh-Hant': '{parentKind}（親自懷孕）',
} as const satisfies SuppliedWording;

/** The question asking how a new parent is a parent of the selected family member. */
const PARENT_KIND_LABEL = {
  'en': 'What kind of parent are they?',
  'de': 'Welche Art von Elternteil ist diese Person?',
  'es': '¿Qué tipo de progenitor es?',
  'fr': 'De quel type de parent s’agit-il ?',
  'it': 'Che tipo di genitore è?',
  'nl': 'Wat voor ouder is deze persoon?',
  'pt-BR': 'Que tipo de pai/mãe é essa pessoa?',
  'zh-Hans': '此人是哪种父母？',
  'zh-Hant': '此人是哪種父母？',
} as const satisfies SuppliedWording;

/** The start of a sentence about a family member's parent, which the chosen kind of parent completes. */
const PARENT_LINK_KIND_LABEL = {
  'en': '{parentIsYou, select, true {You are their…} other {{personIsYou, select, true {{parent} is your…} other {{parent} is their…}}}}',
  'de': '{parentIsYou, select, true {Sie sind für diese Person…} other {{personIsYou, select, true {{parent} ist für Sie…} other {{parent} ist für diese Person…}}}}',
  'es': '{parentIsYou, select, true {Para esta persona, eres…} other {{personIsYou, select, true {Para ti, {parent} es…} other {Para esta persona, {parent} es…}}}}',
  'fr': '{parentIsYou, select, true {Pour cette personne, vous êtes…} other {{personIsYou, select, true {Pour vous, {parent} est…} other {Pour cette personne, {parent} est…}}}}',
  'it': '{parentIsYou, select, true {Per questa persona, tu sei…} other {{personIsYou, select, true {Per te, {parent} è…} other {Per questa persona, {parent} è…}}}}',
  'nl': '{parentIsYou, select, true {Voor deze persoon ben jij…} other {{personIsYou, select, true {Voor jou is {parent}…} other {Voor deze persoon is {parent}…}}}}',
  'pt-BR':
    '{parentIsYou, select, true {Para essa pessoa, você é…} other {{personIsYou, select, true {Para você, {parent} é…} other {Para essa pessoa, {parent} é…}}}}',
  'zh-Hans':
    '{parentIsYou, select, true {对此人来说，您是……} other {{personIsYou, select, true {对您来说，{parent}是……} other {对此人来说，{parent}是……}}}}',
  'zh-Hant':
    '{parentIsYou, select, true {對此人而言，您是……} other {{personIsYou, select, true {對您而言，{parent}是……} other {對此人而言，{parent}是……}}}}',
} as const satisfies SuppliedWording;

/** The question asking whether a new parent is, or was, the partner of a parent already in the family. */
const PARENT_PARTNER_LABEL = {
  'en': 'Are they the partner of another parent?',
  'de': 'Ist diese Person die Partnerperson eines anderen Elternteils?',
  'es': '¿Es pareja de otro progenitor?',
  'fr': 'Cette personne est-elle partenaire d’un autre parent ?',
  'it': 'È partner di un altro genitore?',
  'nl': 'Is deze persoon de partner van een andere ouder?',
  'pt-BR': 'Essa pessoa é parceira de outro pai/mãe?',
  'zh-Hans': '此人是否是另一位家长的伴侣？',
  'zh-Hant': '此人是否為另一位家長的伴侶？',
} as const satisfies SuppliedWording;

/** The note shown when adding a sibling to someone who has no parents recorded yet. */
const PLACEHOLDER_PARENTS_NOTE = {
  'en': '{framing, select, gamete {An egg parent and a sperm parent will be added for you to fill in later, so the family tree can show these siblings together.} other {A biological mother and a biological father will be added for you to fill in later, so the family tree can show these siblings together.}}',
  'de': '{framing, select, gamete {Ein Eizell-Elternteil und ein Samen-Elternteil werden hinzugefügt, die Sie später ergänzen können, damit der Stammbaum diese Geschwister gemeinsam zeigen kann.} other {Eine leibliche Mutter und ein leiblicher Vater werden hinzugefügt, die Sie später ergänzen können, damit der Stammbaum diese Geschwister gemeinsam zeigen kann.}}',
  'es': '{framing, select, gamete {Se añadirán un progenitor de óvulo y un progenitor de esperma para que los completes más tarde, de modo que el árbol familiar pueda mostrar juntos a estos hermanos.} other {Se añadirán una madre biológica y un padre biológico para que los completes más tarde, de modo que el árbol familiar pueda mostrar juntos a estos hermanos.}}',
  'fr': '{framing, select, gamete {Un parent de l’ovule et un parent du sperme seront ajoutés, à compléter plus tard, afin que l’arbre généalogique puisse montrer ces frères et sœurs ensemble.} other {Une mère biologique et un père biologique seront ajoutés, à compléter plus tard, afin que l’arbre généalogique puisse montrer ces frères et sœurs ensemble.}}',
  'it': '{framing, select, gamete {Verranno aggiunti un genitore dell’ovulo e un genitore dello sperma, da completare in seguito, così che l’albero genealogico possa mostrare insieme questi fratelli e sorelle.} other {Verranno aggiunti una madre biologica e un padre biologico, da completare in seguito, così che l’albero genealogico possa mostrare insieme questi fratelli e sorelle.}}',
  'nl': '{framing, select, gamete {Er worden een eicelouder en een zaadouder toegevoegd die je later kunt aanvullen, zodat de stamboom deze broers en zussen samen kan tonen.} other {Er worden een biologische moeder en een biologische vader toegevoegd die je later kunt aanvullen, zodat de stamboom deze broers en zussen samen kan tonen.}}',
  'pt-BR':
    '{framing, select, gamete {Um genitor do óvulo e um genitor do esperma serão adicionados para você preencher depois, para que a árvore genealógica possa mostrar esses irmãos juntos.} other {Uma mãe biológica e um pai biológico serão adicionados para você preencher depois, para que a árvore genealógica possa mostrar esses irmãos juntos.}}',
  'zh-Hans':
    '{framing, select, gamete {系统将添加一位卵子方家长和一位精子方家长，供您稍后填写，以便家谱图将这些兄弟姐妹显示在一起。} other {系统将添加一位生母和一位生父，供您稍后填写，以便家谱图将这些兄弟姐妹显示在一起。}}',
  'zh-Hant':
    '{framing, select, gamete {系統會新增一位卵子方家長和一位精子方家長，供您稍後填寫，讓家譜圖能將這些手足顯示在一起。} other {系統會新增一位生母和一位生父，供您稍後填寫，讓家譜圖能將這些手足顯示在一起。}}',
} as const satisfies SuppliedWording;

/** The kinship word for a family member whose name is not known. */
const RELATIVE_TERM = {
  'en': "{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Bio­logical mother} biologicalFather {Bio­logical father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Step­mother} stepfather {Step­father} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surro­gate} daughter {Daughter} son {Son} child {Child} stepdaughter {Step­daughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Surro­gacy child} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} stepsister {Step­sister} stepbrother {Step­brother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grand­mother} grandfather {Grand­father} grandparent {Grand­parent} maternalGrandmother {Maternal grand­mother} maternalGrandfather {Maternal grand­father} maternalGrandparent {Maternal grand­parent} paternalGrandmother {Paternal grand­mother} paternalGrandfather {Paternal grand­father} paternalGrandparent {Paternal grand­parent} greatGrandmother {Great-grand­mother} greatGrandfather {Great-grand­father} greatGrandparent {Great-grand­parent} granddaughter {Grand­daughter} grandson {Grandson} grandchild {Grand­child} greatGranddaughter {Great-grand­daughter} greatGrandson {Great-grandson} greatGrandchild {Great-grand­child} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent's sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grand­parent's sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling's child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daugh­ter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}",
  'de': '{term, select, mother {Mutter} father {Vater} parent {Eltern­teil} eggParent {Eizell-Eltern­teil} spermParent {Samen-Eltern­teil} biologicalMother {Leibliche Mutter} biologicalFather {Leiblicher Vater} adoptiveMother {Adoptiv­mutter} adoptiveFather {Adoptiv­vater} adoptiveParent {Adoptiv­eltern­teil} stepmother {Stief­mutter} stepfather {Stief­vater} stepparent {Stief­eltern­teil} eggDonor {Eizell­spenderin} spermDonor {Samen­spender} donor {Spender/in} surrogate {Leih­mutter} daughter {Tochter} son {Sohn} child {Kind} stepdaughter {Stief­tochter} stepson {Stief­sohn} stepchild {Stief­kind} donorConceivedChild {Spender­kind} surrogacyChild {Kind aus Leih­mutter­schaft} sister {Schwester} brother {Bruder} sibling {Geschwister­teil} halfSister {Halb­schwester} halfBrother {Halb­bruder} halfSibling {Halb­geschwister­teil} stepsister {Stief­schwester} stepbrother {Stief­bruder} stepsibling {Stief­geschwister­teil} partner {Partner­person} formerPartner {Frühere Partner­person} grandmother {Groß­mutter} grandfather {Groß­vater} grandparent {Groß­eltern­teil} maternalGrandmother {Groß­mutter mütter­licher­seits} maternalGrandfather {Groß­vater mütter­licher­seits} maternalGrandparent {Groß­eltern­teil mütter­licher­seits} paternalGrandmother {Groß­mutter väter­licher­seits} paternalGrandfather {Groß­vater väter­licher­seits} paternalGrandparent {Groß­eltern­teil väter­licher­seits} greatGrandmother {Urgroß­mutter} greatGrandfather {Urgroß­vater} greatGrandparent {Urgroß­eltern­teil} granddaughter {Enkel­tochter} grandson {Enkel­sohn} grandchild {Enkel­kind} greatGranddaughter {Urenkel­tochter} greatGrandson {Urenkel­sohn} greatGrandchild {Urenkel­kind} aunt {Tante} uncle {Onkel} maternalAunt {Tante mütter­licher­seits} maternalUncle {Onkel mütter­licher­seits} paternalAunt {Tante väter­licher­seits} paternalUncle {Onkel väter­licher­seits} parentsSibling {Geschwister­teil eines Eltern­teils} greatAunt {Groß­tante} greatUncle {Groß­onkel} grandparentsSibling {Geschwister­teil eines Groß­eltern­teils} niece {Nichte} nephew {Neffe} siblingsChild {Kind eines Geschwister­teils} cousin {Cousin/Cousine} motherInLaw {Schwieger­mutter} fatherInLaw {Schwieger­vater} parentInLaw {Schwieger­eltern­teil} sisterInLaw {Schwägerin} brotherInLaw {Schwager} siblingInLaw {Schwager/Schwägerin} daughterInLaw {Schwieger­tochter} sonInLaw {Schwieger­sohn} childInLaw {Schwieger­kind} other {Verwandte Person}}',
  'es': '{term, select, mother {Madre} father {Padre} parent {Progeni­tor} eggParent {Progeni­tor de óvulo} spermParent {Progeni­tor de esperma} biologicalMother {Madre bio­lógica} biologicalFather {Padre bio­lógico} adoptiveMother {Madre adoptiva} adoptiveFather {Padre adoptivo} adoptiveParent {Progeni­tor adoptivo} stepmother {Madrastra} stepfather {Padrastro} stepparent {Padrastro/madrastra} eggDonor {Donante de óvulos} spermDonor {Donante de esperma} donor {Donante} surrogate {Gestante subrogada} daughter {Hija} son {Hijo} child {Hijo/a} stepdaughter {Hijastra} stepson {Hijastro} stepchild {Hijastro/a} donorConceivedChild {Hijo/a por donación} surrogacyChild {Hijo/a por gestación subrogada} sister {Hermana} brother {Hermano} sibling {Hermano/a} halfSister {Media hermana} halfBrother {Medio hermano} halfSibling {Medio/a hermano/a} stepsister {Herma­nastra} stepbrother {Herma­nastro} stepsibling {Herma­nastro/a} partner {Pareja} formerPartner {Expareja} grandmother {Abuela} grandfather {Abuelo} grandparent {Abuelo/a} maternalGrandmother {Abuela materna} maternalGrandfather {Abuelo materno} maternalGrandparent {Abuelo/a materno/a} paternalGrandmother {Abuela paterna} paternalGrandfather {Abuelo paterno} paternalGrandparent {Abuelo/a paterno/a} greatGrandmother {Bisabuela} greatGrandfather {Bisabuelo} greatGrandparent {Bisabuelo/a} granddaughter {Nieta} grandson {Nieto} grandchild {Nieto/a} greatGranddaughter {Bisnieta} greatGrandson {Bisnieto} greatGrandchild {Bisnieto/a} aunt {Tía} uncle {Tío} maternalAunt {Tía materna} maternalUncle {Tío materno} paternalAunt {Tía paterna} paternalUncle {Tío paterno} parentsSibling {Tío/a} greatAunt {Tía abuela} greatUncle {Tío abuelo} grandparentsSibling {Tío/a abuelo/a} niece {Sobrina} nephew {Sobrino} siblingsChild {Sobrino/a} cousin {Primo/a} motherInLaw {Suegra} fatherInLaw {Suegro} parentInLaw {Suegro/a} sisterInLaw {Cuñada} brotherInLaw {Cuñado} siblingInLaw {Cuñado/a} daughterInLaw {Nuera} sonInLaw {Yerno} childInLaw {Yerno/nuera} other {Pariente}}',
  'fr': '{term, select, mother {Mère} father {Père} parent {Parent} eggParent {Parent de l’ovule} spermParent {Parent du sperme} biologicalMother {Mère bio­logique} biologicalFather {Père bio­logique} adoptiveMother {Mère adoptive} adoptiveFather {Père adoptif} adoptiveParent {Parent adoptif} stepmother {Belle-mère} stepfather {Beau-père} stepparent {Beau-parent} eggDonor {Donneuse d’ovules} spermDonor {Donneur de sperme} donor {Personne donneuse} surrogate {Mère porteuse} daughter {Fille} son {Fils} child {Enfant} stepdaughter {Belle-fille} stepson {Beau-fils} stepchild {Enfant par alliance} donorConceivedChild {Enfant issu d’un don} surrogacyChild {Enfant issu d’une GPA} sister {Sœur} brother {Frère} sibling {Frère ou sœur} halfSister {Demi-sœur} halfBrother {Demi-frère} halfSibling {Demi-frère ou demi-sœur} stepsister {Quasi-sœur} stepbrother {Quasi-frère} stepsibling {Quasi-frère ou quasi-sœur} partner {Parte­naire} formerPartner {Ex-parte­naire} grandmother {Grand-mère} grandfather {Grand-père} grandparent {Grand-parent} maternalGrandmother {Grand-mère mater­nelle} maternalGrandfather {Grand-père maternel} maternalGrandparent {Grand-parent maternel} paternalGrandmother {Grand-mère pater­nelle} paternalGrandfather {Grand-père paternel} paternalGrandparent {Grand-parent paternel} greatGrandmother {Arrière-grand-mère} greatGrandfather {Arrière-grand-père} greatGrandparent {Arrière-grand-parent} granddaughter {Petite-fille} grandson {Petit-fils} grandchild {Petit-enfant} greatGranddaughter {Arrière-petite-fille} greatGrandson {Arrière-petit-fils} greatGrandchild {Arrière-petit-enfant} aunt {Tante} uncle {Oncle} maternalAunt {Tante mater­nelle} maternalUncle {Oncle maternel} paternalAunt {Tante pater­nelle} paternalUncle {Oncle paternel} parentsSibling {Frère ou sœur d’un parent} greatAunt {Grand-tante} greatUncle {Grand-oncle} grandparentsSibling {Frère ou sœur d’un grand-parent} niece {Nièce} nephew {Neveu} siblingsChild {Enfant d’un frère ou d’une sœur} cousin {Cousin ou cousine} motherInLaw {Mère de votre parte­naire} fatherInLaw {Père de votre parte­naire} parentInLaw {Parent de votre parte­naire} sisterInLaw {Belle-sœur} brotherInLaw {Beau-frère} siblingInLaw {Beau-frère ou belle-sœur} daughterInLaw {Conjointe de votre enfant} sonInLaw {Conjoint de votre enfant} childInLaw {Parte­naire de votre enfant} other {Proche}}',
  'it': '{term, select, mother {Madre} father {Padre} parent {Genitore} eggParent {Genitore dell’ovulo} spermParent {Genitore dello sperma} biologicalMother {Madre biolo­gica} biologicalFather {Padre biolo­gico} adoptiveMother {Madre adottiva} adoptiveFather {Padre adottivo} adoptiveParent {Genitore adottivo} stepmother {Madre acqui­sita} stepfather {Padre acqui­sito} stepparent {Genitore acqui­sito} eggDonor {Donatrice di ovuli} spermDonor {Donatore di sperma} donor {Persona donatrice} surrogate {Gestante per altri} daughter {Figlia} son {Figlio} child {Figlio o figlia} stepdaughter {Figlia acqui­sita} stepson {Figlio acqui­sito} stepchild {Figlio o figlia acqui­siti} donorConceivedChild {Figlio o figlia da dona­zione} surrogacyChild {Figlio o figlia da gesta­zione per altri} sister {Sorella} brother {Fratello} sibling {Fratello o sorella} halfSister {Sorel­lastra} halfBrother {Fratel­lastro} halfSibling {Fratel­lastro o sorel­lastra} stepsister {Sorella acqui­sita} stepbrother {Fratello acqui­sito} stepsibling {Fratello o sorella acqui­siti} partner {Partner} formerPartner {Ex partner} grandmother {Nonna} grandfather {Nonno} grandparent {Nonno o nonna} maternalGrandmother {Nonna materna} maternalGrandfather {Nonno materno} maternalGrandparent {Nonno o nonna materni} paternalGrandmother {Nonna paterna} paternalGrandfather {Nonno paterno} paternalGrandparent {Nonno o nonna paterni} greatGrandmother {Bisnonna} greatGrandfather {Bisnonno} greatGrandparent {Bisnonno o bisnonna} granddaughter {Nipote} grandson {Nipote} grandchild {Nipote} greatGranddaughter {Pronipote} greatGrandson {Pronipote} greatGrandchild {Pronipote} aunt {Zia} uncle {Zio} maternalAunt {Zia materna} maternalUncle {Zio materno} paternalAunt {Zia paterna} paternalUncle {Zio paterno} parentsSibling {Zio o zia} greatAunt {Prozia} greatUncle {Prozio} grandparentsSibling {Prozio o prozia} niece {Nipote} nephew {Nipote} siblingsChild {Nipote} cousin {Cugino o cugina} motherInLaw {Suocera} fatherInLaw {Suocero} parentInLaw {Suocero o suocera} sisterInLaw {Cognata} brotherInLaw {Cognato} siblingInLaw {Cognato o cognata} daughterInLaw {Nuora} sonInLaw {Genero} childInLaw {Genero o nuora} other {Parente}}',
  'nl': '{term, select, mother {Moeder} father {Vader} parent {Ouder} eggParent {Eicel­ouder} spermParent {Zaad­ouder} biologicalMother {Bio­logische moeder} biologicalFather {Bio­logische vader} adoptiveMother {Adoptief­moeder} adoptiveFather {Adoptief­vader} adoptiveParent {Adoptief­ouder} stepmother {Stief­moeder} stepfather {Stief­vader} stepparent {Stief­ouder} eggDonor {Eicel­donor} spermDonor {Zaad­donor} donor {Donor} surrogate {Draag­moeder} daughter {Dochter} son {Zoon} child {Kind} stepdaughter {Stief­dochter} stepson {Stief­zoon} stepchild {Stief­kind} donorConceivedChild {Donor­kind} surrogacyChild {Kind via draag­moeder­schap} sister {Zus} brother {Broer} sibling {Broer of zus} halfSister {Half­zus} halfBrother {Half­broer} halfSibling {Half­broer of -zus} stepsister {Stief­zus} stepbrother {Stief­broer} stepsibling {Stief­broer of -zus} partner {Partner} formerPartner {Ex-partner} grandmother {Oma} grandfather {Opa} grandparent {Groot­ouder} maternalGrandmother {Oma van moeders­kant} maternalGrandfather {Opa van moeders­kant} maternalGrandparent {Groot­ouder van moeders­kant} paternalGrandmother {Oma van vaders­kant} paternalGrandfather {Opa van vaders­kant} paternalGrandparent {Groot­ouder van vaders­kant} greatGrandmother {Over­groot­moeder} greatGrandfather {Over­groot­vader} greatGrandparent {Over­groot­ouder} granddaughter {Klein­dochter} grandson {Klein­zoon} grandchild {Klein­kind} greatGranddaughter {Achter­klein­dochter} greatGrandson {Achter­klein­zoon} greatGrandchild {Achter­klein­kind} aunt {Tante} uncle {Oom} maternalAunt {Tante van moeders­kant} maternalUncle {Oom van moeders­kant} paternalAunt {Tante van vaders­kant} paternalUncle {Oom van vaders­kant} parentsSibling {Broer of zus van een ouder} greatAunt {Oud­tante} greatUncle {Oudoom} grandparentsSibling {Broer of zus van een groot­ouder} niece {Nicht} nephew {Neef} siblingsChild {Kind van een broer of zus} cousin {Volle neef of nicht} motherInLaw {Schoon­moeder} fatherInLaw {Schoon­vader} parentInLaw {Schoon­ouder} sisterInLaw {Schoon­zus} brotherInLaw {Zwager} siblingInLaw {Zwager of schoon­zus} daughterInLaw {Schoon­dochter} sonInLaw {Schoon­zoon} childInLaw {Schoon­kind} other {Verwant}}',
  'pt-BR':
    '{term, select, mother {Mãe} father {Pai} parent {Pai/mãe} eggParent {Genitor do óvulo} spermParent {Genitor do esperma} biologicalMother {Mãe bio­lógica} biologicalFather {Pai bio­lógico} adoptiveMother {Mãe adotiva} adoptiveFather {Pai adotivo} adoptiveParent {Pai/mãe adotivo(a)} stepmother {Madrasta} stepfather {Padrasto} stepparent {Padrasto/madrasta} eggDonor {Doadora de óvulos} spermDonor {Doador de esperma} donor {Doador(a)} surrogate {Gestante substituta} daughter {Filha} son {Filho} child {Filho(a)} stepdaughter {Enteada} stepson {Enteado} stepchild {Enteado(a)} donorConceivedChild {Filho(a) por doação} surrogacyChild {Filho(a) por gestação de substi­tuição} sister {Irmã} brother {Irmão} sibling {Irmão/irmã} halfSister {Meia-irmã} halfBrother {Meio-irmão} halfSibling {Meio-irmão/meia-irmã} stepsister {Irmã por afini­dade} stepbrother {Irmão por afini­dade} stepsibling {Irmão/irmã por afini­dade} partner {Parceiro(a)} formerPartner {Ex-parceiro(a)} grandmother {Avó} grandfather {Avô} grandparent {Avô/avó} maternalGrandmother {Avó materna} maternalGrandfather {Avô materno} maternalGrandparent {Avô/avó materno(a)} paternalGrandmother {Avó paterna} paternalGrandfather {Avô paterno} paternalGrandparent {Avô/avó paterno(a)} greatGrandmother {Bisavó} greatGrandfather {Bisavô} greatGrandparent {Bisavô/bisavó} granddaughter {Neta} grandson {Neto} grandchild {Neto(a)} greatGranddaughter {Bisneta} greatGrandson {Bisneto} greatGrandchild {Bisneto(a)} aunt {Tia} uncle {Tio} maternalAunt {Tia materna} maternalUncle {Tio materno} paternalAunt {Tia paterna} paternalUncle {Tio paterno} parentsSibling {Tio(a)} greatAunt {Tia-avó} greatUncle {Tio-avô} grandparentsSibling {Tio-avô/tia-avó} niece {Sobrinha} nephew {Sobrinho} siblingsChild {Sobrinho(a)} cousin {Primo(a)} motherInLaw {Sogra} fatherInLaw {Sogro} parentInLaw {Sogro(a)} sisterInLaw {Cunhada} brotherInLaw {Cunhado} siblingInLaw {Cunhado(a)} daughterInLaw {Nora} sonInLaw {Genro} childInLaw {Genro/nora} other {Parente}}',
  'zh-Hans':
    '{term, select, mother {母亲} father {父亲} parent {家长} eggParent {卵子方家长} spermParent {精子方家长} biologicalMother {生母} biologicalFather {生父} adoptiveMother {养母} adoptiveFather {养父} adoptiveParent {养亲} stepmother {继母} stepfather {继父} stepparent {继亲} eggDonor {卵子捐赠者} spermDonor {精子捐赠者} donor {捐赠者} surrogate {代孕者} daughter {女儿} son {儿子} child {子女} stepdaughter {继女} stepson {继子} stepchild {继子女} donorConceivedChild {捐赠受孕的子女} surrogacyChild {代孕所生的子女} sister {姐妹} brother {兄弟} sibling {兄弟姐妹} halfSister {异父/异母姐妹} halfBrother {异父/异母兄弟} halfSibling {异父/异母兄弟姐妹} stepsister {继姐妹} stepbrother {继兄弟} stepsibling {继兄弟姐妹} partner {伴侣} formerPartner {前伴侣} grandmother {（外）祖母} grandfather {（外）祖父} grandparent {祖辈} maternalGrandmother {外祖母} maternalGrandfather {外祖父} maternalGrandparent {母系祖辈} paternalGrandmother {祖母} paternalGrandfather {祖父} paternalGrandparent {父系祖辈} greatGrandmother {曾祖母} greatGrandfather {曾祖父} greatGrandparent {曾祖辈} granddaughter {（外）孙女} grandson {（外）孙子} grandchild {孙辈} greatGranddaughter {曾孙女} greatGrandson {曾孙} greatGrandchild {曾孙辈} aunt {姑妈/姨妈} uncle {叔伯/舅舅} maternalAunt {姨妈} maternalUncle {舅舅} paternalAunt {姑妈} paternalUncle {叔伯} parentsSibling {父母的兄弟姐妹} greatAunt {姑婆/姨婆} greatUncle {叔公/舅公} grandparentsSibling {祖辈的兄弟姐妹} niece {侄女/外甥女} nephew {侄子/外甥} siblingsChild {兄弟姐妹的子女} cousin {堂表亲} motherInLaw {岳母/婆婆} fatherInLaw {岳父/公公} parentInLaw {伴侣的家长} sisterInLaw {姻亲姐妹} brotherInLaw {姻亲兄弟} siblingInLaw {姻亲兄弟姐妹} daughterInLaw {儿媳} sonInLaw {女婿} childInLaw {子女的伴侣} other {亲属}}',
  'zh-Hant':
    '{term, select, mother {母親} father {父親} parent {家長} eggParent {卵子方家長} spermParent {精子方家長} biologicalMother {生母} biologicalFather {生父} adoptiveMother {養母} adoptiveFather {養父} adoptiveParent {養親} stepmother {繼母} stepfather {繼父} stepparent {繼親} eggDonor {卵子捐贈者} spermDonor {精子捐贈者} donor {捐贈者} surrogate {代理孕母} daughter {女兒} son {兒子} child {子女} stepdaughter {繼女} stepson {繼子} stepchild {繼子女} donorConceivedChild {捐贈受孕的子女} surrogacyChild {代理孕母所生的子女} sister {姊妹} brother {兄弟} sibling {手足} halfSister {異父/異母姊妹} halfBrother {異父/異母兄弟} halfSibling {異父/異母手足} stepsister {繼姊妹} stepbrother {繼兄弟} stepsibling {繼手足} partner {伴侶} formerPartner {前伴侶} grandmother {（外）祖母} grandfather {（外）祖父} grandparent {祖輩} maternalGrandmother {外祖母} maternalGrandfather {外祖父} maternalGrandparent {母系祖輩} paternalGrandmother {祖母} paternalGrandfather {祖父} paternalGrandparent {父系祖輩} greatGrandmother {曾祖母} greatGrandfather {曾祖父} greatGrandparent {曾祖輩} granddaughter {（外）孫女} grandson {（外）孫子} grandchild {孫輩} greatGranddaughter {曾孫女} greatGrandson {曾孫} greatGrandchild {曾孫輩} aunt {姑姑/阿姨} uncle {伯叔/舅舅} maternalAunt {阿姨} maternalUncle {舅舅} paternalAunt {姑姑} paternalUncle {伯叔} parentsSibling {父母的手足} greatAunt {姑婆/姨婆} greatUncle {叔公/舅公} grandparentsSibling {祖輩的手足} niece {姪女/外甥女} nephew {姪子/外甥} siblingsChild {手足的子女} cousin {堂表親} motherInLaw {岳母/婆婆} fatherInLaw {岳父/公公} parentInLaw {伴侶的家長} sisterInLaw {姻親姊妹} brotherInLaw {姻親兄弟} siblingInLaw {姻親手足} daughterInLaw {媳婦} sonInLaw {女婿} childInLaw {子女的伴侶} other {親屬}}',
} as const satisfies SuppliedWording;

/** The explanation shown before removing a family member, naming anyone who would be removed with them. */
const REMOVE_CONFIRM_DESCRIPTION = {
  'en': '{hasOthers, select, true {They will be removed from your family tree, along with their connections to other people. {count, plural, one {{names} is connected to you only through them, so will be removed too.} other {{names} are connected to you only through them, so will be removed too.}}} other {They will be removed from your family tree, along with their connections to other people.}}',
  'de': '{hasOthers, select, true {Die Person wird aus Ihrem Stammbaum entfernt, zusammen mit ihren Verbindungen zu anderen Personen. {count, plural, one {{names} ist nur über diese Person mit Ihnen verbunden und wird daher ebenfalls entfernt.} other {{names} sind nur über diese Person mit Ihnen verbunden und werden daher ebenfalls entfernt.}}} other {Die Person wird aus Ihrem Stammbaum entfernt, zusammen mit ihren Verbindungen zu anderen Personen.}}',
  'es': '{hasOthers, select, true {Se quitará de tu árbol familiar, junto con sus conexiones con otras personas. {count, plural, one {La única conexión entre {names} y tú pasa por esta persona, así que también se quitará.} other {La única conexión entre {names} y tú pasa por esta persona, así que también se quitarán.}}} other {Se quitará de tu árbol familiar, junto con sus conexiones con otras personas.}}',
  'fr': '{hasOthers, select, true {Cette personne sera retirée de votre arbre généalogique, ainsi que ses liens avec d’autres personnes. {count, plural, one {Seule cette personne vous relie à {names} ; cette autre personne sera donc retirée aussi.} other {Seule cette personne vous relie à {names} ; ces autres personnes seront donc retirées aussi.}}} other {Cette personne sera retirée de votre arbre généalogique, ainsi que ses liens avec d’autres personnes.}}',
  'it': '{hasOthers, select, true {Questa persona verrà rimossa dal tuo albero genealogico, insieme ai suoi collegamenti con altre persone. {count, plural, one {Solo questa persona ti collega a {names}, quindi verrà rimossa anche quell’altra persona.} other {Solo questa persona ti collega a {names}, quindi verranno rimosse anche quelle altre persone.}}} other {Questa persona verrà rimossa dal tuo albero genealogico, insieme ai suoi collegamenti con altre persone.}}',
  'nl': '{hasOthers, select, true {Deze persoon wordt uit je stamboom verwijderd, samen met de verbindingen met andere mensen. {count, plural, one {{names} is alleen via deze persoon met jou verbonden en wordt dus ook verwijderd.} other {{names} zijn alleen via deze persoon met jou verbonden en worden dus ook verwijderd.}}} other {Deze persoon wordt uit je stamboom verwijderd, samen met de verbindingen met andere mensen.}}',
  'pt-BR':
    '{hasOthers, select, true {Essa pessoa será removida da sua árvore genealógica, junto com as conexões dela com outras pessoas. {count, plural, one {Só essa pessoa liga você a {names}, então essa outra pessoa também será removida.} other {Só essa pessoa liga você a {names}, então essas outras pessoas também serão removidas.}}} other {Essa pessoa será removida da sua árvore genealógica, junto com as conexões dela com outras pessoas.}}',
  'zh-Hans':
    '{hasOthers, select, true {此人将从您的家谱图中移除，其与其他人的连接也会一并移除。{count, plural, other {{names}只通过此人与您相连，因此也会被移除。}}} other {此人将从您的家谱图中移除，其与其他人的连接也会一并移除。}}',
  'zh-Hant':
    '{hasOthers, select, true {此人會從您的家譜圖中移除，其與其他人的連結也會一併移除。{count, plural, other {{names}只透過此人與您連結，因此也會一併移除。}}} other {此人會從您的家譜圖中移除，其與其他人的連結也會一併移除。}}',
} as const satisfies SuppliedWording;

/** The title of the confirmation shown before removing a family member. */
const REMOVE_CONFIRM_TITLE = {
  'en': 'Remove {name}?',
  'de': '{name} entfernen?',
  'es': '¿Quitar a {name}?',
  'fr': 'Retirer {name} ?',
  'it': 'Rimuovere {name}?',
  'nl': '{name} verwijderen?',
  'pt-BR': 'Remover {name}?',
  'zh-Hans': '要移除{name}吗？',
  'zh-Hant': '要移除{name}嗎？',
} as const satisfies SuppliedWording;

/** The label of the question about the sex a family member was assigned at birth. */
const SEX_ASSIGNED_AT_BIRTH_LABEL = {
  'en': 'Sex assigned at birth',
  'de': 'Bei der Geburt zugewiesenes Geschlecht',
  'es': 'Sexo asignado al nacer',
  'fr': 'Sexe assigné à la naissance',
  'it': 'Sesso assegnato alla nascita',
  'nl': 'Bij de geboorte toegewezen geslacht',
  'pt-BR': 'Sexo atribuído no nascimento',
  'zh-Hans': '出生时指定的性别',
  'zh-Hant': '出生時指定的性別',
} as const satisfies SuppliedWording;

/** The hint shown when some answers to the sex-assigned-at-birth question do not fit the person's recorded children. */
const SEX_RULED_OUT_HINT = {
  'en': '{isYou, select, true {Some answers are unavailable because they do not fit how you are connected to your children. To choose one, change or remove that connection first.} other {Some answers are unavailable because they do not fit how this person is connected to their children. To choose one, change or remove that connection first.}}',
  'de': '{isYou, select, true {Einige Antworten sind nicht verfügbar, weil sie nicht dazu passen, wie Sie mit Ihren Kindern verbunden sind. Um eine davon zu wählen, ändern oder entfernen Sie zuerst diese Verbindung.} other {Einige Antworten sind nicht verfügbar, weil sie nicht dazu passen, wie diese Person mit ihren Kindern verbunden ist. Um eine davon zu wählen, ändern oder entfernen Sie zuerst diese Verbindung.}}',
  'es': '{isYou, select, true {Algunas respuestas no están disponibles porque no encajan con tu conexión con tus hijos. Para elegir una, primero cambia o quita esa conexión.} other {Algunas respuestas no están disponibles porque no encajan con la conexión de esta persona con sus hijos. Para elegir una, primero cambia o quita esa conexión.}}',
  'fr': '{isYou, select, true {Certaines réponses ne sont pas disponibles, car elles ne correspondent pas à votre lien avec vos enfants. Pour en choisir une, modifiez ou supprimez d’abord ce lien.} other {Certaines réponses ne sont pas disponibles, car elles ne correspondent pas au lien entre cette personne et ses enfants. Pour en choisir une, modifiez ou supprimez d’abord ce lien.}}',
  'it': '{isYou, select, true {Alcune risposte non sono disponibili perché non sono compatibili con il tuo legame con i tuoi figli. Per sceglierne una, prima modifica o rimuovi quel collegamento.} other {Alcune risposte non sono disponibili perché non sono compatibili con il legame di questa persona con i suoi figli. Per sceglierne una, prima modifica o rimuovi quel collegamento.}}',
  'nl': '{isYou, select, true {Sommige antwoorden zijn niet beschikbaar omdat ze niet passen bij hoe je met je kinderen verbonden bent. Wijzig of verwijder eerst die verbinding om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat ze niet passen bij hoe deze persoon met de eigen kinderen verbonden is. Wijzig of verwijder eerst die verbinding om er een te kiezen.}}',
  'pt-BR':
    '{isYou, select, true {Algumas respostas não estão disponíveis porque não combinam com a sua conexão com seus filhos. Para escolher uma delas, primeiro altere ou remova essa conexão.} other {Algumas respostas não estão disponíveis porque não combinam com a conexão dessa pessoa com os filhos dela. Para escolher uma delas, primeiro altere ou remova essa conexão.}}',
  'zh-Hans':
    '{isYou, select, true {部分选项不可用，因为它们与您和子女之间的连接不符。如需选择，请先更改或移除该连接。} other {部分选项不可用，因为它们与此人和其子女之间的连接不符。如需选择，请先更改或移除该连接。}}',
  'zh-Hant':
    '{isYou, select, true {部分選項無法使用，因為與您和子女之間的連結不符。如需選擇，請先變更或移除該連結。} other {部分選項無法使用，因為與此人和其子女之間的連結不符。如需選擇，請先變更或移除該連結。}}',
} as const satisfies SuppliedWording;

/** The option that a new sibling shares both parents. */
const SHARED_PARENT_COUNT_BOTH = {
  'en': 'Both parents',
  'de': 'Beide Elternteile',
  'es': 'Ambos progenitores',
  'fr': 'Les deux parents',
  'it': 'Entrambi i genitori',
  'nl': 'Beide ouders',
  'pt-BR': 'Ambos os pais',
  'zh-Hans': '双方父母',
  'zh-Hant': '雙方父母',
} as const satisfies SuppliedWording;

/** The question asking which parents a new sibling shares. */
const SHARED_PARENT_COUNT_LABEL = {
  'en': '{isYou, select, true {Which parents do they share with you?} other {Which parents do they share with “{name}”?}}',
  'de': '{isYou, select, true {Welche Eltern hat diese Person mit Ihnen gemeinsam?} other {Welche Eltern hat diese Person mit „{name}“ gemeinsam?}}',
  'es': '{isYou, select, true {¿Qué progenitores comparte contigo?} other {¿Qué progenitores comparte con «{name}»?}}',
  'fr': '{isYou, select, true {Quels parents cette personne a-t-elle en commun avec vous ?} other {Quels parents cette personne a-t-elle en commun avec « {name} » ?}}',
  'it': '{isYou, select, true {Quali genitori ha in comune con te?} other {Quali genitori ha in comune con «{name}»?}}',
  'nl': '{isYou, select, true {Welke ouders heeft deze persoon met jou gemeen?} other {Welke ouders heeft deze persoon met “{name}” gemeen?}}',
  'pt-BR':
    '{isYou, select, true {Quais pais essa pessoa tem em comum com você?} other {Quais pais essa pessoa tem em comum com “{name}”?}}',
  'zh-Hans':
    '{isYou, select, true {此人与您共有哪些父母？} other {此人与“{name}”共有哪些父母？}}',
  'zh-Hant':
    '{isYou, select, true {此人與您共有哪些父母？} other {此人與「{name}」共有哪些父母？}}',
} as const satisfies SuppliedWording;

/** The option that a new sibling shares only the parent who provided the egg or the sperm. */
const SHARED_PARENT_EGG_ONLY = {
  'en': '{parent, select, egg {{framing, select, gamete {Only the egg parent} other {Only the biological mother}}} other {{framing, select, gamete {Only the sperm parent} other {Only the biological father}}}}',
  'de': '{parent, select, egg {{framing, select, gamete {Nur den Eizell-Elternteil} other {Nur die leibliche Mutter}}} other {{framing, select, gamete {Nur den Samen-Elternteil} other {Nur den leiblichen Vater}}}}',
  'es': '{parent, select, egg {{framing, select, gamete {Solo el progenitor de óvulo} other {Solo la madre biológica}}} other {{framing, select, gamete {Solo el progenitor de esperma} other {Solo el padre biológico}}}}',
  'fr': '{parent, select, egg {{framing, select, gamete {Seulement le parent de l’ovule} other {Seulement la mère biologique}}} other {{framing, select, gamete {Seulement le parent du sperme} other {Seulement le père biologique}}}}',
  'it': '{parent, select, egg {{framing, select, gamete {Solo il genitore dell’ovulo} other {Solo la madre biologica}}} other {{framing, select, gamete {Solo il genitore dello sperma} other {Solo il padre biologico}}}}',
  'nl': '{parent, select, egg {{framing, select, gamete {Alleen de eicelouder} other {Alleen de biologische moeder}}} other {{framing, select, gamete {Alleen de zaadouder} other {Alleen de biologische vader}}}}',
  'pt-BR':
    '{parent, select, egg {{framing, select, gamete {Só o genitor do óvulo} other {Só a mãe biológica}}} other {{framing, select, gamete {Só o genitor do esperma} other {Só o pai biológico}}}}',
  'zh-Hans':
    '{parent, select, egg {{framing, select, gamete {仅卵子方家长} other {仅生母}}} other {{framing, select, gamete {仅精子方家长} other {仅生父}}}}',
  'zh-Hant':
    '{parent, select, egg {{framing, select, gamete {僅卵子方家長} other {僅生母}}} other {{framing, select, gamete {僅精子方家長} other {僅生父}}}}',
} as const satisfies SuppliedWording;

/** The option for the second parent who is not shown yet, which is added unnamed. */
const SHARED_PARENT_UNSHOWN = {
  'en': '{isYou, select, true {Your other parent, not shown yet} other {The other parent of “{name}”, not shown yet}}',
  'de': '{isYou, select, true {Ihren anderen Elternteil, der noch nicht angezeigt wird} other {Den anderen Elternteil von „{name}“, der noch nicht angezeigt wird}}',
  'es': '{isYou, select, true {Tu otro progenitor, que aún no aparece} other {El otro progenitor de «{name}», que aún no aparece}}',
  'fr': '{isYou, select, true {Votre autre parent, qui n’apparaît pas encore} other {L’autre parent de « {name} », qui n’apparaît pas encore}}',
  'it': '{isYou, select, true {Il tuo altro genitore, non ancora presente} other {L’altro genitore di «{name}», non ancora presente}}',
  'nl': '{isYou, select, true {Je andere ouder, die nog niet getoond wordt} other {De andere ouder van “{name}”, die nog niet getoond wordt}}',
  'pt-BR':
    '{isYou, select, true {Seu outro pai/mãe, que ainda não aparece} other {O outro pai/mãe de “{name}”, que ainda não aparece}}',
  'zh-Hans':
    '{isYou, select, true {您的另一位家长（尚未显示）} other {“{name}”的另一位家长（尚未显示）}}',
  'zh-Hant':
    '{isYou, select, true {您的另一位家長（尚未顯示）} other {「{name}」的另一位家長（尚未顯示）}}',
} as const satisfies SuppliedWording;

/** The question asking how a new sibling is related to the parents chosen. */
const SIBLING_KIND_LABEL = {
  'en': 'To the parents they share, are they…',
  'de': 'Für die gemeinsamen Eltern ist diese Person…',
  'es': 'Para los progenitores que comparten, es…',
  'fr': 'Pour les parents en commun, cette personne est…',
  'it': 'Per i genitori in comune, questa persona è…',
  'nl': 'Voor de gedeelde ouders is deze persoon…',
  'pt-BR': 'Para os pais em comum, essa pessoa é…',
  'zh-Hans': '对于共有的父母，此人是……',
  'zh-Hant': '對於共有的父母，此人是……',
} as const satisfies SuppliedWording;

/** The yes or no question asking whether a partnership is still current. */
const STILL_TOGETHER_LABEL = {
  'en': '{named, select, true {{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}} other {Are they still together?}}',
  'de': '{named, select, true {{personIsYou, select, true {Sind Sie noch mit {partner} zusammen?} other {{partnerIsYou, select, true {Sind Sie noch zusammen?} other {Ist diese Person noch mit {partner} zusammen?}}}}} other {Sind die beiden noch zusammen?}}',
  'es': '{named, select, true {{personIsYou, select, true {¿Sigues siendo pareja de {partner}?} other {{partnerIsYou, select, true {¿Sigue siendo tu pareja?} other {¿Esta persona sigue siendo pareja de {partner}?}}}}} other {¿Siguen siendo pareja?}}',
  'fr': '{named, select, true {{personIsYou, select, true {Êtes-vous toujours en couple avec {partner} ?} other {{partnerIsYou, select, true {Êtes-vous toujours en couple ?} other {Cette personne est-elle toujours en couple avec {partner} ?}}}}} other {Le couple est-il toujours ensemble ?}}',
  'it': '{named, select, true {{personIsYou, select, true {Stai ancora con {partner}?} other {{partnerIsYou, select, true {State ancora insieme?} other {Questa persona sta ancora con {partner}?}}}}} other {Stanno ancora insieme?}}',
  'nl': '{named, select, true {{personIsYou, select, true {Ben je nog samen met {partner}?} other {{partnerIsYou, select, true {Zijn jullie nog samen?} other {Is deze persoon nog samen met {partner}?}}}}} other {Zijn ze nog samen?}}',
  'pt-BR':
    '{named, select, true {{personIsYou, select, true {Você ainda está com {partner}?} other {{partnerIsYou, select, true {Vocês ainda estão juntos?} other {Essa pessoa ainda está com {partner}?}}}}} other {O casal ainda está junto?}}',
  'zh-Hans':
    '{named, select, true {{personIsYou, select, true {您和{partner}仍在一起吗？} other {{partnerIsYou, select, true {您和此人仍在一起吗？} other {此人和{partner}仍在一起吗？}}}}} other {他们仍在一起吗？}}',
  'zh-Hant':
    '{named, select, true {{personIsYou, select, true {您和{partner}仍在一起嗎？} other {{partnerIsYou, select, true {您和此人仍在一起嗎？} other {此人和{partner}仍在一起嗎？}}}}} other {他們仍在一起嗎？}}',
} as const satisfies SuppliedWording;

/** The label shown inside the participant's own symbol in the family tree. */
const YOU = {
  'en': 'You',
  'de': 'Sie',
  'es': 'Tú',
  'fr': 'Vous',
  'it': 'Tu',
  'nl': 'Jij',
  'pt-BR': 'Você',
  'zh-Hans': '您',
  'zh-Hant': '您',
} as const satisfies SuppliedWording;

/** The button that saves a family member's details. */
const SAVE = {
  'en': 'Save',
  'de': 'Speichern',
  'es': 'Guardar',
  'fr': 'Enregistrer',
  'it': 'Salva',
  'nl': 'Opslaan',
  'pt-BR': 'Salvar',
  'zh-Hans': '保存',
  'zh-Hant': '儲存',
} as const satisfies SuppliedWording;

/** The accessible name and tooltip of the connect tool. */
const CONNECT_TOOL = {
  'en': 'Connect',
  'de': 'Verbinden',
  'es': 'Conectar',
  'fr': 'Relier',
  'it': 'Collega',
  'nl': 'Verbinden',
  'pt-BR': 'Conectar',
  'zh-Hans': '连接',
  'zh-Hant': '連結',
} as const satisfies SuppliedWording;

/** The accessible name and tooltip of the disconnect tool. */
const DISCONNECT_TOOL = {
  'en': 'Disconnect',
  'de': 'Trennen',
  'es': 'Desconectar',
  'fr': 'Détacher',
  'it': 'Scollega',
  'nl': 'Loskoppelen',
  'pt-BR': 'Desconectar',
  'zh-Hans': '断开',
  'zh-Hant': '解除連結',
} as const satisfies SuppliedWording;

/** The accessible name and tooltip of the button that opens the choice of words. Shown only when participants choose the words. */
const FRAMING_CONTROL_LABEL = {
  'en': 'Wording',
  'de': 'Wortwahl',
  'es': 'Términos',
  'fr': 'Vocabulaire',
  'it': 'Termini',
  'nl': 'Woordkeuze',
  'pt-BR': 'Termos',
  'zh-Hans': '称谓',
  'zh-Hant': '稱謂',
} as const satisfies SuppliedWording;

/** The accessible name and tooltip of the add and edit tool. */
const POINTER_TOOL = {
  'en': 'Add and edit',
  'de': 'Hinzufügen und bearbeiten',
  'es': 'Añadir y editar',
  'fr': 'Ajouter et modifier',
  'it': 'Aggiungi e modifica',
  'nl': 'Toevoegen en bewerken',
  'pt-BR': 'Adicionar e editar',
  'zh-Hans': '添加和编辑',
  'zh-Hant': '新增和編輯',
} as const satisfies SuppliedWording;

/** The Family Pedigree's settings Network Canvas words. */
export const FAMILY_PEDIGREE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['nodeConfiguration', 'nameField', 'prompt'],
    message: NAME_PROMPT,
  },
  {
    path: ['nodeConfiguration', 'nameField', 'hint'],
    message: NAME_HINT,
    optional: true,
  },
  pedigreeCompleteness(['itemText', 'parents', 'listItem'], PARENTS_ITEM),
  pedigreeCompleteness(['itemText', 'siblings', 'listItem'], SIBLINGS_ITEM),
  pedigreeCompleteness(['itemText', 'siblings', 'noneButton'], SIBLINGS_NONE),
  pedigreeCompleteness(['itemText', 'siblings', 'question'], SIBLINGS_QUESTION),
  pedigreeCompleteness(['itemText', 'children', 'listItem'], CHILDREN_ITEM),
  pedigreeCompleteness(['itemText', 'children', 'noneButton'], CHILDREN_NONE),
  pedigreeCompleteness(['itemText', 'children', 'question'], CHILDREN_QUESTION),
  pedigreeCompleteness(['itemText', 'details', 'listItem'], DETAILS_ITEM),
  pedigreeCompleteness(['recommendedNote'], RECOMMENDED_NOTE),
  { path: ['wording', 'alsoParentOfLabel'], message: ALSO_PARENT_OF_LABEL },
  {
    path: ['wording', 'biologicalParentBoth'],
    message: BIOLOGICAL_PARENT_BOTH,
  },
  {
    path: ['wording', 'biologicalParentHint'],
    message: BIOLOGICAL_PARENT_HINT,
  },
  {
    path: ['wording', 'biologicalParentLabel'],
    message: BIOLOGICAL_PARENT_LABEL,
  },
  {
    path: ['wording', 'carriedSiblingsPregnancyLabel'],
    message: CARRIED_SIBLINGS_PREGNANCY_LABEL,
  },
  { path: ['wording', 'carrierLabel'], message: CARRIER_LABEL },
  { path: ['wording', 'carrierUnknown'], message: CARRIER_UNKNOWN },
  { path: ['wording', 'childKindAdoptive'], message: CHILD_KIND_ADOPTIVE },
  { path: ['wording', 'childKindBiological'], message: CHILD_KIND_BIOLOGICAL },
  { path: ['wording', 'childKindSocial'], message: CHILD_KIND_SOCIAL },
  { path: ['wording', 'childKindLabel'], message: CHILD_KIND_LABEL },
  { path: ['wording', 'connectHint'], message: CONNECT_HINT },
  { path: ['wording', 'connectParent'], message: CONNECT_PARENT },
  { path: ['wording', 'connectPartners'], message: CONNECT_PARTNERS },
  { path: ['wording', 'connectQuestion'], message: CONNECT_QUESTION },
  {
    path: ['wording', 'disconnectConfirmDescription'],
    message: DISCONNECT_CONFIRM_DESCRIPTION,
  },
  {
    path: ['wording', 'disconnectConfirmTitle'],
    message: DISCONNECT_CONFIRM_TITLE,
  },
  { path: ['wording', 'disconnectHint'], message: DISCONNECT_HINT },
  {
    path: ['wording', 'disconnectWouldCutOff'],
    message: DISCONNECT_WOULD_CUT_OFF,
  },
  { path: ['wording', 'dontKnow'], message: DONT_KNOW },
  { path: ['wording', 'panelTitle'], message: PANEL_TITLE },
  {
    path: ['wording', 'framingChoiceDescription'],
    message: FRAMING_CHOICE_DESCRIPTION,
    when: choosesFraming,
  },
  {
    path: ['wording', 'framingChoiceTitle'],
    message: FRAMING_CHOICE_TITLE,
    when: choosesFraming,
  },
  {
    path: ['wording', 'genderIdentityLabel'],
    message: GENDER_IDENTITY_LABEL,
    when: asksGenderIdentity,
  },
  { path: ['wording', 'generatedLabelOf'], message: GENERATED_LABEL_OF },
  { path: ['wording', 'missingDetailsList'], message: MISSING_DETAILS_LIST },
  { path: ['wording', 'otherParentLabel'], message: OTHER_PARENT_LABEL },
  { path: ['wording', 'otherParentNone'], message: OTHER_PARENT_NONE },
  { path: ['wording', 'otherParentUnknown'], message: OTHER_PARENT_UNKNOWN },
  { path: ['wording', 'parentCarriedLabel'], message: PARENT_CARRIED_LABEL },
  {
    path: ['wording', 'parentKindBiologicalCarrier'],
    message: PARENT_KIND_BIOLOGICAL_CARRIER,
  },
  { path: ['wording', 'parentKindLabel'], message: PARENT_KIND_LABEL },
  { path: ['wording', 'parentLinkKindLabel'], message: PARENT_LINK_KIND_LABEL },
  { path: ['wording', 'parentPartnerLabel'], message: PARENT_PARTNER_LABEL },
  {
    path: ['wording', 'placeholderParentsNote'],
    message: PLACEHOLDER_PARENTS_NOTE,
  },
  { path: ['wording', 'relativeTerm'], message: RELATIVE_TERM },
  {
    path: ['wording', 'removeConfirmDescription'],
    message: REMOVE_CONFIRM_DESCRIPTION,
  },
  { path: ['wording', 'removeConfirmTitle'], message: REMOVE_CONFIRM_TITLE },
  {
    path: ['wording', 'sexAssignedAtBirthLabel'],
    message: SEX_ASSIGNED_AT_BIRTH_LABEL,
  },
  { path: ['wording', 'sexRuledOutHint'], message: SEX_RULED_OUT_HINT },
  {
    path: ['wording', 'sharedParentCountBoth'],
    message: SHARED_PARENT_COUNT_BOTH,
  },
  {
    path: ['wording', 'sharedParentCountLabel'],
    message: SHARED_PARENT_COUNT_LABEL,
  },
  { path: ['wording', 'sharedParentEggOnly'], message: SHARED_PARENT_EGG_ONLY },
  { path: ['wording', 'sharedParentUnshown'], message: SHARED_PARENT_UNSHOWN },
  { path: ['wording', 'siblingKindLabel'], message: SIBLING_KIND_LABEL },
  { path: ['wording', 'stillTogetherLabel'], message: STILL_TOGETHER_LABEL },
  { path: ['wording', 'you'], message: YOU },
  { path: ['wording', 'save'], message: SAVE },
  { path: ['wording', 'connectTool'], message: CONNECT_TOOL },
  { path: ['wording', 'disconnectTool'], message: DISCONNECT_TOOL },
  {
    path: ['wording', 'framingControlLabel'],
    message: FRAMING_CONTROL_LABEL,
    when: choosesFraming,
  },
  { path: ['wording', 'pointerTool'], message: POINTER_TOOL },
];

/**
 * The stage's `wording`, every setting in the given languages (English by
 * default). A fixture can make a stage valid without spelling the wording out
 * again; a test that switches language passes the protocol's languages too.
 */
export const familyPedigreeWordingIn = (
  locales: readonly LocaleTag[] = ['en'],
): Readonly<Record<string, LocalizedString>> =>
  Object.fromEntries(
    FAMILY_PEDIGREE_SUPPLIED_TEXT.flatMap(({ path, message }) => {
      const [group, key] = path;
      if (group !== 'wording' || key === undefined) return [];
      const held = locales.flatMap((locale) => {
        const text = message[locale];
        return text === undefined ? [] : [[locale, text] as const];
      });
      return [[key, Object.fromEntries(held)] as const];
    }),
  );
