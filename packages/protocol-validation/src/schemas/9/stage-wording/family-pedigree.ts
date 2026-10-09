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
import type { FamilyPedigreeWording } from '../stages/family-pedigree.ts';
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
  'en': '{relation, select, partner {{isYou, select, true {{term} (your partner)} other {{term} (partner of {name})}}} formerPartner {{isYou, select, true {{term} (your former partner)} other {{term} (former partner of {name})}}} parent {{isYou, select, true {{term} (your parent)} other {{term} (parent of {name})}}} sibling {{isYou, select, true {{term} (your sibling)} other {{term} (sibling of {name})}}} owner {{owner}’s {term}} other {{isYou, select, true {{term} (your child)} other {{term} (child of {name})}}}}',
  'de': '{relation, select, partner {{isYou, select, true {{term} (Ihre Partnerperson)} other {{term} (Partnerperson von {name})}}} formerPartner {{isYou, select, true {{term} (Ihre frühere Partnerperson)} other {{term} (frühere Partnerperson von {name})}}} parent {{isYou, select, true {{term} (Ihr Elternteil)} other {{term} (Elternteil von {name})}}} sibling {{isYou, select, true {{term} (Ihr Geschwisterteil)} other {{term} (Geschwisterteil von {name})}}} owner {{term} von {owner}} other {{isYou, select, true {{term} (Ihr Kind)} other {{term} (Kind von {name})}}}}',
  'es': '{relation, select, partner {{isYou, select, true {{term} (tu pareja)} other {{term} (pareja de {name})}}} formerPartner {{isYou, select, true {{term} (tu expareja)} other {{term} (expareja de {name})}}} parent {{isYou, select, true {{term} (tu progenitor)} other {{term} (progenitor de {name})}}} sibling {{isYou, select, true {{term} (tu hermano/a)} other {{term} (hermano/a de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (tu hijo/a)} other {{term} (hijo/a de {name})}}}}',
  'fr': '{relation, select, partner {{isYou, select, true {{term} (votre partenaire)} other {{term} (partenaire de {name})}}} formerPartner {{isYou, select, true {{term} (votre ex-partenaire)} other {{term} (ex-partenaire de {name})}}} parent {{isYou, select, true {{term} (votre parent)} other {{term} (parent de {name})}}} sibling {{isYou, select, true {{term} (votre frère ou sœur)} other {{term} (frère ou sœur de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (votre enfant)} other {{term} (enfant de {name})}}}}',
  'it': '{relation, select, partner {{isYou, select, true {{term} (tuo partner)} other {{term} (partner di {name})}}} formerPartner {{isYou, select, true {{term} (tuo ex partner)} other {{term} (ex partner di {name})}}} parent {{isYou, select, true {{term} (tuo genitore)} other {{term} (genitore di {name})}}} sibling {{isYou, select, true {{term} (tuo fratello o tua sorella)} other {{term} (fratello o sorella di {name})}}} owner {{term} di {owner}} other {{isYou, select, true {{term} (tuo figlio o tua figlia)} other {{term} (figlio o figlia di {name})}}}}',
  'nl': '{relation, select, partner {{isYou, select, true {{term} (jouw partner)} other {{term} (partner van {name})}}} formerPartner {{isYou, select, true {{term} (jouw ex-partner)} other {{term} (ex-partner van {name})}}} parent {{isYou, select, true {{term} (jouw ouder)} other {{term} (ouder van {name})}}} sibling {{isYou, select, true {{term} (jouw broer of zus)} other {{term} (broer of zus van {name})}}} owner {{term} van {owner}} other {{isYou, select, true {{term} (jouw kind)} other {{term} (kind van {name})}}}}',
  'pt-BR':
    '{relation, select, partner {{isYou, select, true {{term} (seu parceiro ou parceira)} other {{term} (parceiro ou parceira de {name})}}} formerPartner {{isYou, select, true {{term} (seu ex-parceiro ou ex-parceira)} other {{term} (ex-parceiro ou ex-parceira de {name})}}} parent {{isYou, select, true {{term} (seu pai/mãe)} other {{term} (pai/mãe de {name})}}} sibling {{isYou, select, true {{term} (seu irmão/irmã)} other {{term} (irmão/irmã de {name})}}} owner {{term} de {owner}} other {{isYou, select, true {{term} (seu filho ou filha)} other {{term} (filho ou filha de {name})}}}}',
  'zh-Hans':
    '{relation, select, partner {{isYou, select, true {{term}（您的伴侣）} other {{term}（{name}的伴侣）}}} formerPartner {{isYou, select, true {{term}（您的前伴侣）} other {{term}（{name}的前伴侣）}}} parent {{isYou, select, true {{term}（您的家长）} other {{term}（{name}的家长）}}} sibling {{isYou, select, true {{term}（您的兄弟姐妹）} other {{term}（{name}的兄弟姐妹）}}} owner {{owner}的{term}} other {{isYou, select, true {{term}（您的子女）} other {{term}（{name}的子女）}}}}',
  'zh-Hant':
    '{relation, select, partner {{isYou, select, true {{term}（您的伴侶）} other {{term}（{name}的伴侶）}}} formerPartner {{isYou, select, true {{term}（您的前伴侶）} other {{term}（{name}的前伴侶）}}} parent {{isYou, select, true {{term}（您的家長）} other {{term}（{name}的家長）}}} sibling {{isYou, select, true {{term}（您的手足）} other {{term}（{name}的手足）}}} owner {{owner}的{term}} other {{isYou, select, true {{term}（您的子女）} other {{term}（{name}的子女）}}}}',
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
  'en': '{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Bio­logical mother} biologicalFather {Bio­logical father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Step­mother} stepfather {Step­father} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surro­gate} daughter {Daughter} son {Son} child {Child} stepdaughter {Step­daughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Surro­gacy child} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} adoptiveSister {Adoptive sister} adoptiveBrother {Adoptive brother} adoptiveSibling {Adoptive sibling} stepsister {Step­sister} stepbrother {Step­brother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grand­mother} grandfather {Grand­father} grandparent {Grand­parent} maternalGrandmother {Maternal grand­mother} maternalGrandfather {Maternal grand­father} maternalGrandparent {Maternal grand­parent} paternalGrandmother {Paternal grand­mother} paternalGrandfather {Paternal grand­father} paternalGrandparent {Paternal grand­parent} greatGrandmother {Great-grand­mother} greatGrandfather {Great-grand­father} greatGrandparent {Great-grand­parent} stepGrandmother {Step-grand­mother} stepGrandfather {Step-grand­father} stepGrandparent {Step-grand­parent} granddaughter {Grand­daughter} grandson {Grandson} grandchild {Grand­child} greatGranddaughter {Great-grand­daughter} greatGrandson {Great-grandson} greatGrandchild {Great-grand­child} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent’s sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grand­parent’s sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling’s child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daugh­ter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}',
  'de': '{term, select, mother {Mutter} father {Vater} parent {Eltern­teil} eggParent {Eizell-Eltern­teil} spermParent {Samen-Eltern­teil} biologicalMother {Leibliche Mutter} biologicalFather {Leiblicher Vater} adoptiveMother {Adoptiv­mutter} adoptiveFather {Adoptiv­vater} adoptiveParent {Adoptiv­eltern­teil} stepmother {Stief­mutter} stepfather {Stief­vater} stepparent {Stief­eltern­teil} eggDonor {Eizell­spenderin} spermDonor {Samen­spender} donor {Spender/in} surrogate {Leih­mutter} daughter {Tochter} son {Sohn} child {Kind} stepdaughter {Stief­tochter} stepson {Stief­sohn} stepchild {Stief­kind} donorConceivedChild {Spender­kind} surrogacyChild {Kind aus Leih­mutter­schaft} sister {Schwester} brother {Bruder} sibling {Geschwister­teil} halfSister {Halb­schwester} halfBrother {Halb­bruder} halfSibling {Halb­geschwister­teil} adoptiveSister {Adoptiv­schwester} adoptiveBrother {Adoptiv­bruder} adoptiveSibling {Adoptiv­geschwister­teil} stepsister {Stief­schwester} stepbrother {Stief­bruder} stepsibling {Stief­geschwister­teil} partner {Partner­person} formerPartner {Frühere Partner­person} grandmother {Groß­mutter} grandfather {Groß­vater} grandparent {Groß­eltern­teil} maternalGrandmother {Groß­mutter mütter­licher­seits} maternalGrandfather {Groß­vater mütter­licher­seits} maternalGrandparent {Groß­eltern­teil mütter­licher­seits} paternalGrandmother {Groß­mutter väter­licher­seits} paternalGrandfather {Groß­vater väter­licher­seits} paternalGrandparent {Groß­eltern­teil väter­licher­seits} greatGrandmother {Urgroß­mutter} greatGrandfather {Urgroß­vater} greatGrandparent {Urgroß­eltern­teil} stepGrandmother {Stief­groß­mutter} stepGrandfather {Stief­groß­vater} stepGrandparent {Stief­groß­eltern­teil} granddaughter {Enkel­tochter} grandson {Enkel­sohn} grandchild {Enkel­kind} greatGranddaughter {Urenkel­tochter} greatGrandson {Urenkel­sohn} greatGrandchild {Urenkel­kind} aunt {Tante} uncle {Onkel} maternalAunt {Tante mütter­licher­seits} maternalUncle {Onkel mütter­licher­seits} paternalAunt {Tante väter­licher­seits} paternalUncle {Onkel väter­licher­seits} parentsSibling {Geschwister­teil eines Eltern­teils} greatAunt {Groß­tante} greatUncle {Groß­onkel} grandparentsSibling {Geschwister­teil eines Groß­eltern­teils} niece {Nichte} nephew {Neffe} siblingsChild {Kind eines Geschwister­teils} cousin {Cousin/Cousine} motherInLaw {Schwieger­mutter} fatherInLaw {Schwieger­vater} parentInLaw {Schwieger­eltern­teil} sisterInLaw {Schwägerin} brotherInLaw {Schwager} siblingInLaw {Schwager/Schwägerin} daughterInLaw {Schwieger­tochter} sonInLaw {Schwieger­sohn} childInLaw {Schwieger­kind} other {Verwandte Person}}',
  'es': '{term, select, mother {Madre} father {Padre} parent {Progeni­tor} eggParent {Progeni­tor de óvulo} spermParent {Progeni­tor de esperma} biologicalMother {Madre bio­lógica} biologicalFather {Padre bio­lógico} adoptiveMother {Madre adoptiva} adoptiveFather {Padre adoptivo} adoptiveParent {Progeni­tor adoptivo} stepmother {Madrastra} stepfather {Padrastro} stepparent {Padrastro/madrastra} eggDonor {Donante de óvulos} spermDonor {Donante de esperma} donor {Donante} surrogate {Gestante subrogada} daughter {Hija} son {Hijo} child {Hijo/a} stepdaughter {Hijastra} stepson {Hijastro} stepchild {Hijastro/a} donorConceivedChild {Hijo/a por donación} surrogacyChild {Hijo/a por gestación subrogada} sister {Hermana} brother {Hermano} sibling {Hermano/a} halfSister {Media hermana} halfBrother {Medio hermano} halfSibling {Medio/a hermano/a} adoptiveSister {Hermana adoptiva} adoptiveBrother {Hermano adoptivo} adoptiveSibling {Hermano/a adoptivo/a} stepsister {Herma­nastra} stepbrother {Herma­nastro} stepsibling {Herma­nastro/a} partner {Pareja} formerPartner {Expareja} grandmother {Abuela} grandfather {Abuelo} grandparent {Abuelo/a} maternalGrandmother {Abuela materna} maternalGrandfather {Abuelo materno} maternalGrandparent {Abuelo/a materno/a} paternalGrandmother {Abuela paterna} paternalGrandfather {Abuelo paterno} paternalGrandparent {Abuelo/a paterno/a} greatGrandmother {Bisabuela} greatGrandfather {Bisabuelo} greatGrandparent {Bisabuelo/a} stepGrandmother {Abue­lastra} stepGrandfather {Abue­lastro} stepGrandparent {Abue­lastro/a} granddaughter {Nieta} grandson {Nieto} grandchild {Nieto/a} greatGranddaughter {Bisnieta} greatGrandson {Bisnieto} greatGrandchild {Bisnieto/a} aunt {Tía} uncle {Tío} maternalAunt {Tía materna} maternalUncle {Tío materno} paternalAunt {Tía paterna} paternalUncle {Tío paterno} parentsSibling {Tío/a} greatAunt {Tía abuela} greatUncle {Tío abuelo} grandparentsSibling {Tío/a abuelo/a} niece {Sobrina} nephew {Sobrino} siblingsChild {Sobrino/a} cousin {Primo/a} motherInLaw {Suegra} fatherInLaw {Suegro} parentInLaw {Suegro/a} sisterInLaw {Cuñada} brotherInLaw {Cuñado} siblingInLaw {Cuñado/a} daughterInLaw {Nuera} sonInLaw {Yerno} childInLaw {Yerno/nuera} other {Pariente}}',
  'fr': '{term, select, mother {Mère} father {Père} parent {Parent} eggParent {Parent de l’ovule} spermParent {Parent du sperme} biologicalMother {Mère bio­logique} biologicalFather {Père bio­logique} adoptiveMother {Mère adoptive} adoptiveFather {Père adoptif} adoptiveParent {Parent adoptif} stepmother {Belle-mère} stepfather {Beau-père} stepparent {Beau-parent} eggDonor {Donneuse d’ovules} spermDonor {Donneur de sperme} donor {Personne donneuse} surrogate {Mère porteuse} daughter {Fille} son {Fils} child {Enfant} stepdaughter {Belle-fille} stepson {Beau-fils} stepchild {Enfant par alliance} donorConceivedChild {Enfant issu d’un don} surrogacyChild {Enfant issu d’une GPA} sister {Sœur} brother {Frère} sibling {Frère ou sœur} halfSister {Demi-sœur} halfBrother {Demi-frère} halfSibling {Demi-frère ou demi-sœur} adoptiveSister {Sœur adoptive} adoptiveBrother {Frère adoptif} adoptiveSibling {Frère ou sœur adoptifs} stepsister {Quasi-sœur} stepbrother {Quasi-frère} stepsibling {Quasi-frère ou quasi-sœur} partner {Parte­naire} formerPartner {Ex-parte­naire} grandmother {Grand-mère} grandfather {Grand-père} grandparent {Grand-parent} maternalGrandmother {Grand-mère mater­nelle} maternalGrandfather {Grand-père maternel} maternalGrandparent {Grand-parent maternel} paternalGrandmother {Grand-mère pater­nelle} paternalGrandfather {Grand-père paternel} paternalGrandparent {Grand-parent paternel} greatGrandmother {Arrière-grand-mère} greatGrandfather {Arrière-grand-père} greatGrandparent {Arrière-grand-parent} stepGrandmother {Belle-grand-mère} stepGrandfather {Beau-grand-père} stepGrandparent {Beau-grand-parent} granddaughter {Petite-fille} grandson {Petit-fils} grandchild {Petit-enfant} greatGranddaughter {Arrière-petite-fille} greatGrandson {Arrière-petit-fils} greatGrandchild {Arrière-petit-enfant} aunt {Tante} uncle {Oncle} maternalAunt {Tante mater­nelle} maternalUncle {Oncle maternel} paternalAunt {Tante pater­nelle} paternalUncle {Oncle paternel} parentsSibling {Frère ou sœur d’un parent} greatAunt {Grand-tante} greatUncle {Grand-oncle} grandparentsSibling {Frère ou sœur d’un grand-parent} niece {Nièce} nephew {Neveu} siblingsChild {Enfant d’un frère ou d’une sœur} cousin {Cousin ou cousine} motherInLaw {Mère de votre parte­naire} fatherInLaw {Père de votre parte­naire} parentInLaw {Parent de votre parte­naire} sisterInLaw {Belle-sœur} brotherInLaw {Beau-frère} siblingInLaw {Beau-frère ou belle-sœur} daughterInLaw {Conjointe de votre enfant} sonInLaw {Conjoint de votre enfant} childInLaw {Parte­naire de votre enfant} other {Proche}}',
  'it': '{term, select, mother {Madre} father {Padre} parent {Genitore} eggParent {Genitore dell’ovulo} spermParent {Genitore dello sperma} biologicalMother {Madre biolo­gica} biologicalFather {Padre biolo­gico} adoptiveMother {Madre adottiva} adoptiveFather {Padre adottivo} adoptiveParent {Genitore adottivo} stepmother {Madre acqui­sita} stepfather {Padre acqui­sito} stepparent {Genitore acqui­sito} eggDonor {Donatrice di ovuli} spermDonor {Donatore di sperma} donor {Persona donatrice} surrogate {Gestante per altri} daughter {Figlia} son {Figlio} child {Figlio o figlia} stepdaughter {Figlia acqui­sita} stepson {Figlio acqui­sito} stepchild {Figlio o figlia acqui­siti} donorConceivedChild {Figlio o figlia da dona­zione} surrogacyChild {Figlio o figlia da gesta­zione per altri} sister {Sorella} brother {Fratello} sibling {Fratello o sorella} halfSister {Sorel­lastra} halfBrother {Fratel­lastro} halfSibling {Fratel­lastro o sorel­lastra} adoptiveSister {Sorella adottiva} adoptiveBrother {Fratello adottivo} adoptiveSibling {Fratello o sorella adottivi} stepsister {Sorella acqui­sita} stepbrother {Fratello acqui­sito} stepsibling {Fratello o sorella acqui­siti} partner {Partner} formerPartner {Ex partner} grandmother {Nonna} grandfather {Nonno} grandparent {Nonno o nonna} maternalGrandmother {Nonna materna} maternalGrandfather {Nonno materno} maternalGrandparent {Nonno o nonna materni} paternalGrandmother {Nonna paterna} paternalGrandfather {Nonno paterno} paternalGrandparent {Nonno o nonna paterni} greatGrandmother {Bisnonna} greatGrandfather {Bisnonno} greatGrandparent {Bisnonno o bisnonna} stepGrandmother {Nonna acqui­sita} stepGrandfather {Nonno acqui­sito} stepGrandparent {Nonno o nonna acqui­siti} granddaughter {Nipote} grandson {Nipote} grandchild {Nipote} greatGranddaughter {Pronipote} greatGrandson {Pronipote} greatGrandchild {Pronipote} aunt {Zia} uncle {Zio} maternalAunt {Zia materna} maternalUncle {Zio materno} paternalAunt {Zia paterna} paternalUncle {Zio paterno} parentsSibling {Zio o zia} greatAunt {Prozia} greatUncle {Prozio} grandparentsSibling {Prozio o prozia} niece {Nipote} nephew {Nipote} siblingsChild {Nipote} cousin {Cugino o cugina} motherInLaw {Suocera} fatherInLaw {Suocero} parentInLaw {Suocero o suocera} sisterInLaw {Cognata} brotherInLaw {Cognato} siblingInLaw {Cognato o cognata} daughterInLaw {Nuora} sonInLaw {Genero} childInLaw {Genero o nuora} other {Parente}}',
  'nl': '{term, select, mother {Moeder} father {Vader} parent {Ouder} eggParent {Eicel­ouder} spermParent {Zaad­ouder} biologicalMother {Bio­logische moeder} biologicalFather {Bio­logische vader} adoptiveMother {Adoptief­moeder} adoptiveFather {Adoptief­vader} adoptiveParent {Adoptief­ouder} stepmother {Stief­moeder} stepfather {Stief­vader} stepparent {Stief­ouder} eggDonor {Eicel­donor} spermDonor {Zaad­donor} donor {Donor} surrogate {Draag­moeder} daughter {Dochter} son {Zoon} child {Kind} stepdaughter {Stief­dochter} stepson {Stief­zoon} stepchild {Stief­kind} donorConceivedChild {Donor­kind} surrogacyChild {Kind via draag­moeder­schap} sister {Zus} brother {Broer} sibling {Broer of zus} halfSister {Half­zus} halfBrother {Half­broer} halfSibling {Half­broer of -zus} adoptiveSister {Adoptief­zus} adoptiveBrother {Adoptief­broer} adoptiveSibling {Adoptief­broer of -zus} stepsister {Stief­zus} stepbrother {Stief­broer} stepsibling {Stief­broer of -zus} partner {Partner} formerPartner {Ex-partner} grandmother {Oma} grandfather {Opa} grandparent {Groot­ouder} maternalGrandmother {Oma van moeders­kant} maternalGrandfather {Opa van moeders­kant} maternalGrandparent {Groot­ouder van moeders­kant} paternalGrandmother {Oma van vaders­kant} paternalGrandfather {Opa van vaders­kant} paternalGrandparent {Groot­ouder van vaders­kant} greatGrandmother {Over­groot­moeder} greatGrandfather {Over­groot­vader} greatGrandparent {Over­groot­ouder} stepGrandmother {Stief­oma} stepGrandfather {Stief­opa} stepGrandparent {Stief­groot­ouder} granddaughter {Klein­dochter} grandson {Klein­zoon} grandchild {Klein­kind} greatGranddaughter {Achter­klein­dochter} greatGrandson {Achter­klein­zoon} greatGrandchild {Achter­klein­kind} aunt {Tante} uncle {Oom} maternalAunt {Tante van moeders­kant} maternalUncle {Oom van moeders­kant} paternalAunt {Tante van vaders­kant} paternalUncle {Oom van vaders­kant} parentsSibling {Broer of zus van een ouder} greatAunt {Oud­tante} greatUncle {Oudoom} grandparentsSibling {Broer of zus van een groot­ouder} niece {Nicht} nephew {Neef} siblingsChild {Kind van een broer of zus} cousin {Volle neef of nicht} motherInLaw {Schoon­moeder} fatherInLaw {Schoon­vader} parentInLaw {Schoon­ouder} sisterInLaw {Schoon­zus} brotherInLaw {Zwager} siblingInLaw {Zwager of schoon­zus} daughterInLaw {Schoon­dochter} sonInLaw {Schoon­zoon} childInLaw {Schoon­kind} other {Verwant}}',
  'pt-BR':
    '{term, select, mother {Mãe} father {Pai} parent {Pai/mãe} eggParent {Genitor do óvulo} spermParent {Genitor do esperma} biologicalMother {Mãe bio­lógica} biologicalFather {Pai bio­lógico} adoptiveMother {Mãe adotiva} adoptiveFather {Pai adotivo} adoptiveParent {Pai/mãe adotivo(a)} stepmother {Madrasta} stepfather {Padrasto} stepparent {Padrasto/madrasta} eggDonor {Doadora de óvulos} spermDonor {Doador de esperma} donor {Doador(a)} surrogate {Gestante substituta} daughter {Filha} son {Filho} child {Filho(a)} stepdaughter {Enteada} stepson {Enteado} stepchild {Enteado(a)} donorConceivedChild {Filho(a) por doação} surrogacyChild {Filho(a) por gestação de substi­tuição} sister {Irmã} brother {Irmão} sibling {Irmão/irmã} halfSister {Meia-irmã} halfBrother {Meio-irmão} halfSibling {Meio-irmão/meia-irmã} adoptiveSister {Irmã adotiva} adoptiveBrother {Irmão adotivo} adoptiveSibling {Irmão/irmã adotivo(a)} stepsister {Irmã por afini­dade} stepbrother {Irmão por afini­dade} stepsibling {Irmão/irmã por afini­dade} partner {Parceiro(a)} formerPartner {Ex-parceiro(a)} grandmother {Avó} grandfather {Avô} grandparent {Avô/avó} maternalGrandmother {Avó materna} maternalGrandfather {Avô materno} maternalGrandparent {Avô/avó materno(a)} paternalGrandmother {Avó paterna} paternalGrandfather {Avô paterno} paternalGrandparent {Avô/avó paterno(a)} greatGrandmother {Bisavó} greatGrandfather {Bisavô} greatGrandparent {Bisavô/bisavó} stepGrandmother {Avó por afini­dade} stepGrandfather {Avô por afini­dade} stepGrandparent {Avô/avó por afini­dade} granddaughter {Neta} grandson {Neto} grandchild {Neto(a)} greatGranddaughter {Bisneta} greatGrandson {Bisneto} greatGrandchild {Bisneto(a)} aunt {Tia} uncle {Tio} maternalAunt {Tia materna} maternalUncle {Tio materno} paternalAunt {Tia paterna} paternalUncle {Tio paterno} parentsSibling {Tio(a)} greatAunt {Tia-avó} greatUncle {Tio-avô} grandparentsSibling {Tio-avô/tia-avó} niece {Sobrinha} nephew {Sobrinho} siblingsChild {Sobrinho(a)} cousin {Primo(a)} motherInLaw {Sogra} fatherInLaw {Sogro} parentInLaw {Sogro(a)} sisterInLaw {Cunhada} brotherInLaw {Cunhado} siblingInLaw {Cunhado(a)} daughterInLaw {Nora} sonInLaw {Genro} childInLaw {Genro/nora} other {Parente}}',
  'zh-Hans':
    '{term, select, mother {母亲} father {父亲} parent {家长} eggParent {卵子方家长} spermParent {精子方家长} biologicalMother {生母} biologicalFather {生父} adoptiveMother {养母} adoptiveFather {养父} adoptiveParent {养亲} stepmother {继母} stepfather {继父} stepparent {继亲} eggDonor {卵子捐赠者} spermDonor {精子捐赠者} donor {捐赠者} surrogate {代孕者} daughter {女儿} son {儿子} child {子女} stepdaughter {继女} stepson {继子} stepchild {继子女} donorConceivedChild {捐赠受孕的子女} surrogacyChild {代孕所生的子女} sister {姐妹} brother {兄弟} sibling {兄弟姐妹} halfSister {异父/异母姐妹} halfBrother {异父/异母兄弟} halfSibling {异父/异母兄弟姐妹} adoptiveSister {养姐妹} adoptiveBrother {养兄弟} adoptiveSibling {养兄弟姐妹} stepsister {继姐妹} stepbrother {继兄弟} stepsibling {继兄弟姐妹} partner {伴侣} formerPartner {前伴侣} grandmother {（外）祖母} grandfather {（外）祖父} grandparent {祖辈} maternalGrandmother {外祖母} maternalGrandfather {外祖父} maternalGrandparent {母系祖辈} paternalGrandmother {祖母} paternalGrandfather {祖父} paternalGrandparent {父系祖辈} greatGrandmother {曾祖母} greatGrandfather {曾祖父} greatGrandparent {曾祖辈} stepGrandmother {继（外）祖母} stepGrandfather {继（外）祖父} stepGrandparent {继祖辈} granddaughter {（外）孙女} grandson {（外）孙子} grandchild {孙辈} greatGranddaughter {曾孙女} greatGrandson {曾孙} greatGrandchild {曾孙辈} aunt {姑妈/姨妈} uncle {叔伯/舅舅} maternalAunt {姨妈} maternalUncle {舅舅} paternalAunt {姑妈} paternalUncle {叔伯} parentsSibling {父母的兄弟姐妹} greatAunt {姑婆/姨婆} greatUncle {叔公/舅公} grandparentsSibling {祖辈的兄弟姐妹} niece {侄女/外甥女} nephew {侄子/外甥} siblingsChild {兄弟姐妹的子女} cousin {堂表亲} motherInLaw {岳母/婆婆} fatherInLaw {岳父/公公} parentInLaw {伴侣的家长} sisterInLaw {姻亲姐妹} brotherInLaw {姻亲兄弟} siblingInLaw {姻亲兄弟姐妹} daughterInLaw {儿媳} sonInLaw {女婿} childInLaw {子女的伴侣} other {亲属}}',
  'zh-Hant':
    '{term, select, mother {母親} father {父親} parent {家長} eggParent {卵子方家長} spermParent {精子方家長} biologicalMother {生母} biologicalFather {生父} adoptiveMother {養母} adoptiveFather {養父} adoptiveParent {養親} stepmother {繼母} stepfather {繼父} stepparent {繼親} eggDonor {卵子捐贈者} spermDonor {精子捐贈者} donor {捐贈者} surrogate {代理孕母} daughter {女兒} son {兒子} child {子女} stepdaughter {繼女} stepson {繼子} stepchild {繼子女} donorConceivedChild {捐贈受孕的子女} surrogacyChild {代理孕母所生的子女} sister {姊妹} brother {兄弟} sibling {手足} halfSister {異父/異母姊妹} halfBrother {異父/異母兄弟} halfSibling {異父/異母手足} adoptiveSister {養姊妹} adoptiveBrother {養兄弟} adoptiveSibling {養手足} stepsister {繼姊妹} stepbrother {繼兄弟} stepsibling {繼手足} partner {伴侶} formerPartner {前伴侶} grandmother {（外）祖母} grandfather {（外）祖父} grandparent {祖輩} maternalGrandmother {外祖母} maternalGrandfather {外祖父} maternalGrandparent {母系祖輩} paternalGrandmother {祖母} paternalGrandfather {祖父} paternalGrandparent {父系祖輩} greatGrandmother {曾祖母} greatGrandfather {曾祖父} greatGrandparent {曾祖輩} stepGrandmother {繼（外）祖母} stepGrandfather {繼（外）祖父} stepGrandparent {繼祖輩} granddaughter {（外）孫女} grandson {（外）孫子} grandchild {孫輩} greatGranddaughter {曾孫女} greatGrandson {曾孫} greatGrandchild {曾孫輩} aunt {姑姑/阿姨} uncle {伯叔/舅舅} maternalAunt {阿姨} maternalUncle {舅舅} paternalAunt {姑姑} paternalUncle {伯叔} parentsSibling {父母的手足} greatAunt {姑婆/姨婆} greatUncle {叔公/舅公} grandparentsSibling {祖輩的手足} niece {姪女/外甥女} nephew {姪子/外甥} siblingsChild {手足的子女} cousin {堂表親} motherInLaw {岳母/婆婆} fatherInLaw {岳父/公公} parentInLaw {伴侶的家長} sisterInLaw {姻親姊妹} brotherInLaw {姻親兄弟} siblingInLaw {姻親手足} daughterInLaw {媳婦} sonInLaw {女婿} childInLaw {子女的伴侶} other {親屬}}',
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

/** The notice shown when a change made in the panel, or a connection, would leave people outside the family tree, so is not made. */
const CHANGE_WOULD_CUT_OFF = {
  'en': '{count, plural, one {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.} other {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.}}',
  'de': '{count, plural, one {Dadurch wäre {names} nicht mehr Teil Ihres Stammbaums, weil die einzige Verbindung zu Ihnen entfernt würde. Verbinden Sie diese Person zuerst mit jemand anderem aus Ihrer Familie.} other {Dadurch wären {names} nicht mehr Teil Ihres Stammbaums, weil ihre einzige Verbindung zu Ihnen entfernt würde. Verbinden Sie diese Personen zuerst mit jemand anderem aus Ihrer Familie.}}',
  'es': '{count, plural, one {Esto dejaría a {names} fuera de tu árbol familiar, porque elimina su única conexión contigo. Primero conecta a esa persona con otra persona de tu familia.} other {Esto dejaría a {names} fuera de tu árbol familiar, porque elimina su única conexión contigo. Primero conecta a esas personas con otra persona de tu familia.}}',
  'fr': '{count, plural, one {Cela laisserait {names} en dehors de votre arbre généalogique, car cela supprime son seul lien avec vous. Reliez d’abord cette personne à quelqu’un d’autre de votre famille.} other {Cela laisserait {names} en dehors de votre arbre généalogique, car cela supprime leur seul lien avec vous. Reliez d’abord ces personnes à quelqu’un d’autre de votre famille.}}',
  'it': '{count, plural, one {In questo modo {names} resterebbe fuori dal tuo albero genealogico, perché verrebbe rimosso il suo unico collegamento con te. Prima collega questa persona a qualcun altro della tua famiglia.} other {In questo modo {names} resterebbero fuori dal tuo albero genealogico, perché verrebbe rimosso il loro unico collegamento con te. Prima collega queste persone a qualcun altro della tua famiglia.}}',
  'nl': '{count, plural, one {Hierdoor valt {names} buiten je stamboom, omdat de enige verbinding met jou verdwijnt. Verbind deze persoon eerst met iemand anders in je familie.} other {Hierdoor vallen {names} buiten je stamboom, omdat hun enige verbinding met jou verdwijnt. Verbind deze personen eerst met iemand anders in je familie.}}',
  'pt-BR':
    '{count, plural, one {Isso deixaria {names} fora da sua árvore genealógica, porque remove a única conexão dessa pessoa com você. Primeiro conecte essa pessoa a outra pessoa da sua família.} other {Isso deixaria {names} fora da sua árvore genealógica, porque remove a única conexão dessas pessoas com você. Primeiro conecte essas pessoas a outra pessoa da sua família.}}',
  'zh-Hans':
    '{count, plural, other {这会移除{names}与您之间唯一的连接，使其脱离您的家谱图。请先将其与您家庭中的其他人相连。}}',
  'zh-Hant':
    '{count, plural, other {這會移除{names}與您之間唯一的連結，使其脫離您的家譜圖。請先將其與您家庭中的其他人連結。}}',
} as const satisfies SuppliedWording;

/** The option for a child conceived with an egg or sperm the person donated. */
const CHILD_KIND_DONOR = {
  'en': 'A child conceived with an egg or sperm they donated',
  'de': 'Ein Kind, das mit einer von ihnen gespendeten Eizelle oder Samenzelle gezeugt wurde',
  'es': 'Un hijo o hija concebido con un óvulo o esperma que donaron',
  'fr': 'Un enfant conçu avec un ovule ou du sperme qu’ils ont donné',
  'it': 'Un figlio o una figlia concepito con un ovulo o uno spermatozoo che hanno donato',
  'nl': 'Een kind dat is verwekt met een eicel of zaadcel die zij hebben gedoneerd',
  'pt-BR': 'Um filho(a) concebido(a) com um óvulo ou esperma que doaram',
  'zh-Hans': '用其捐献的卵子或精子孕育的孩子',
  'zh-Hant': '用其捐贈的卵子或精子孕育的孩子',
} as const satisfies SuppliedWording;

/** The option for a child the person carried as a surrogate. */
const CHILD_KIND_SURROGATE = {
  'en': 'A child they carried as a surrogate',
  'de': 'Ein Kind, das sie als Leihmutter ausgetragen haben',
  'es': 'Un hijo o hija que gestaron como gestante subrogada',
  'fr': 'Un enfant qu’ils ont porté en tant que mère porteuse',
  'it': 'Un figlio o una figlia che hanno portato in grembo come gestante surrogata',
  'nl': 'Een kind dat zij als draagmoeder hebben gedragen',
  'pt-BR': 'Um filho(a) que gestaram como gestante de substituição',
  'zh-Hans': '其作为代孕者怀过的孩子',
  'zh-Hant': '其作為代孕者懷過的孩子',
} as const satisfies SuppliedWording;

/** The menu option for a parent of any kind who also carried the pregnancy. The kind of parent is written in before it. */
const PARENT_KIND_CARRIER = {
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

/** The question asking which donors a new sibling shares, for someone recorded with only egg or sperm donors as parents. */
const SHARED_DONORS_LABEL = {
  'en': '{isYou, select, true {Do they share any of your donors?} other {Do they share any of “{name}”’s donors?}}',
  'de': '{isYou, select, true {Hat diese Person eine Ihrer Spenderpersonen mit Ihnen gemeinsam?} other {Hat diese Person eine der Spenderpersonen von „{name}“ mit dieser gemeinsam?}}',
  'es': '{isYou, select, true {¿Comparte alguno de tus donantes?} other {¿Comparte alguno de los donantes de «{name}»?}}',
  'fr': '{isYou, select, true {Partage-t-il ou elle l’un de vos donneurs ?} other {Partage-t-il ou elle l’un des donneurs de « {name} » ?}}',
  'it': '{isYou, select, true {Condivide qualcuno dei tuoi donatori?} other {Condivide qualcuno dei donatori di «{name}»?}}',
  'nl': '{isYou, select, true {Hebben ze een van jouw donoren gemeen?} other {Hebben ze een van de donoren van “{name}” gemeen?}}',
  'pt-BR':
    '{isYou, select, true {Essa pessoa tem algum dos seus doadores em comum?} other {Essa pessoa tem algum dos doadores de “{name}” em comum?}}',
  'zh-Hans':
    '{isYou, select, true {他们和您有共同的捐赠者吗？} other {他们和“{name}”有共同的捐赠者吗？}}',
  'zh-Hant':
    '{isYou, select, true {他們和您有共同的捐贈者嗎？} other {他們和「{name}」有共同的捐贈者嗎？}}',
} as const satisfies SuppliedWording;

/** The question asking which of the parents a new biological sibling shares is their biological parent, when only one of them could be. */
const SIBLING_BIOLOGICAL_PARENT_LABEL = {
  'en': 'Which of them is the sibling’s biological parent?',
  'de': 'Wer von ihnen ist der leibliche Elternteil des Geschwisters?',
  'es': '¿Cuál de ellos es el progenitor biológico de este hermano o hermana?',
  'fr': 'Lequel d’entre eux est le parent biologique de ce frère ou de cette sœur ?',
  'it': 'Chi di loro è il genitore biologico di questo fratello o sorella?',
  'nl': 'Wie van hen is de biologische ouder van deze broer of zus?',
  'pt-BR': 'Qual deles é o pai ou a mãe biológica desse irmão ou irmã?',
  'zh-Hans': '他们中谁是这位兄弟姐妹的亲生父母？',
  'zh-Hant': '他們之中誰是這位兄弟姊妹的親生父母？',
} as const satisfies SuppliedWording;

/** The option that a new sibling is a fraternal twin of the person they are added to. */
const SIBLING_TWIN_FRATERNAL = {
  'en': 'Yes, fraternal (non-identical) twins',
  'de': 'Ja, zweieiige Zwillinge',
  'es': 'Sí, mellizos (no idénticos)',
  'fr': 'Oui, de faux jumeaux (non identiques)',
  'it': 'Sì, gemelli non identici (dizigoti)',
  'nl': 'Ja, een twee-eiige tweeling',
  'pt-BR': 'Sim, gêmeos fraternos (não idênticos)',
  'zh-Hans': '是，异卵双胞胎',
  'zh-Hant': '是，異卵雙胞胎',
} as const satisfies SuppliedWording;

/** The hint under the question asking whether a new sibling is a twin. */
const SIBLING_TWIN_HINT = {
  'en': 'Answer yes for triplets and other multiple births too.',
  'de': 'Antworten Sie auch bei Drillingen und anderen Mehrlingsgeburten mit Ja.',
  'es': 'Responde que sí también en el caso de trillizos y otros partos múltiples.',
  'fr': 'Répondez oui aussi pour des triplés et autres naissances multiples.',
  'it': 'Rispondi sì anche per trigemini e altri parti multipli.',
  'nl': 'Antwoord ook ja bij een drieling of een andere meerling.',
  'pt-BR': 'Responda sim também para trigêmeos e outros partos múltiplos.',
  'zh-Hans': '三胞胎及其他多胞胎也请回答“是”。',
  'zh-Hant': '三胞胎及其他多胞胎也請回答「是」。',
} as const satisfies SuppliedWording;

/** The option that a new sibling is an identical twin of the person they are added to. */
const SIBLING_TWIN_IDENTICAL = {
  'en': 'Yes, identical twins',
  'de': 'Ja, eineiige Zwillinge',
  'es': 'Sí, gemelos idénticos',
  'fr': 'Oui, de vrais jumeaux (identiques)',
  'it': 'Sì, gemelli identici (monozigoti)',
  'nl': 'Ja, een eeneiige tweeling',
  'pt-BR': 'Sim, gêmeos idênticos',
  'zh-Hans': '是，同卵双胞胎',
  'zh-Hant': '是，同卵雙胞胎',
} as const satisfies SuppliedWording;

/** The question asking whether a new sibling is a twin of the person they are added to. */
const SIBLING_TWIN_LABEL = {
  'en': '{isYou, select, true {Are they your twin?} other {Are they “{name}”’s twin?}}',
  'de': '{isYou, select, true {Ist diese Person Ihr Zwilling?} other {Ist diese Person ein Zwilling von „{name}“?}}',
  'es': '{isYou, select, true {¿Es tu gemelo o gemela?} other {¿Es gemelo o gemela de «{name}»?}}',
  'fr': '{isYou, select, true {Est-ce votre jumeau ou jumelle ?} other {Est-ce le jumeau ou la jumelle de « {name} » ?}}',
  'it': '{isYou, select, true {È tuo gemello o tua gemella?} other {È gemello o gemella di «{name}»?}}',
  'nl': '{isYou, select, true {Is dit je tweelingbroer of -zus?} other {Is dit de tweelingbroer of -zus van “{name}”?}}',
  'pt-BR':
    '{isYou, select, true {Essa pessoa é sua gêmea?} other {Essa pessoa é gêmea de “{name}”?}}',
  'zh-Hans':
    '{isYou, select, true {他们是您的双胞胎兄弟姐妹吗？} other {他们是“{name}”的双胞胎兄弟姐妹吗？}}',
  'zh-Hant':
    '{isYou, select, true {他們是您的雙胞胎兄弟姊妹嗎？} other {他們是「{name}」的雙胞胎兄弟姊妹嗎？}}',
} as const satisfies SuppliedWording;

/** The option that a new sibling is not a twin of the person they are added to. */
const SIBLING_TWIN_NO = {
  'en': 'No',
  'de': 'Nein',
  'es': 'No',
  'fr': 'Non',
  'it': 'No',
  'nl': 'Nee',
  'pt-BR': 'Não',
  'zh-Hans': '否',
  'zh-Hant': '否',
} as const satisfies SuppliedWording;

/** The option that a new sibling is a twin of the person they are added to, not known to be identical or fraternal. */
const SIBLING_TWIN_UNKNOWN = {
  'en': 'Yes, but I don’t know if they are identical',
  'de': 'Ja, aber ich weiß nicht, ob sie eineiig sind',
  'es': 'Sí, pero no sé si son idénticos',
  'fr': 'Oui, mais je ne sais pas s’ils sont identiques',
  'it': 'Sì, ma non so se sono identici',
  'nl': 'Ja, maar ik weet niet of ze eeneiig zijn',
  'pt-BR': 'Sim, mas não sei se são idênticos',
  'zh-Hans': '是，但我不知道是否为同卵',
  'zh-Hant': '是，但我不知道是否為同卵',
} as const satisfies SuppliedWording;

/** The question asking whether a family member and one of their twins are identical twins. */
const TWIN_ZYGOSITY_LABEL = {
  'en': '{who, select, personIsYou {Are you and “{twin}” identical twins?} twinIsYou {Are “{name}” and you identical twins?} other {Are “{name}” and “{twin}” identical twins?}}',
  'de': '{who, select, personIsYou {Sind Sie und „{twin}“ eineiige Zwillinge?} twinIsYou {Sind „{name}“ und Sie eineiige Zwillinge?} other {Sind „{name}“ und „{twin}“ eineiige Zwillinge?}}',
  'es': '{who, select, personIsYou {¿Tú y «{twin}» son gemelos idénticos?} twinIsYou {¿«{name}» y tú son gemelos idénticos?} other {¿«{name}» y «{twin}» son gemelos idénticos?}}',
  'fr': '{who, select, personIsYou {« {twin} » et vous êtes-vous de vrais jumeaux (identiques) ?} twinIsYou {« {name} » et vous êtes-vous de vrais jumeaux (identiques) ?} other {« {name} » et « {twin} » sont-ils de vrais jumeaux (identiques) ?}}',
  'it': '{who, select, personIsYou {Tu e «{twin}» siete gemelli identici?} twinIsYou {«{name}» e tu siete gemelli identici?} other {«{name}» e «{twin}» sono gemelli identici?}}',
  'nl': '{who, select, personIsYou {Zijn jij en “{twin}” een eeneiige tweeling?} twinIsYou {Zijn “{name}” en jij een eeneiige tweeling?} other {Zijn “{name}” en “{twin}” een eeneiige tweeling?}}',
  'pt-BR':
    '{who, select, personIsYou {Você e “{twin}” são gêmeos idênticos?} twinIsYou {“{name}” e você são gêmeos idênticos?} other {“{name}” e “{twin}” são gêmeos idênticos?}}',
  'zh-Hans':
    '{who, select, personIsYou {您和“{twin}”是同卵双胞胎吗？} twinIsYou {“{name}”和您是同卵双胞胎吗？} other {“{name}”和“{twin}”是同卵双胞胎吗？}}',
  'zh-Hant':
    '{who, select, personIsYou {您和「{twin}」是同卵雙胞胎嗎？} twinIsYou {「{name}」和您是同卵雙胞胎嗎？} other {「{name}」和「{twin}」是同卵雙胞胎嗎？}}',
} as const satisfies SuppliedWording;

/** The hint under the question asking which of a family member’s siblings are their twins. */
const TWINS_HINT = {
  'en': 'Include triplets and other multiple births.',
  'de': 'Zählen Sie auch Drillinge und andere Mehrlinge mit.',
  'es': 'Incluye también trillizos y otros partos múltiples.',
  'fr': 'Incluez aussi les triplés et autres naissances multiples.',
  'it': 'Includi anche trigemini e altri parti multipli.',
  'nl': 'Tel ook drielingen en andere meerlingen mee.',
  'pt-BR': 'Inclua também trigêmeos e outros partos múltiplos.',
  'zh-Hans': '也包括三胞胎及其他多胞胎。',
  'zh-Hant': '也包括三胞胎及其他多胞胎。',
} as const satisfies SuppliedWording;

/** The question asking which of a family member’s siblings are their twins. */
const TWINS_LABEL = {
  'en': '{isYou, select, true {Which of your siblings, if any, are your twins?} other {Which of “{name}”’s siblings, if any, are their twins?}}',
  'de': '{isYou, select, true {Welche Ihrer Geschwister sind Ihre Zwillinge, falls es welche gibt?} other {Welche Geschwister von „{name}“ sind Zwillinge dieser Person, falls es welche gibt?}}',
  'es': '{isYou, select, true {¿Cuáles de tus hermanos, si alguno, son tus gemelos o mellizos?} other {¿Cuáles de los hermanos de «{name}», si alguno, son sus gemelos o mellizos?}}',
  'fr': '{isYou, select, true {Lesquels de vos frères et sœurs sont vos jumeaux, s’il y en a ?} other {Lesquels des frères et sœurs de « {name} » sont ses jumeaux, s’il y en a ?}}',
  'it': '{isYou, select, true {Quali dei tuoi fratelli e sorelle, se ce ne sono, sono tuoi gemelli?} other {Quali dei fratelli e sorelle di «{name}», se ce ne sono, sono suoi gemelli?}}',
  'nl': '{isYou, select, true {Welke van je broers en zussen zijn, als dat zo is, je tweelingbroer of -zus?} other {Welke van de broers en zussen van “{name}” zijn, als dat zo is, hun tweelingbroer of -zus?}}',
  'pt-BR':
    '{isYou, select, true {Quais dos seus irmãos, se houver, são seus gêmeos?} other {Quais dos irmãos de “{name}”, se houver, são gêmeos dessa pessoa?}}',
  'zh-Hans':
    '{isYou, select, true {您的兄弟姐妹中，哪些是您的双胞胎（如有）？} other {“{name}”的兄弟姐妹中，哪些是其双胞胎（如有）？}}',
  'zh-Hant':
    '{isYou, select, true {您的兄弟姊妹中，哪些是您的雙胞胎（如有）？} other {「{name}」的兄弟姊妹中，哪些是其雙胞胎（如有）？}}',
} as const satisfies SuppliedWording;

/** Why two people already connected cannot be connected again, shown under the choices it makes unavailable. */
const UNAVAILABLE_ALREADY_CONNECTED = {
  'en': '{firstIsYou, select, true {You and “{second}” are already connected. Two people can be connected only once; to connect them another way, first disconnect them.} other {“{first}” and “{second}” are already connected. Two people can be connected only once; to connect them another way, first disconnect them.}}',
  'de': '{firstIsYou, select, true {Sie und „{second}“ sind bereits verbunden. Zwei Personen können nur einmal verbunden werden; um sie anders zu verbinden, trennen Sie sie zuerst.} other {„{first}“ und „{second}“ sind bereits verbunden. Zwei Personen können nur einmal verbunden werden; um sie anders zu verbinden, trennen Sie sie zuerst.}}',
  'es': '{firstIsYou, select, true {Tú e «{second}» ya estáis conectados. Dos personas solo se pueden conectar una vez; para conectarlas de otra forma, primero desconéctalas.} other {«{first}» y «{second}» ya están conectados. Dos personas solo se pueden conectar una vez; para conectarlas de otra forma, primero desconéctalas.}}',
  'fr': '{firstIsYou, select, true {Vous et « {second} » êtes déjà reliés. Deux personnes ne peuvent être reliées qu’une seule fois ; pour les relier autrement, déconnectez-les d’abord.} other {« {first} » et « {second} » sont déjà reliés. Deux personnes ne peuvent être reliées qu’une seule fois ; pour les relier autrement, déconnectez-les d’abord.}}',
  'it': '{firstIsYou, select, true {Tu e «{second}» siete già collegati. Due persone possono essere collegate una sola volta; per collegarle in un altro modo, prima scollegale.} other {«{first}» e «{second}» sono già collegati. Due persone possono essere collegate una sola volta; per collegarle in un altro modo, prima scollegale.}}',
  'nl': '{firstIsYou, select, true {Jij en “{second}” zijn al verbonden. Twee mensen kunnen maar één keer worden verbonden; koppel ze eerst los om ze op een andere manier te verbinden.} other {“{first}” en “{second}” zijn al verbonden. Twee mensen kunnen maar één keer worden verbonden; koppel ze eerst los om ze op een andere manier te verbinden.}}',
  'pt-BR':
    '{firstIsYou, select, true {Você e “{second}” já estão conectados. Duas pessoas só podem ser conectadas uma vez; para conectá-las de outra forma, primeiro desconecte-as.} other {“{first}” e “{second}” já estão conectados. Duas pessoas só podem ser conectadas uma vez; para conectá-las de outra forma, primeiro desconecte-as.}}',
  'zh-Hans':
    '{firstIsYou, select, true {您和“{second}”已经连接。两个人只能连接一次；如需以其他方式连接，请先断开连接。} other {“{first}”和“{second}”已经连接。两个人只能连接一次；如需以其他方式连接，请先断开连接。}}',
  'zh-Hant':
    '{firstIsYou, select, true {您和「{second}」已經連結。兩個人只能連結一次；如需以其他方式連結，請先中斷連結。} other {「{first}」和「{second}」已經連結。兩個人只能連結一次；如需以其他方式連結，請先中斷連結。}}',
} as const satisfies SuppliedWording;

/** Why someone cannot be made a parent of one of their own ancestors, shown under the choice it makes unavailable. */
const UNAVAILABLE_ANCESTOR = {
  'en': '{who, select, parentIsYou {You cannot be a parent of “{child}”, who is already one of your ancestors.} childIsYou {“{parent}” cannot be your parent, because you are already one of their ancestors.} other {“{parent}” cannot be a parent of “{child}”, who is already one of their ancestors.}}',
  'de': '{who, select, parentIsYou {Sie können kein Elternteil von „{child}“ sein, da „{child}“ bereits zu Ihren Vorfahren gehört.} childIsYou {„{parent}“ kann nicht Ihr Elternteil sein, da Sie bereits zu den Vorfahren von „{parent}“ gehören.} other {„{parent}“ kann kein Elternteil von „{child}“ sein, da „{child}“ bereits zu den Vorfahren von „{parent}“ gehört.}}',
  'es': '{who, select, parentIsYou {No puedes ser progenitor/a de «{child}», que ya es uno de tus antepasados.} childIsYou {«{parent}» no puede ser tu progenitor/a, porque ya eres uno de sus antepasados.} other {«{parent}» no puede ser progenitor/a de «{child}», que ya es uno de sus antepasados.}}',
  'fr': '{who, select, parentIsYou {Vous ne pouvez pas être un parent de « {child} », qui fait déjà partie de vos ancêtres.} childIsYou {« {parent} » ne peut pas être votre parent, car vous faites déjà partie de ses ancêtres.} other {« {parent} » ne peut pas être un parent de « {child} », qui fait déjà partie de ses ancêtres.}}',
  'it': '{who, select, parentIsYou {Non puoi essere un genitore di «{child}», che è già uno dei tuoi antenati.} childIsYou {«{parent}» non può essere tuo genitore, perché sei già uno dei suoi antenati.} other {«{parent}» non può essere un genitore di «{child}», che è già uno dei suoi antenati.}}',
  'nl': '{who, select, parentIsYou {Je kunt geen ouder zijn van “{child}”, die al een van je voorouders is.} childIsYou {“{parent}” kan niet je ouder zijn, omdat jij al een van diens voorouders bent.} other {“{parent}” kan geen ouder zijn van “{child}”, die al een van diens voorouders is.}}',
  'pt-BR':
    '{who, select, parentIsYou {Você não pode ser pai/mãe de “{child}”, que já é um dos seus antepassados.} childIsYou {“{parent}” não pode ser seu pai/mãe, porque você já é um dos antepassados dessa pessoa.} other {“{parent}” não pode ser pai/mãe de “{child}”, que já é um dos antepassados dessa pessoa.}}',
  'zh-Hans':
    '{who, select, parentIsYou {您不能是“{child}”的父母，因为“{child}”已经是您的祖先之一。} childIsYou {“{parent}”不能是您的父母，因为您已经是其祖先之一。} other {“{parent}”不能是“{child}”的父母，因为“{child}”已经是“{parent}”的祖先之一。}}',
  'zh-Hant':
    '{who, select, parentIsYou {您不能是「{child}」的父母，因為「{child}」已經是您的祖先之一。} childIsYou {「{parent}」不能是您的父母，因為您已經是其祖先之一。} other {「{parent}」不能是「{child}」的父母，因為「{child}」已經是「{parent}」的祖先之一。}}',
} as const satisfies SuppliedWording;

/** Why two parents recorded with the same sex at birth cannot both be a new child’s genetic parents. */
const UNAVAILABLE_BOTH_SAME_SEX = {
  'en': '{firstIsYou, select, true {Some answers are unavailable because you and “{second}” are both recorded as “{sex}” at birth, so you cannot both be the child’s genetic parents. To choose one, first change one of your sexes at birth.} other {Some answers are unavailable because “{first}” and “{second}” are both recorded as “{sex}” at birth, so they cannot both be the child’s genetic parents. To choose one, first change the sex at birth of one of them.}}',
  'de': '{firstIsYou, select, true {Einige Antworten sind nicht verfügbar, weil Sie und „{second}“ beide als „{sex}“ bei der Geburt erfasst sind und daher nicht beide die genetischen Eltern des Kindes sein können. Um eine davon zu wählen, ändern Sie zuerst das Geschlecht bei der Geburt von einem von Ihnen beiden.} other {Einige Antworten sind nicht verfügbar, weil „{first}“ und „{second}“ beide als „{sex}“ bei der Geburt erfasst sind und daher nicht beide die genetischen Eltern des Kindes sein können. Um eine davon zu wählen, ändern Sie zuerst das Geschlecht bei der Geburt von einem der beiden.}}',
  'es': '{firstIsYou, select, true {Algunas respuestas no están disponibles porque tú y «{second}» constáis como «{sex}» al nacer, así que no podéis ser ambos los progenitores genéticos del hijo/a. Para elegir una, primero cambia el sexo al nacer de uno de vosotros.} other {Algunas respuestas no están disponibles porque «{first}» y «{second}» constan como «{sex}» al nacer, así que no pueden ser ambos los progenitores genéticos del hijo/a. Para elegir una, primero cambia el sexo al nacer de uno de ellos.}}',
  'fr': '{firstIsYou, select, true {Certaines réponses ne sont pas disponibles, car vous et « {second} » êtes tous deux enregistrés comme « {sex} » à la naissance et ne pouvez donc pas être tous deux les parents génétiques de l’enfant. Pour en choisir une, modifiez d’abord le sexe à la naissance de l’un de vous.} other {Certaines réponses ne sont pas disponibles, car « {first} » et « {second} » sont tous deux enregistrés comme « {sex} » à la naissance et ne peuvent donc pas être tous deux les parents génétiques de l’enfant. Pour en choisir une, modifiez d’abord le sexe à la naissance de l’un d’eux.}}',
  'it': '{firstIsYou, select, true {Alcune risposte non sono disponibili perché tu e «{second}» risultate entrambi registrati come «{sex}» alla nascita, quindi non potete essere entrambi i genitori genetici del figlio o della figlia. Per sceglierne una, prima modifica il sesso alla nascita di uno di voi.} other {Alcune risposte non sono disponibili perché «{first}» e «{second}» risultano entrambi registrati come «{sex}» alla nascita, quindi non possono essere entrambi i genitori genetici del figlio o della figlia. Per sceglierne una, prima modifica il sesso alla nascita di uno dei due.}}',
  'nl': '{firstIsYou, select, true {Sommige antwoorden zijn niet beschikbaar omdat jij en “{second}” allebei bij de geboorte als “{sex}” zijn geregistreerd, en dus niet allebei de genetische ouders van het kind kunnen zijn. Wijzig eerst het geslacht bij de geboorte van een van jullie om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat “{first}” en “{second}” allebei bij de geboorte als “{sex}” zijn geregistreerd, en dus niet allebei de genetische ouders van het kind kunnen zijn. Wijzig eerst het geslacht bij de geboorte van een van hen om er een te kiezen.}}',
  'pt-BR':
    '{firstIsYou, select, true {Algumas respostas não estão disponíveis porque você e “{second}” estão registrados como “{sex}” ao nascer e, portanto, não podem ser ambos os pais genéticos do filho(a). Para escolher uma delas, primeiro altere o sexo ao nascer de um de vocês.} other {Algumas respostas não estão disponíveis porque “{first}” e “{second}” estão registrados como “{sex}” ao nascer e, portanto, não podem ser ambos os pais genéticos do filho(a). Para escolher uma delas, primeiro altere o sexo ao nascer de um deles.}}',
  'zh-Hans':
    '{firstIsYou, select, true {部分选项不可用，因为您和“{second}”的出生时性别都记录为“{sex}”，因此不能同时是这个孩子的遗传学父母。如需选择，请先更改你们其中一位的出生时性别。} other {部分选项不可用，因为“{first}”和“{second}”的出生时性别都记录为“{sex}”，因此不能同时是这个孩子的遗传学父母。如需选择，请先更改其中一位的出生时性别。}}',
  'zh-Hant':
    '{firstIsYou, select, true {部分選項無法使用，因為您和「{second}」的出生時性別都記錄為「{sex}」，因此不能同時是這個孩子的遺傳學父母。如需選擇，請先變更你們其中一位的出生時性別。} other {部分選項無法使用，因為「{first}」和「{second}」的出生時性別都記錄為「{sex}」，因此不能同時是這個孩子的遺傳學父母。如需選擇，請先變更其中一位的出生時性別。}}',
} as const satisfies SuppliedWording;

/** Why someone recorded as male at birth cannot be recorded as having carried a pregnancy. */
const UNAVAILABLE_CANNOT_CARRY = {
  'en': '{who, select, you {Some answers are unavailable because you are recorded as “{sex}” at birth, so you cannot have carried a pregnancy. To choose one, first change your sex at birth.} this {Some answers are unavailable because this person is recorded as “{sex}” at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.} other {Some answers are unavailable because “{name}” is recorded as “{sex}” at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.}}',
  'de': '{who, select, you {Einige Antworten sind nicht verfügbar, weil Sie als „{sex}“ bei der Geburt erfasst sind und daher keine Schwangerschaft ausgetragen haben können. Um eine davon zu wählen, ändern Sie zuerst Ihr Geschlecht bei der Geburt.} this {Einige Antworten sind nicht verfügbar, weil diese Person als „{sex}“ bei der Geburt erfasst ist und daher keine Schwangerschaft ausgetragen haben kann. Um eine davon zu wählen, ändern Sie zuerst ihr Geschlecht bei der Geburt.} other {Einige Antworten sind nicht verfügbar, weil „{name}“ als „{sex}“ bei der Geburt erfasst ist und daher keine Schwangerschaft ausgetragen haben kann. Um eine davon zu wählen, ändern Sie zuerst das Geschlecht bei der Geburt dieser Person.}}',
  'es': '{who, select, you {Algunas respuestas no están disponibles porque constas como «{sex}» al nacer, así que no puedes haber llevado un embarazo. Para elegir una, primero cambia tu sexo al nacer.} this {Algunas respuestas no están disponibles porque esta persona consta como «{sex}» al nacer, así que no puede haber llevado un embarazo. Para elegir una, primero cambia su sexo al nacer.} other {Algunas respuestas no están disponibles porque «{name}» consta como «{sex}» al nacer, así que no puede haber llevado un embarazo. Para elegir una, primero cambia su sexo al nacer.}}',
  'fr': '{who, select, you {Certaines réponses ne sont pas disponibles, car vous êtes enregistré comme « {sex} » à la naissance et ne pouvez donc pas avoir porté une grossesse. Pour en choisir une, modifiez d’abord votre sexe à la naissance.} this {Certaines réponses ne sont pas disponibles, car cette personne est enregistrée comme « {sex} » à la naissance et ne peut donc pas avoir porté une grossesse. Pour en choisir une, modifiez d’abord son sexe à la naissance.} other {Certaines réponses ne sont pas disponibles, car « {name} » est enregistré comme « {sex} » à la naissance et ne peut donc pas avoir porté une grossesse. Pour en choisir une, modifiez d’abord son sexe à la naissance.}}',
  'it': '{who, select, you {Alcune risposte non sono disponibili perché risulti registrato come «{sex}» alla nascita, quindi non puoi aver portato avanti una gravidanza. Per sceglierne una, prima modifica il tuo sesso alla nascita.} this {Alcune risposte non sono disponibili perché questa persona risulta registrata come «{sex}» alla nascita, quindi non può aver portato avanti una gravidanza. Per sceglierne una, prima modifica il suo sesso alla nascita.} other {Alcune risposte non sono disponibili perché «{name}» risulta registrato come «{sex}» alla nascita, quindi non può aver portato avanti una gravidanza. Per sceglierne una, prima modifica il suo sesso alla nascita.}}',
  'nl': '{who, select, you {Sommige antwoorden zijn niet beschikbaar omdat je bij de geboorte als “{sex}” bent geregistreerd en dus geen zwangerschap kunt hebben gedragen. Wijzig eerst je geslacht bij de geboorte om er een te kiezen.} this {Sommige antwoorden zijn niet beschikbaar omdat deze persoon bij de geboorte als “{sex}” is geregistreerd en dus geen zwangerschap kan hebben gedragen. Wijzig eerst het geslacht bij de geboorte van deze persoon om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat “{name}” bij de geboorte als “{sex}” is geregistreerd en dus geen zwangerschap kan hebben gedragen. Wijzig eerst het geslacht bij de geboorte van deze persoon om er een te kiezen.}}',
  'pt-BR':
    '{who, select, you {Algumas respostas não estão disponíveis porque você está registrado(a) como “{sex}” ao nascer e, portanto, não pode ter gestado uma gravidez. Para escolher uma delas, primeiro altere seu sexo ao nascer.} this {Algumas respostas não estão disponíveis porque essa pessoa está registrada como “{sex}” ao nascer e, portanto, não pode ter gestado uma gravidez. Para escolher uma delas, primeiro altere o sexo ao nascer dela.} other {Algumas respostas não estão disponíveis porque “{name}” está registrado(a) como “{sex}” ao nascer e, portanto, não pode ter gestado uma gravidez. Para escolher uma delas, primeiro altere o sexo ao nascer dessa pessoa.}}',
  'zh-Hans':
    '{who, select, you {部分选项不可用，因为您的出生时性别记录为“{sex}”，因此不可能怀过孕。如需选择，请先更改您的出生时性别。} this {部分选项不可用，因为此人的出生时性别记录为“{sex}”，因此不可能怀过孕。如需选择，请先更改其出生时性别。} other {部分选项不可用，因为“{name}”的出生时性别记录为“{sex}”，因此不可能怀过孕。如需选择，请先更改其出生时性别。}}',
  'zh-Hant':
    '{who, select, you {部分選項無法使用，因為您的出生時性別記錄為「{sex}」，因此不可能懷過孕。如需選擇，請先變更您的出生時性別。} this {部分選項無法使用，因為此人的出生時性別記錄為「{sex}」，因此不可能懷過孕。如需選擇，請先變更其出生時性別。} other {部分選項無法使用，因為「{name}」的出生時性別記錄為「{sex}」，因此不可能懷過孕。如需選擇，請先變更其出生時性別。}}',
} as const satisfies SuppliedWording;

/** Why a sex at birth is unavailable for someone recorded as having carried a child’s pregnancy. */
const UNAVAILABLE_CARRIED = {
  'en': '{who, select, personIsYou {Some answers are unavailable because you are recorded as having carried “{child}”, which nobody recorded as “{sex}” at birth can have. To choose one, first change how you are connected to “{child}”.} childIsYou {Some answers are unavailable because this person is recorded as having carried you, which nobody recorded as “{sex}” at birth can have. To choose one, first change how they are connected to you.} other {Some answers are unavailable because this person is recorded as having carried “{child}”, which nobody recorded as “{sex}” at birth can have. To choose one, first change how they are connected to “{child}”.}}',
  'de': '{who, select, personIsYou {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass Sie „{child}“ ausgetragen haben, was niemand mit dem Geschlecht „{sex}“ bei der Geburt kann. Um eine davon zu wählen, ändern Sie zuerst Ihre Verbindung mit „{child}“.} childIsYou {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass diese Person Sie ausgetragen hat, was niemand mit dem Geschlecht „{sex}“ bei der Geburt kann. Um eine davon zu wählen, ändern Sie zuerst ihre Verbindung mit Ihnen.} other {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass diese Person „{child}“ ausgetragen hat, was niemand mit dem Geschlecht „{sex}“ bei der Geburt kann. Um eine davon zu wählen, ändern Sie zuerst ihre Verbindung mit „{child}“.}}',
  'es': '{who, select, personIsYou {Algunas respuestas no están disponibles porque consta que llevaste el embarazo de «{child}», algo que nadie registrado como «{sex}» al nacer puede haber hecho. Para elegir una, primero cambia tu conexión con «{child}».} childIsYou {Algunas respuestas no están disponibles porque consta que esta persona llevó tu embarazo, algo que nadie registrado como «{sex}» al nacer puede haber hecho. Para elegir una, primero cambia su conexión contigo.} other {Algunas respuestas no están disponibles porque consta que esta persona llevó el embarazo de «{child}», algo que nadie registrado como «{sex}» al nacer puede haber hecho. Para elegir una, primero cambia su conexión con «{child}».}}',
  'fr': '{who, select, personIsYou {Certaines réponses ne sont pas disponibles, car vous êtes enregistré comme ayant porté « {child} », ce qu’aucune personne enregistrée comme « {sex} » à la naissance ne peut avoir fait. Pour en choisir une, modifiez d’abord votre lien avec « {child} ».} childIsYou {Certaines réponses ne sont pas disponibles, car cette personne est enregistrée comme vous ayant porté, ce qu’aucune personne enregistrée comme « {sex} » à la naissance ne peut avoir fait. Pour en choisir une, modifiez d’abord son lien avec vous.} other {Certaines réponses ne sont pas disponibles, car cette personne est enregistrée comme ayant porté « {child} », ce qu’aucune personne enregistrée comme « {sex} » à la naissance ne peut avoir fait. Pour en choisir une, modifiez d’abord son lien avec « {child} ».}}',
  'it': '{who, select, personIsYou {Alcune risposte non sono disponibili perché risulta che hai portato in grembo «{child}», cosa che nessuno registrato come «{sex}» alla nascita può aver fatto. Per sceglierne una, prima modifica il tuo legame con «{child}».} childIsYou {Alcune risposte non sono disponibili perché risulta che questa persona ti ha portato in grembo, cosa che nessuno registrato come «{sex}» alla nascita può aver fatto. Per sceglierne una, prima modifica il suo legame con te.} other {Alcune risposte non sono disponibili perché risulta che questa persona ha portato in grembo «{child}», cosa che nessuno registrato come «{sex}» alla nascita può aver fatto. Per sceglierne una, prima modifica il suo legame con «{child}».}}',
  'nl': '{who, select, personIsYou {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat jij “{child}” hebt gedragen, wat niemand die bij de geboorte als “{sex}” is geregistreerd kan hebben gedaan. Wijzig eerst hoe je met “{child}” verbonden bent om er een te kiezen.} childIsYou {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat deze persoon jou heeft gedragen, wat niemand die bij de geboorte als “{sex}” is geregistreerd kan hebben gedaan. Wijzig eerst hoe deze persoon met jou verbonden is om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat deze persoon “{child}” heeft gedragen, wat niemand die bij de geboorte als “{sex}” is geregistreerd kan hebben gedaan. Wijzig eerst hoe deze persoon met “{child}” verbonden is om er een te kiezen.}}',
  'pt-BR':
    '{who, select, personIsYou {Algumas respostas não estão disponíveis porque está registrado que você gestou “{child}”, o que ninguém registrado como “{sex}” ao nascer pode ter feito. Para escolher uma delas, primeiro altere sua conexão com “{child}”.} childIsYou {Algumas respostas não estão disponíveis porque está registrado que essa pessoa gestou você, o que ninguém registrado como “{sex}” ao nascer pode ter feito. Para escolher uma delas, primeiro altere a conexão dela com você.} other {Algumas respostas não estão disponíveis porque está registrado que essa pessoa gestou “{child}”, o que ninguém registrado como “{sex}” ao nascer pode ter feito. Para escolher uma delas, primeiro altere a conexão dela com “{child}”.}}',
  'zh-Hans':
    '{who, select, personIsYou {部分选项不可用，因为记录显示是您怀了“{child}”，而出生时性别记录为“{sex}”的人不可能怀孕。如需选择，请先更改您与“{child}”之间的连接。} childIsYou {部分选项不可用，因为记录显示是此人怀了您，而出生时性别记录为“{sex}”的人不可能怀孕。如需选择，请先更改此人与您之间的连接。} other {部分选项不可用，因为记录显示是此人怀了“{child}”，而出生时性别记录为“{sex}”的人不可能怀孕。如需选择，请先更改此人与“{child}”之间的连接。}}',
  'zh-Hant':
    '{who, select, personIsYou {部分選項無法使用，因為記錄顯示是您懷了「{child}」，而出生時性別記錄為「{sex}」的人不可能懷孕。如需選擇，請先變更您與「{child}」之間的連結。} childIsYou {部分選項無法使用，因為記錄顯示是此人懷了您，而出生時性別記錄為「{sex}」的人不可能懷孕。如需選擇，請先變更此人與您之間的連結。} other {部分選項無法使用，因為記錄顯示是此人懷了「{child}」，而出生時性別記錄為「{sex}」的人不可能懷孕。如需選擇，請先變更此人與「{child}」之間的連結。}}',
} as const satisfies SuppliedWording;

/** Why the choices that would record a parent as having carried a child are unavailable in the connect menu: someone else already did. */
const UNAVAILABLE_CARRIER_CHOICE = {
  'en': '{who, select, carrierIsYou {You are recorded as having carried “{child}”, and only one person carries a pregnancy.} childIsYou {“{carrier}” is recorded as having carried you, and only one person carries a pregnancy.} other {“{carrier}” is recorded as having carried “{child}”, and only one person carries a pregnancy.}}',
  'de': '{who, select, carrierIsYou {Es ist erfasst, dass Sie „{child}“ ausgetragen haben, und nur eine Person trägt eine Schwangerschaft aus.} childIsYou {Es ist erfasst, dass „{carrier}“ Sie ausgetragen hat, und nur eine Person trägt eine Schwangerschaft aus.} other {Es ist erfasst, dass „{carrier}“ „{child}“ ausgetragen hat, und nur eine Person trägt eine Schwangerschaft aus.}}',
  'es': '{who, select, carrierIsYou {Consta que llevaste el embarazo de «{child}», y solo una persona lleva cada embarazo.} childIsYou {Consta que «{carrier}» llevó tu embarazo, y solo una persona lleva cada embarazo.} other {Consta que «{carrier}» llevó el embarazo de «{child}», y solo una persona lleva cada embarazo.}}',
  'fr': '{who, select, carrierIsYou {Vous êtes enregistré comme ayant porté « {child} », et une seule personne porte une grossesse.} childIsYou {« {carrier} » est enregistré comme vous ayant porté, et une seule personne porte une grossesse.} other {« {carrier} » est enregistré comme ayant porté « {child} », et une seule personne porte une grossesse.}}',
  'it': '{who, select, carrierIsYou {Risulta che hai portato in grembo «{child}», e una sola persona porta avanti una gravidanza.} childIsYou {Risulta che «{carrier}» ti ha portato in grembo, e una sola persona porta avanti una gravidanza.} other {Risulta che «{carrier}» ha portato in grembo «{child}», e una sola persona porta avanti una gravidanza.}}',
  'nl': '{who, select, carrierIsYou {Er is geregistreerd dat jij “{child}” hebt gedragen, en maar één persoon draagt een zwangerschap.} childIsYou {Er is geregistreerd dat “{carrier}” jou heeft gedragen, en maar één persoon draagt een zwangerschap.} other {Er is geregistreerd dat “{carrier}” “{child}” heeft gedragen, en maar één persoon draagt een zwangerschap.}}',
  'pt-BR':
    '{who, select, carrierIsYou {Está registrado que você gestou “{child}”, e só uma pessoa gesta cada gravidez.} childIsYou {Está registrado que “{carrier}” gestou você, e só uma pessoa gesta cada gravidez.} other {Está registrado que “{carrier}” gestou “{child}”, e só uma pessoa gesta cada gravidez.}}',
  'zh-Hans':
    '{who, select, carrierIsYou {记录显示是您怀了“{child}”，而每次怀孕只能由一个人承担。} childIsYou {记录显示是“{carrier}”怀了您，而每次怀孕只能由一个人承担。} other {记录显示是“{carrier}”怀了“{child}”，而每次怀孕只能由一个人承担。}}',
  'zh-Hant':
    '{who, select, carrierIsYou {記錄顯示是您懷了「{child}」，而每次懷孕只能由一個人承擔。} childIsYou {記錄顯示是「{carrier}」懷了您，而每次懷孕只能由一個人承擔。} other {記錄顯示是「{carrier}」懷了「{child}」，而每次懷孕只能由一個人承擔。}}',
} as const satisfies SuppliedWording;

/** Why answers that would record someone else as having carried a child are unavailable: someone already did. */
const UNAVAILABLE_CARRIER_RECORDED = {
  'en': '{who, select, carrierIsYou {Some answers are unavailable because you are recorded as having carried “{child}”, and only one person carries a pregnancy. To choose one, first change how you are connected to “{child}”.} childIsYou {Some answers are unavailable because “{carrier}” is recorded as having carried you, and only one person carries a pregnancy. To choose one, first change how “{carrier}” is connected to you.} other {Some answers are unavailable because “{carrier}” is recorded as having carried “{child}”, and only one person carries a pregnancy. To choose one, first change how “{carrier}” is connected to “{child}”.}}',
  'de': '{who, select, carrierIsYou {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass Sie „{child}“ ausgetragen haben, und nur eine Person eine Schwangerschaft austrägt. Um eine davon zu wählen, ändern Sie zuerst Ihre Verbindung mit „{child}“.} childIsYou {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass „{carrier}“ Sie ausgetragen hat, und nur eine Person eine Schwangerschaft austrägt. Um eine davon zu wählen, ändern Sie zuerst die Verbindung von „{carrier}“ mit Ihnen.} other {Einige Antworten sind nicht verfügbar, weil erfasst ist, dass „{carrier}“ „{child}“ ausgetragen hat, und nur eine Person eine Schwangerschaft austrägt. Um eine davon zu wählen, ändern Sie zuerst die Verbindung von „{carrier}“ mit „{child}“.}}',
  'es': '{who, select, carrierIsYou {Algunas respuestas no están disponibles porque consta que llevaste el embarazo de «{child}», y solo una persona lleva cada embarazo. Para elegir una, primero cambia tu conexión con «{child}».} childIsYou {Algunas respuestas no están disponibles porque consta que «{carrier}» llevó tu embarazo, y solo una persona lleva cada embarazo. Para elegir una, primero cambia la conexión de «{carrier}» contigo.} other {Algunas respuestas no están disponibles porque consta que «{carrier}» llevó el embarazo de «{child}», y solo una persona lleva cada embarazo. Para elegir una, primero cambia la conexión de «{carrier}» con «{child}».}}',
  'fr': '{who, select, carrierIsYou {Certaines réponses ne sont pas disponibles, car vous êtes enregistré comme ayant porté « {child} », et une seule personne porte une grossesse. Pour en choisir une, modifiez d’abord votre lien avec « {child} ».} childIsYou {Certaines réponses ne sont pas disponibles, car « {carrier} » est enregistré comme vous ayant porté, et une seule personne porte une grossesse. Pour en choisir une, modifiez d’abord le lien de « {carrier} » avec vous.} other {Certaines réponses ne sont pas disponibles, car « {carrier} » est enregistré comme ayant porté « {child} », et une seule personne porte une grossesse. Pour en choisir une, modifiez d’abord le lien de « {carrier} » avec « {child} ».}}',
  'it': '{who, select, carrierIsYou {Alcune risposte non sono disponibili perché risulta che hai portato in grembo «{child}», e una sola persona porta avanti una gravidanza. Per sceglierne una, prima modifica il tuo legame con «{child}».} childIsYou {Alcune risposte non sono disponibili perché risulta che «{carrier}» ti ha portato in grembo, e una sola persona porta avanti una gravidanza. Per sceglierne una, prima modifica il legame di «{carrier}» con te.} other {Alcune risposte non sono disponibili perché risulta che «{carrier}» ha portato in grembo «{child}», e una sola persona porta avanti una gravidanza. Per sceglierne una, prima modifica il legame di «{carrier}» con «{child}».}}',
  'nl': '{who, select, carrierIsYou {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat jij “{child}” hebt gedragen, en maar één persoon een zwangerschap draagt. Wijzig eerst hoe je met “{child}” verbonden bent om er een te kiezen.} childIsYou {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat “{carrier}” jou heeft gedragen, en maar één persoon een zwangerschap draagt. Wijzig eerst hoe “{carrier}” met jou verbonden is om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat is geregistreerd dat “{carrier}” “{child}” heeft gedragen, en maar één persoon een zwangerschap draagt. Wijzig eerst hoe “{carrier}” met “{child}” verbonden is om er een te kiezen.}}',
  'pt-BR':
    '{who, select, carrierIsYou {Algumas respostas não estão disponíveis porque está registrado que você gestou “{child}”, e só uma pessoa gesta cada gravidez. Para escolher uma delas, primeiro altere sua conexão com “{child}”.} childIsYou {Algumas respostas não estão disponíveis porque está registrado que “{carrier}” gestou você, e só uma pessoa gesta cada gravidez. Para escolher uma delas, primeiro altere a conexão de “{carrier}” com você.} other {Algumas respostas não estão disponíveis porque está registrado que “{carrier}” gestou “{child}”, e só uma pessoa gesta cada gravidez. Para escolher uma delas, primeiro altere a conexão de “{carrier}” com “{child}”.}}',
  'zh-Hans':
    '{who, select, carrierIsYou {部分选项不可用，因为记录显示是您怀了“{child}”，而每次怀孕只能由一个人承担。如需选择，请先更改您与“{child}”之间的连接。} childIsYou {部分选项不可用，因为记录显示是“{carrier}”怀了您，而每次怀孕只能由一个人承担。如需选择，请先更改“{carrier}”与您之间的连接。} other {部分选项不可用，因为记录显示是“{carrier}”怀了“{child}”，而每次怀孕只能由一个人承担。如需选择，请先更改“{carrier}”与“{child}”之间的连接。}}',
  'zh-Hant':
    '{who, select, carrierIsYou {部分選項無法使用，因為記錄顯示是您懷了「{child}」，而每次懷孕只能由一個人承擔。如需選擇，請先變更您與「{child}」之間的連結。} childIsYou {部分選項無法使用，因為記錄顯示是「{carrier}」懷了您，而每次懷孕只能由一個人承擔。如需選擇，請先變更「{carrier}」與您之間的連結。} other {部分選項無法使用，因為記錄顯示是「{carrier}」懷了「{child}」，而每次懷孕只能由一個人承擔。如需選擇，請先變更「{carrier}」與「{child}」之間的連結。}}',
} as const satisfies SuppliedWording;

/** Why nobody else can be a genetic parent of a child who already has two. */
const UNAVAILABLE_GENETIC_PARENTS_FULL = {
  'en': '{who, select, childIsYou {Some answers are unavailable because you already have two genetic parents recorded, “{first}” and “{second}”. To choose one, first change how one of them is connected to you.} includesYou {Some answers are unavailable because “{child}” already has two genetic parents recorded, you and “{second}”. To choose one, first change how one of you is connected to “{child}”.} other {Some answers are unavailable because “{child}” already has two genetic parents recorded, “{first}” and “{second}”. To choose one, first change how one of them is connected to “{child}”.}}',
  'de': '{who, select, childIsYou {Einige Antworten sind nicht verfügbar, weil für Sie bereits zwei genetische Eltern erfasst sind, „{first}“ und „{second}“. Um eine davon zu wählen, ändern Sie zuerst die Verbindung eines der beiden mit Ihnen.} includesYou {Einige Antworten sind nicht verfügbar, weil für „{child}“ bereits zwei genetische Eltern erfasst sind, Sie und „{second}“. Um eine davon zu wählen, ändern Sie zuerst die Verbindung eines von Ihnen beiden mit „{child}“.} other {Einige Antworten sind nicht verfügbar, weil für „{child}“ bereits zwei genetische Eltern erfasst sind, „{first}“ und „{second}“. Um eine davon zu wählen, ändern Sie zuerst die Verbindung eines der beiden mit „{child}“.}}',
  'es': '{who, select, childIsYou {Algunas respuestas no están disponibles porque ya tienes dos progenitores genéticos registrados, «{first}» y «{second}». Para elegir una, primero cambia la conexión de uno de ellos contigo.} includesYou {Algunas respuestas no están disponibles porque «{child}» ya tiene dos progenitores genéticos registrados, tú y «{second}». Para elegir una, primero cambia la conexión de uno de vosotros con «{child}».} other {Algunas respuestas no están disponibles porque «{child}» ya tiene dos progenitores genéticos registrados, «{first}» y «{second}». Para elegir una, primero cambia la conexión de uno de ellos con «{child}».}}',
  'fr': '{who, select, childIsYou {Certaines réponses ne sont pas disponibles, car vous avez déjà deux parents génétiques enregistrés, « {first} » et « {second} ». Pour en choisir une, modifiez d’abord le lien de l’un d’eux avec vous.} includesYou {Certaines réponses ne sont pas disponibles, car « {child} » a déjà deux parents génétiques enregistrés, vous et « {second} ». Pour en choisir une, modifiez d’abord le lien de l’un de vous deux avec « {child} ».} other {Certaines réponses ne sont pas disponibles, car « {child} » a déjà deux parents génétiques enregistrés, « {first} » et « {second} ». Pour en choisir une, modifiez d’abord le lien de l’un d’eux avec « {child} ».}}',
  'it': '{who, select, childIsYou {Alcune risposte non sono disponibili perché hai già due genitori genetici registrati, «{first}» e «{second}». Per sceglierne una, prima modifica il legame di uno dei due con te.} includesYou {Alcune risposte non sono disponibili perché «{child}» ha già due genitori genetici registrati, tu e «{second}». Per sceglierne una, prima modifica il legame di uno di voi due con «{child}».} other {Alcune risposte non sono disponibili perché «{child}» ha già due genitori genetici registrati, «{first}» e «{second}». Per sceglierne una, prima modifica il legame di uno dei due con «{child}».}}',
  'nl': '{who, select, childIsYou {Sommige antwoorden zijn niet beschikbaar omdat er al twee genetische ouders van je zijn geregistreerd, “{first}” en “{second}”. Wijzig eerst hoe een van hen met jou verbonden is om er een te kiezen.} includesYou {Sommige antwoorden zijn niet beschikbaar omdat er al twee genetische ouders van “{child}” zijn geregistreerd, jij en “{second}”. Wijzig eerst hoe een van jullie met “{child}” verbonden is om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat er al twee genetische ouders van “{child}” zijn geregistreerd, “{first}” en “{second}”. Wijzig eerst hoe een van hen met “{child}” verbonden is om er een te kiezen.}}',
  'pt-BR':
    '{who, select, childIsYou {Algumas respostas não estão disponíveis porque você já tem dois pais genéticos registrados, “{first}” e “{second}”. Para escolher uma delas, primeiro altere a conexão de um deles com você.} includesYou {Algumas respostas não estão disponíveis porque “{child}” já tem dois pais genéticos registrados, você e “{second}”. Para escolher uma delas, primeiro altere a conexão de um de vocês com “{child}”.} other {Algumas respostas não estão disponíveis porque “{child}” já tem dois pais genéticos registrados, “{first}” e “{second}”. Para escolher uma delas, primeiro altere a conexão de um deles com “{child}”.}}',
  'zh-Hans':
    '{who, select, childIsYou {部分选项不可用，因为已记录了您的两位遗传学父母：“{first}”和“{second}”。如需选择，请先更改其中一位与您之间的连接。} includesYou {部分选项不可用，因为已记录了“{child}”的两位遗传学父母：您和“{second}”。如需选择，请先更改你们其中一位与“{child}”之间的连接。} other {部分选项不可用，因为已记录了“{child}”的两位遗传学父母：“{first}”和“{second}”。如需选择，请先更改其中一位与“{child}”之间的连接。}}',
  'zh-Hant':
    '{who, select, childIsYou {部分選項無法使用，因為已記錄了您的兩位遺傳學父母：「{first}」和「{second}」。如需選擇，請先變更其中一位與您之間的連結。} includesYou {部分選項無法使用，因為已記錄了「{child}」的兩位遺傳學父母：您和「{second}」。如需選擇，請先變更你們其中一位與「{child}」之間的連結。} other {部分選項無法使用，因為已記錄了「{child}」的兩位遺傳學父母：「{first}」和「{second}」。如需選擇，請先變更其中一位與「{child}」之間的連結。}}',
} as const satisfies SuppliedWording;

/** Why two twins whose biological parents and donors differ cannot be recorded as identical. */
const UNAVAILABLE_IDENTICAL_TWIN = {
  'en': '{who, select, personIsYou {Some answers are unavailable because identical twins have the same biological parents and donors, and you and “{twin}” do not. To choose one, first record the same biological parents and donors for both of you.} twinIsYou {Some answers are unavailable because identical twins have the same biological parents and donors, and “{name}” and you do not. To choose one, first record the same biological parents and donors for both of you.} other {Some answers are unavailable because identical twins have the same biological parents and donors, and “{name}” and “{twin}” do not. To choose one, first record the same biological parents and donors for both of them.}}',
  'de': '{who, select, personIsYou {Einige Antworten sind nicht verfügbar, weil eineiige Zwillinge dieselben leiblichen Eltern und Spenderpersonen haben, und bei Ihnen und „{twin}“ ist das nicht so. Um eine davon zu wählen, erfassen Sie zuerst dieselben leiblichen Eltern und Spenderpersonen für Sie beide.} twinIsYou {Einige Antworten sind nicht verfügbar, weil eineiige Zwillinge dieselben leiblichen Eltern und Spenderpersonen haben, und bei „{name}“ und Ihnen ist das nicht so. Um eine davon zu wählen, erfassen Sie zuerst dieselben leiblichen Eltern und Spenderpersonen für Sie beide.} other {Einige Antworten sind nicht verfügbar, weil eineiige Zwillinge dieselben leiblichen Eltern und Spenderpersonen haben, und bei „{name}“ und „{twin}“ ist das nicht so. Um eine davon zu wählen, erfassen Sie zuerst dieselben leiblichen Eltern und Spenderpersonen für beide.}}',
  'es': '{who, select, personIsYou {Algunas respuestas no están disponibles porque los gemelos idénticos tienen los mismos progenitores biológicos y donantes, y tú y «{twin}» no los tienen. Para elegir una, primero registra los mismos progenitores biológicos y donantes para ambos.} twinIsYou {Algunas respuestas no están disponibles porque los gemelos idénticos tienen los mismos progenitores biológicos y donantes, y «{name}» y tú no los tienen. Para elegir una, primero registra los mismos progenitores biológicos y donantes para ambos.} other {Algunas respuestas no están disponibles porque los gemelos idénticos tienen los mismos progenitores biológicos y donantes, y «{name}» y «{twin}» no los tienen. Para elegir una, primero registra los mismos progenitores biológicos y donantes para ambos.}}',
  'fr': '{who, select, personIsYou {Certaines réponses ne sont pas disponibles, car de vrais jumeaux ont les mêmes parents biologiques et donneurs, ce qui n’est pas le cas de « {twin} » et vous. Pour en choisir une, enregistrez d’abord les mêmes parents biologiques et donneurs pour vous deux.} twinIsYou {Certaines réponses ne sont pas disponibles, car de vrais jumeaux ont les mêmes parents biologiques et donneurs, ce qui n’est pas le cas de « {name} » et vous. Pour en choisir une, enregistrez d’abord les mêmes parents biologiques et donneurs pour vous deux.} other {Certaines réponses ne sont pas disponibles, car de vrais jumeaux ont les mêmes parents biologiques et donneurs, ce qui n’est pas le cas de « {name} » et « {twin} ». Pour en choisir une, enregistrez d’abord les mêmes parents biologiques et donneurs pour les deux.}}',
  'it': '{who, select, personIsYou {Alcune risposte non sono disponibili perché i gemelli identici hanno gli stessi genitori biologici e donatori, e tu e «{twin}» non li avete. Per sceglierne una, prima registra gli stessi genitori biologici e donatori per entrambi.} twinIsYou {Alcune risposte non sono disponibili perché i gemelli identici hanno gli stessi genitori biologici e donatori, e «{name}» e tu non li avete. Per sceglierne una, prima registra gli stessi genitori biologici e donatori per entrambi.} other {Alcune risposte non sono disponibili perché i gemelli identici hanno gli stessi genitori biologici e donatori, e «{name}» e «{twin}» non li hanno. Per sceglierne una, prima registra gli stessi genitori biologici e donatori per entrambi.}}',
  'nl': '{who, select, personIsYou {Sommige antwoorden zijn niet beschikbaar omdat een eeneiige tweeling dezelfde biologische ouders en donoren heeft, en dat bij jou en “{twin}” niet zo is. Leg eerst dezelfde biologische ouders en donoren vast voor jullie allebei om er een te kiezen.} twinIsYou {Sommige antwoorden zijn niet beschikbaar omdat een eeneiige tweeling dezelfde biologische ouders en donoren heeft, en dat bij “{name}” en jou niet zo is. Leg eerst dezelfde biologische ouders en donoren vast voor jullie allebei om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat een eeneiige tweeling dezelfde biologische ouders en donoren heeft, en dat bij “{name}” en “{twin}” niet zo is. Leg eerst dezelfde biologische ouders en donoren vast voor hen allebei om er een te kiezen.}}',
  'pt-BR':
    '{who, select, personIsYou {Algumas respostas não estão disponíveis porque gêmeos idênticos têm os mesmos pais biológicos e doadores, e você e “{twin}” não têm. Para escolher uma delas, primeiro registre os mesmos pais biológicos e doadores para os dois.} twinIsYou {Algumas respostas não estão disponíveis porque gêmeos idênticos têm os mesmos pais biológicos e doadores, e “{name}” e você não têm. Para escolher uma delas, primeiro registre os mesmos pais biológicos e doadores para os dois.} other {Algumas respostas não estão disponíveis porque gêmeos idênticos têm os mesmos pais biológicos e doadores, e “{name}” e “{twin}” não têm. Para escolher uma delas, primeiro registre os mesmos pais biológicos e doadores para os dois.}}',
  'zh-Hans':
    '{who, select, personIsYou {部分选项不可用，因为同卵双胞胎的亲生父母和捐赠者相同，而您和“{twin}”并非如此。如需选择，请先为你们两人记录相同的亲生父母和捐赠者。} twinIsYou {部分选项不可用，因为同卵双胞胎的亲生父母和捐赠者相同，而“{name}”和您并非如此。如需选择，请先为你们两人记录相同的亲生父母和捐赠者。} other {部分选项不可用，因为同卵双胞胎的亲生父母和捐赠者相同，而“{name}”和“{twin}”并非如此。如需选择，请先为他们两人记录相同的亲生父母和捐赠者。}}',
  'zh-Hant':
    '{who, select, personIsYou {部分選項無法使用，因為同卵雙胞胎的親生父母和捐贈者相同，而您和「{twin}」並非如此。如需選擇，請先為你們兩人記錄相同的親生父母和捐贈者。} twinIsYou {部分選項無法使用，因為同卵雙胞胎的親生父母和捐贈者相同，而「{name}」和您並非如此。如需選擇，請先為你們兩人記錄相同的親生父母和捐贈者。} other {部分選項無法使用，因為同卵雙胞胎的親生父母和捐贈者相同，而「{name}」和「{twin}」並非如此。如需選擇，請先為他們兩人記錄相同的親生父母和捐贈者。}}',
} as const satisfies SuppliedWording;

/** Why a new sibling who would not have all the biological parents and donors of the person they are added to cannot be their identical twin. */
const UNAVAILABLE_IDENTICAL_TWIN_NEW = {
  'en': '{isYou, select, true {Some answers are unavailable because identical twins have the same biological parents and donors, and this sibling would not have all of yours. To choose one, choose all of your biological parents and donors above.} other {Some answers are unavailable because identical twins have the same biological parents and donors, and this sibling would not have all of “{name}”’s. To choose one, choose all of their biological parents and donors above.}}',
  'de': '{isYou, select, true {Einige Antworten sind nicht verfügbar, weil eineiige Zwillinge dieselben leiblichen Eltern und Spenderpersonen haben und dieses Geschwister nicht alle Ihre hätte. Um eine davon zu wählen, wählen Sie oben alle Ihre leiblichen Eltern und Spenderpersonen.} other {Einige Antworten sind nicht verfügbar, weil eineiige Zwillinge dieselben leiblichen Eltern und Spenderpersonen haben und dieses Geschwister nicht alle von „{name}“ hätte. Um eine davon zu wählen, wählen Sie oben alle leiblichen Eltern und Spenderpersonen dieser Person.}}',
  'es': '{isYou, select, true {Algunas respuestas no están disponibles porque los gemelos idénticos tienen los mismos progenitores biológicos y donantes, y este hermano o hermana no tendría todos los tuyos. Para elegir una, elige arriba a todos tus progenitores biológicos y donantes.} other {Algunas respuestas no están disponibles porque los gemelos idénticos tienen los mismos progenitores biológicos y donantes, y este hermano o hermana no tendría todos los de «{name}». Para elegir una, elige arriba a todos sus progenitores biológicos y donantes.}}',
  'fr': '{isYou, select, true {Certaines réponses ne sont pas disponibles, car de vrais jumeaux ont les mêmes parents biologiques et donneurs, et ce frère ou cette sœur n’aurait pas tous les vôtres. Pour en choisir une, choisissez ci-dessus tous vos parents biologiques et donneurs.} other {Certaines réponses ne sont pas disponibles, car de vrais jumeaux ont les mêmes parents biologiques et donneurs, et ce frère ou cette sœur n’aurait pas tous ceux de « {name} ». Pour en choisir une, choisissez ci-dessus tous ses parents biologiques et donneurs.}}',
  'it': '{isYou, select, true {Alcune risposte non sono disponibili perché i gemelli identici hanno gli stessi genitori biologici e donatori, e questo fratello o sorella non avrebbe tutti i tuoi. Per sceglierne una, scegli sopra tutti i tuoi genitori biologici e donatori.} other {Alcune risposte non sono disponibili perché i gemelli identici hanno gli stessi genitori biologici e donatori, e questo fratello o sorella non avrebbe tutti quelli di «{name}». Per sceglierne una, scegli sopra tutti i suoi genitori biologici e donatori.}}',
  'nl': '{isYou, select, true {Sommige antwoorden zijn niet beschikbaar omdat een eeneiige tweeling dezelfde biologische ouders en donoren heeft, en deze broer of zus niet al die van jou zou hebben. Kies hierboven al je biologische ouders en donoren om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat een eeneiige tweeling dezelfde biologische ouders en donoren heeft, en deze broer of zus niet al die van “{name}” zou hebben. Kies hierboven al hun biologische ouders en donoren om er een te kiezen.}}',
  'pt-BR':
    '{isYou, select, true {Algumas respostas não estão disponíveis porque gêmeos idênticos têm os mesmos pais biológicos e doadores, e esse irmão ou irmã não teria todos os seus. Para escolher uma delas, escolha acima todos os seus pais biológicos e doadores.} other {Algumas respostas não estão disponíveis porque gêmeos idênticos têm os mesmos pais biológicos e doadores, e esse irmão ou irmã não teria todos os de “{name}”. Para escolher uma delas, escolha acima todos os pais biológicos e doadores dessa pessoa.}}',
  'zh-Hans':
    '{isYou, select, true {部分选项不可用，因为同卵双胞胎的亲生父母和捐赠者相同，而这位兄弟姐妹不会拥有您的全部亲生父母和捐赠者。如需选择，请在上方选择您的全部亲生父母和捐赠者。} other {部分选项不可用，因为同卵双胞胎的亲生父母和捐赠者相同，而这位兄弟姐妹不会拥有“{name}”的全部亲生父母和捐赠者。如需选择，请在上方选择其全部亲生父母和捐赠者。}}',
  'zh-Hant':
    '{isYou, select, true {部分選項無法使用，因為同卵雙胞胎的親生父母和捐贈者相同，而這位兄弟姊妹不會擁有您的全部親生父母和捐贈者。如需選擇，請在上方選擇您的全部親生父母和捐贈者。} other {部分選項無法使用，因為同卵雙胞胎的親生父母和捐贈者相同，而這位兄弟姊妹不會擁有「{name}」的全部親生父母和捐贈者。如需選擇，請在上方選擇其全部親生父母和捐贈者。}}',
} as const satisfies SuppliedWording;

/** Why someone cannot be a genetic parent of a child whose genetic parent recorded already has the same sex at birth. */
const UNAVAILABLE_SAME_SEX_GENETIC_PARENT = {
  'en': '{who, select, coParentIsYou {Some answers are unavailable because you are recorded as “{sex}” at birth and are a genetic parent of “{child}”, who cannot have two genetic parents of the same sex at birth. To choose one, first change your sex at birth or how you are connected to “{child}”.} childIsYou {Some answers are unavailable because “{coParent}”, your genetic parent, is recorded as “{sex}” at birth, and you cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of “{coParent}” or how they are connected to you.} other {Some answers are unavailable because “{coParent}”, a genetic parent of “{child}”, is recorded as “{sex}” at birth, and “{child}” cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of “{coParent}” or how they are connected to “{child}”.}}',
  'de': '{who, select, coParentIsYou {Einige Antworten sind nicht verfügbar, weil Sie als „{sex}“ bei der Geburt erfasst sind und ein genetischer Elternteil von „{child}“ sind, der nicht zwei genetische Eltern mit demselben Geschlecht bei der Geburt haben kann. Um eine davon zu wählen, ändern Sie zuerst Ihr Geschlecht bei der Geburt oder Ihre Verbindung mit „{child}“.} childIsYou {Einige Antworten sind nicht verfügbar, weil „{coParent}“, Ihr genetischer Elternteil, als „{sex}“ bei der Geburt erfasst ist und Sie nicht zwei genetische Eltern mit demselben Geschlecht bei der Geburt haben können. Um eine davon zu wählen, ändern Sie zuerst das Geschlecht bei der Geburt von „{coParent}“ oder dessen Verbindung mit Ihnen.} other {Einige Antworten sind nicht verfügbar, weil „{coParent}“, ein genetischer Elternteil von „{child}“, als „{sex}“ bei der Geburt erfasst ist und „{child}“ nicht zwei genetische Eltern mit demselben Geschlecht bei der Geburt haben kann. Um eine davon zu wählen, ändern Sie zuerst das Geschlecht bei der Geburt von „{coParent}“ oder dessen Verbindung mit „{child}“.}}',
  'es': '{who, select, coParentIsYou {Algunas respuestas no están disponibles porque constas como «{sex}» al nacer y eres progenitor/a genético/a de «{child}», que no puede tener dos progenitores genéticos del mismo sexo al nacer. Para elegir una, primero cambia tu sexo al nacer o tu conexión con «{child}».} childIsYou {Algunas respuestas no están disponibles porque «{coParent}», tu progenitor/a genético/a, consta como «{sex}» al nacer, y no puedes tener dos progenitores genéticos del mismo sexo al nacer. Para elegir una, primero cambia el sexo al nacer de «{coParent}» o su conexión contigo.} other {Algunas respuestas no están disponibles porque «{coParent}», progenitor/a genético/a de «{child}», consta como «{sex}» al nacer, y «{child}» no puede tener dos progenitores genéticos del mismo sexo al nacer. Para elegir una, primero cambia el sexo al nacer de «{coParent}» o su conexión con «{child}».}}',
  'fr': '{who, select, coParentIsYou {Certaines réponses ne sont pas disponibles, car vous êtes enregistré comme « {sex} » à la naissance et vous êtes un parent génétique de « {child} », qui ne peut pas avoir deux parents génétiques du même sexe à la naissance. Pour en choisir une, modifiez d’abord votre sexe à la naissance ou votre lien avec « {child} ».} childIsYou {Certaines réponses ne sont pas disponibles, car « {coParent} », votre parent génétique, est enregistré comme « {sex} » à la naissance, et vous ne pouvez pas avoir deux parents génétiques du même sexe à la naissance. Pour en choisir une, modifiez d’abord le sexe à la naissance de « {coParent} » ou son lien avec vous.} other {Certaines réponses ne sont pas disponibles, car « {coParent} », un parent génétique de « {child} », est enregistré comme « {sex} » à la naissance, et « {child} » ne peut pas avoir deux parents génétiques du même sexe à la naissance. Pour en choisir une, modifiez d’abord le sexe à la naissance de « {coParent} » ou son lien avec « {child} ».}}',
  'it': '{who, select, coParentIsYou {Alcune risposte non sono disponibili perché risulti registrato come «{sex}» alla nascita e sei un genitore genetico di «{child}», che non può avere due genitori genetici dello stesso sesso alla nascita. Per sceglierne una, prima modifica il tuo sesso alla nascita o il tuo legame con «{child}».} childIsYou {Alcune risposte non sono disponibili perché «{coParent}», tuo genitore genetico, risulta registrato come «{sex}» alla nascita, e non puoi avere due genitori genetici dello stesso sesso alla nascita. Per sceglierne una, prima modifica il sesso alla nascita di «{coParent}» o il suo legame con te.} other {Alcune risposte non sono disponibili perché «{coParent}», un genitore genetico di «{child}», risulta registrato come «{sex}» alla nascita, e «{child}» non può avere due genitori genetici dello stesso sesso alla nascita. Per sceglierne una, prima modifica il sesso alla nascita di «{coParent}» o il suo legame con «{child}».}}',
  'nl': '{who, select, coParentIsYou {Sommige antwoorden zijn niet beschikbaar omdat je bij de geboorte als “{sex}” bent geregistreerd en een genetische ouder bent van “{child}”, die geen twee genetische ouders van hetzelfde geslacht bij de geboorte kan hebben. Wijzig eerst je geslacht bij de geboorte of hoe je met “{child}” verbonden bent om er een te kiezen.} childIsYou {Sommige antwoorden zijn niet beschikbaar omdat “{coParent}”, je genetische ouder, bij de geboorte als “{sex}” is geregistreerd, en je geen twee genetische ouders van hetzelfde geslacht bij de geboorte kunt hebben. Wijzig eerst het geslacht bij de geboorte van “{coParent}” of hoe die met jou verbonden is om er een te kiezen.} other {Sommige antwoorden zijn niet beschikbaar omdat “{coParent}”, een genetische ouder van “{child}”, bij de geboorte als “{sex}” is geregistreerd, en “{child}” geen twee genetische ouders van hetzelfde geslacht bij de geboorte kan hebben. Wijzig eerst het geslacht bij de geboorte van “{coParent}” of hoe die met “{child}” verbonden is om er een te kiezen.}}',
  'pt-BR':
    '{who, select, coParentIsYou {Algumas respostas não estão disponíveis porque você está registrado(a) como “{sex}” ao nascer e é pai/mãe genético(a) de “{child}”, que não pode ter dois pais genéticos do mesmo sexo ao nascer. Para escolher uma delas, primeiro altere seu sexo ao nascer ou sua conexão com “{child}”.} childIsYou {Algumas respostas não estão disponíveis porque “{coParent}”, seu pai/mãe genético(a), está registrado(a) como “{sex}” ao nascer, e você não pode ter dois pais genéticos do mesmo sexo ao nascer. Para escolher uma delas, primeiro altere o sexo ao nascer de “{coParent}” ou a conexão dessa pessoa com você.} other {Algumas respostas não estão disponíveis porque “{coParent}”, pai/mãe genético(a) de “{child}”, está registrado(a) como “{sex}” ao nascer, e “{child}” não pode ter dois pais genéticos do mesmo sexo ao nascer. Para escolher uma delas, primeiro altere o sexo ao nascer de “{coParent}” ou a conexão dessa pessoa com “{child}”.}}',
  'zh-Hans':
    '{who, select, coParentIsYou {部分选项不可用，因为您的出生时性别记录为“{sex}”，并且您是“{child}”的遗传学父母之一，而“{child}”不能有两位出生时性别相同的遗传学父母。如需选择，请先更改您的出生时性别，或您与“{child}”之间的连接。} childIsYou {部分选项不可用，因为您的遗传学父母“{coParent}”的出生时性别记录为“{sex}”，而您不能有两位出生时性别相同的遗传学父母。如需选择，请先更改“{coParent}”的出生时性别，或其与您之间的连接。} other {部分选项不可用，因为“{child}”的遗传学父母“{coParent}”的出生时性别记录为“{sex}”，而“{child}”不能有两位出生时性别相同的遗传学父母。如需选择，请先更改“{coParent}”的出生时性别，或其与“{child}”之间的连接。}}',
  'zh-Hant':
    '{who, select, coParentIsYou {部分選項無法使用，因為您的出生時性別記錄為「{sex}」，而且您是「{child}」的遺傳學父母之一，而「{child}」不能有兩位出生時性別相同的遺傳學父母。如需選擇，請先變更您的出生時性別，或您與「{child}」之間的連結。} childIsYou {部分選項無法使用，因為您的遺傳學父母「{coParent}」的出生時性別記錄為「{sex}」，而您不能有兩位出生時性別相同的遺傳學父母。如需選擇，請先變更「{coParent}」的出生時性別，或其與您之間的連結。} other {部分選項無法使用，因為「{child}」的遺傳學父母「{coParent}」的出生時性別記錄為「{sex}」，而「{child}」不能有兩位出生時性別相同的遺傳學父母。如需選擇，請先變更「{coParent}」的出生時性別，或其與「{child}」之間的連結。}}',
} as const satisfies SuppliedWording;

/** The option that two twins are fraternal twins. */
const ZYGOSITY_FRATERNAL = {
  'en': 'No, fraternal (non-identical)',
  'de': 'Nein, zweieiig',
  'es': 'No, mellizos (no idénticos)',
  'fr': 'Non, faux jumeaux (non identiques)',
  'it': 'No, non identici (dizigoti)',
  'nl': 'Nee, twee-eiig',
  'pt-BR': 'Não, fraternos (não idênticos)',
  'zh-Hans': '否，异卵',
  'zh-Hant': '否，異卵',
} as const satisfies SuppliedWording;

/** The option that two twins are identical twins. */
const ZYGOSITY_IDENTICAL = {
  'en': 'Yes, identical',
  'de': 'Ja, eineiig',
  'es': 'Sí, idénticos',
  'fr': 'Oui, identiques',
  'it': 'Sì, identici',
  'nl': 'Ja, eeneiig',
  'pt-BR': 'Sim, idênticos',
  'zh-Hans': '是，同卵',
  'zh-Hant': '是，同卵',
} as const satisfies SuppliedWording;

/** The option that the participant does not know whether two twins are identical. */
const ZYGOSITY_UNKNOWN = {
  'en': 'I don’t know',
  'de': 'Ich weiß es nicht',
  'es': 'No lo sé',
  'fr': 'Je ne sais pas',
  'it': 'Non lo so',
  'nl': 'Ik weet het niet',
  'pt-BR': 'Não sei',
  'zh-Hans': '我不知道',
  'zh-Hant': '我不知道',
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
  { path: ['wording', 'changeWouldCutOff'], message: CHANGE_WOULD_CUT_OFF },
  { path: ['wording', 'childKindAdoptive'], message: CHILD_KIND_ADOPTIVE },
  { path: ['wording', 'childKindBiological'], message: CHILD_KIND_BIOLOGICAL },
  { path: ['wording', 'childKindDonor'], message: CHILD_KIND_DONOR },
  { path: ['wording', 'childKindLabel'], message: CHILD_KIND_LABEL },
  { path: ['wording', 'childKindSocial'], message: CHILD_KIND_SOCIAL },
  { path: ['wording', 'childKindSurrogate'], message: CHILD_KIND_SURROGATE },
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
  { path: ['wording', 'panelTitle'], message: PANEL_TITLE },
  { path: ['wording', 'parentCarriedLabel'], message: PARENT_CARRIED_LABEL },
  { path: ['wording', 'parentKindCarrier'], message: PARENT_KIND_CARRIER },
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
  { path: ['wording', 'sharedDonorsLabel'], message: SHARED_DONORS_LABEL },
  {
    path: ['wording', 'sharedParentCountBoth'],
    message: SHARED_PARENT_COUNT_BOTH,
  },
  {
    path: ['wording', 'sharedParentCountLabel'],
    message: SHARED_PARENT_COUNT_LABEL,
  },
  { path: ['wording', 'sharedParentEggOnly'], message: SHARED_PARENT_EGG_ONLY },
  {
    path: ['wording', 'siblingBiologicalParentLabel'],
    message: SIBLING_BIOLOGICAL_PARENT_LABEL,
  },
  { path: ['wording', 'siblingKindLabel'], message: SIBLING_KIND_LABEL },
  {
    path: ['wording', 'siblingTwinFraternal'],
    message: SIBLING_TWIN_FRATERNAL,
  },
  { path: ['wording', 'siblingTwinHint'], message: SIBLING_TWIN_HINT },
  {
    path: ['wording', 'siblingTwinIdentical'],
    message: SIBLING_TWIN_IDENTICAL,
  },
  { path: ['wording', 'siblingTwinLabel'], message: SIBLING_TWIN_LABEL },
  { path: ['wording', 'siblingTwinNo'], message: SIBLING_TWIN_NO },
  { path: ['wording', 'siblingTwinUnknown'], message: SIBLING_TWIN_UNKNOWN },
  { path: ['wording', 'stillTogetherLabel'], message: STILL_TOGETHER_LABEL },
  { path: ['wording', 'twinsHint'], message: TWINS_HINT },
  { path: ['wording', 'twinsLabel'], message: TWINS_LABEL },
  { path: ['wording', 'twinZygosityLabel'], message: TWIN_ZYGOSITY_LABEL },
  {
    path: ['wording', 'unavailableAlreadyConnected'],
    message: UNAVAILABLE_ALREADY_CONNECTED,
  },
  { path: ['wording', 'unavailableAncestor'], message: UNAVAILABLE_ANCESTOR },
  {
    path: ['wording', 'unavailableBothSameSex'],
    message: UNAVAILABLE_BOTH_SAME_SEX,
  },
  {
    path: ['wording', 'unavailableCannotCarry'],
    message: UNAVAILABLE_CANNOT_CARRY,
  },
  { path: ['wording', 'unavailableCarried'], message: UNAVAILABLE_CARRIED },
  {
    path: ['wording', 'unavailableCarrierChoice'],
    message: UNAVAILABLE_CARRIER_CHOICE,
  },
  {
    path: ['wording', 'unavailableCarrierRecorded'],
    message: UNAVAILABLE_CARRIER_RECORDED,
  },
  {
    path: ['wording', 'unavailableGeneticParentsFull'],
    message: UNAVAILABLE_GENETIC_PARENTS_FULL,
  },
  {
    path: ['wording', 'unavailableIdenticalTwin'],
    message: UNAVAILABLE_IDENTICAL_TWIN,
  },
  {
    path: ['wording', 'unavailableIdenticalTwinNew'],
    message: UNAVAILABLE_IDENTICAL_TWIN_NEW,
  },
  {
    path: ['wording', 'unavailableSameSexGeneticParent'],
    message: UNAVAILABLE_SAME_SEX_GENETIC_PARENT,
  },
  { path: ['wording', 'zygosityFraternal'], message: ZYGOSITY_FRATERNAL },
  { path: ['wording', 'zygosityIdentical'], message: ZYGOSITY_IDENTICAL },
  { path: ['wording', 'zygosityUnknown'], message: ZYGOSITY_UNKNOWN },
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
): FamilyPedigreeWording =>
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
  ) as FamilyPedigreeWording;
