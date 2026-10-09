import type { LocaleTag } from '../../localization/localeTag.ts';

// The Family Pedigree's wording as Network Canvas supplies it, one ICU message
// per language it ships in: the interview's own catalog text from before the
// wording became stage settings, copied unchanged, so every translation keeps
// the arguments it was written with.

type Wording = Readonly<Record<LocaleTag, string>>;

/** The name question in the side panel. */
export const NAME_PROMPT = {
  'en': 'Name (optional)',
  'de': 'Name (optional)',
  'es': 'Nombre (opcional)',
  'fr': 'Nom (facultatif)',
  'it': 'Nome (facoltativo)',
  'nl': 'Naam (optioneel)',
  'pt-BR': 'Nome (opcional)',
  'zh-Hans': '姓名（可选）',
  'zh-Hant': '姓名（選填）',
} as const satisfies Wording;

/** The hint beneath it. */
export const NAME_HINT = {
  'en': 'A first name or nickname is fine. If you don’t know it, leave this blank and they will be shown by how they are related to you.',
  'de': 'Ein Vorname oder Spitzname genügt. Wenn Sie ihn nicht kennen, lassen Sie das Feld leer – die Person wird dann so angezeigt, wie sie mit Ihnen verwandt ist.',
  'es': 'Basta con un nombre o un apodo. Si no lo sabes, deja este campo vacío y se mostrará según su parentesco contigo.',
  'fr': 'Un prénom ou un surnom suffit. Si vous ne le connaissez pas, laissez ce champ vide : la personne sera désignée par son lien de parenté avec vous.',
  'it': 'Basta un nome o un soprannome. Se non lo conosci, lascia vuoto il campo: la persona verrà indicata in base alla sua parentela con te.',
  'nl': 'Een voornaam of bijnaam is prima. Weet je die niet, laat dit dan leeg; de persoon wordt dan getoond met hoe die aan jou verwant is.',
  'pt-BR':
    'Um primeiro nome ou apelido já basta. Se você não souber, deixe em branco, e a pessoa será mostrada pelo parentesco com você.',
  'zh-Hans':
    '填写名字或昵称即可。如果不知道，请留空，此人将按与您的亲属关系显示。',
  'zh-Hant':
    '填寫名字或暱稱即可。如果不知道，請留空，此人會依與您的親屬關係顯示。',
} as const satisfies Wording;

/** The tracker entry for a person missing biological parents. */
export const PARENTS_ITEM = {
  'en': '{isYou, select, true {Add your biological parents} other {Add biological parents for “{name}”}}',
  'de': '{isYou, select, true {Fügen Sie Ihre leiblichen Eltern hinzu} other {Fügen Sie die leiblichen Eltern von „{name}“ hinzu}}',
  'es': '{isYou, select, true {Añade a tus progenitores biológicos} other {Añade a los progenitores biológicos de «{name}»}}',
  'fr': '{isYou, select, true {Ajoutez vos parents biologiques} other {Ajoutez les parents biologiques de « {name} »}}',
  'it': '{isYou, select, true {Aggiungi i tuoi genitori biologici} other {Aggiungi i genitori biologici di «{name}»}}',
  'nl': '{isYou, select, true {Voeg je biologische ouders toe} other {Voeg biologische ouders van “{name}” toe}}',
  'pt-BR':
    '{isYou, select, true {Adicione seus pais biológicos} other {Adicione os pais biológicos de “{name}”}}',
  'zh-Hans':
    '{isYou, select, true {添加您的亲生父母} other {添加“{name}”的亲生父母}}',
  'zh-Hant':
    '{isYou, select, true {新增您的親生父母} other {新增「{name}」的親生父母}}',
} as const satisfies Wording;

/** The tracker entry for a person whose biological siblings are not yet recorded. */
export const SIBLINGS_ITEM = {
  'en': '{isYou, select, true {Add your biological brothers and sisters, or say you have none} other {Add biological brothers and sisters for “{name}”, or say they have none}}',
  'de': '{isYou, select, true {Fügen Sie Ihre leiblichen Geschwister hinzu oder geben Sie an, dass Sie keine haben} other {Fügen Sie leibliche Geschwister von „{name}“ hinzu oder geben Sie an, dass es keine gibt}}',
  'es': '{isYou, select, true {Añade a tus hermanos y hermanas biológicos o indica que no tienes} other {Añade a los hermanos y hermanas biológicos de «{name}» o indica que no tiene}}',
  'fr': '{isYou, select, true {Ajoutez vos frères et sœurs biologiques, ou indiquez que vous n’en avez pas} other {Ajoutez les frères et sœurs biologiques de « {name} », ou indiquez qu’il n’y en a pas}}',
  'it': '{isYou, select, true {Aggiungi i tuoi fratelli e sorelle biologici, oppure indica che non ne hai} other {Aggiungi i fratelli e sorelle biologici di «{name}», oppure indica che non ne ha}}',
  'nl': '{isYou, select, true {Voeg je biologische broers en zussen toe, of geef aan dat je die niet hebt} other {Voeg biologische broers en zussen van “{name}” toe, of geef aan dat die er niet zijn}}',
  'pt-BR':
    '{isYou, select, true {Adicione seus irmãos e irmãs biológicos ou informe que não tem} other {Adicione os irmãos e irmãs biológicos de “{name}” ou informe que não tem}}',
  'zh-Hans':
    '{isYou, select, true {添加您的亲生兄弟姐妹，或说明您没有} other {添加“{name}”的亲生兄弟姐妹，或说明其没有}}',
  'zh-Hant':
    '{isYou, select, true {新增您的親生兄弟姊妹，或說明您沒有} other {新增「{name}」的親生兄弟姊妹，或說明其沒有}}',
} as const satisfies Wording;

/** The button under it recording that they have none. */
export const SIBLINGS_NONE = {
  'en': '{isYou, select, true {I have no biological siblings} other {“{name}” has no biological siblings}}',
  'de': '{isYou, select, true {Ich habe keine leiblichen Geschwister} other {„{name}“ hat keine leiblichen Geschwister}}',
  'es': '{isYou, select, true {No tengo hermanos biológicos} other {«{name}» no tiene hermanos biológicos}}',
  'fr': '{isYou, select, true {Je n’ai ni frère ni sœur biologique} other {« {name} » n’a ni frère ni sœur biologique}}',
  'it': '{isYou, select, true {Non ho fratelli o sorelle biologici} other {«{name}» non ha fratelli o sorelle biologici}}',
  'nl': '{isYou, select, true {Ik heb geen biologische broers of zussen} other {“{name}” heeft geen biologische broers of zussen}}',
  'pt-BR':
    '{isYou, select, true {Não tenho irmãos biológicos} other {“{name}” não tem irmãos biológicos}}',
  'zh-Hans':
    '{isYou, select, true {我没有亲生兄弟姐妹} other {“{name}”没有亲生兄弟姐妹}}',
  'zh-Hant':
    '{isYou, select, true {我沒有親生兄弟姊妹} other {「{name}」沒有親生兄弟姊妹}}',
} as const satisfies Wording;

/** The question asking it in the side panel. */
export const SIBLINGS_QUESTION = {
  'en': '{isYou, select, true {Do you have any biological brothers or sisters, including half-brothers and half-sisters?} other {Does {name} have any biological brothers or sisters, including half-brothers and half-sisters?}}',
  'de': '{isYou, select, true {Haben Sie leibliche Geschwister, auch Halbgeschwister?} other {Hat {name} leibliche Geschwister, auch Halbgeschwister?}}',
  'es': '{isYou, select, true {¿Tienes hermanos o hermanas biológicos, incluidos medios hermanos y medias hermanas?} other {¿{name} tiene hermanos o hermanas biológicos, incluidos medios hermanos y medias hermanas?}}',
  'fr': '{isYou, select, true {Avez-vous des frères ou sœurs biologiques, y compris des demi-frères et demi-sœurs ?} other {Est-ce que {name} a des frères ou sœurs biologiques, y compris des demi-frères et demi-sœurs ?}}',
  'it': '{isYou, select, true {Hai fratelli o sorelle biologici, compresi fratellastri e sorellastre?} other {{name} ha fratelli o sorelle biologici, compresi fratellastri e sorellastre?}}',
  'nl': '{isYou, select, true {Heb je biologische broers of zussen, ook halfbroers en halfzussen?} other {Heeft {name} biologische broers of zussen, ook halfbroers en halfzussen?}}',
  'pt-BR':
    '{isYou, select, true {Você tem irmãos ou irmãs biológicos, incluindo meios-irmãos e meias-irmãs?} other {{name} tem irmãos ou irmãs biológicos, incluindo meios-irmãos e meias-irmãs?}}',
  'zh-Hans':
    '{isYou, select, true {您有亲生的兄弟姐妹吗？包括同父异母或同母异父的兄弟姐妹。} other {{name}有亲生的兄弟姐妹吗？包括同父异母或同母异父的兄弟姐妹。}}',
  'zh-Hant':
    '{isYou, select, true {您有親生的兄弟姊妹嗎？包括同父異母或同母異父的兄弟姊妹。} other {{name}有親生的兄弟姊妹嗎？包括同父異母或同母異父的兄弟姊妹。}}',
} as const satisfies Wording;

/** The tracker entry for a person whose biological children are not yet recorded. */
export const CHILDREN_ITEM = {
  'en': '{isYou, select, true {Add your biological children, or say you have none} other {Add biological children for “{name}”, or say they have none}}',
  'de': '{isYou, select, true {Fügen Sie Ihre leiblichen Kinder hinzu oder geben Sie an, dass Sie keine haben} other {Fügen Sie leibliche Kinder von „{name}“ hinzu oder geben Sie an, dass es keine gibt}}',
  'es': '{isYou, select, true {Añade a tus hijos biológicos o indica que no tienes} other {Añade a los hijos biológicos de «{name}» o indica que no tiene}}',
  'fr': '{isYou, select, true {Ajoutez vos enfants biologiques, ou indiquez que vous n’en avez pas} other {Ajoutez les enfants biologiques de « {name} », ou indiquez qu’il n’y en a pas}}',
  'it': '{isYou, select, true {Aggiungi i tuoi figli biologici, oppure indica che non ne hai} other {Aggiungi i figli biologici di «{name}», oppure indica che non ne ha}}',
  'nl': '{isYou, select, true {Voeg je biologische kinderen toe, of geef aan dat je die niet hebt} other {Voeg biologische kinderen van “{name}” toe, of geef aan dat die er niet zijn}}',
  'pt-BR':
    '{isYou, select, true {Adicione seus filhos biológicos ou informe que não tem} other {Adicione os filhos biológicos de “{name}” ou informe que não tem}}',
  'zh-Hans':
    '{isYou, select, true {添加您的亲生子女，或说明您没有} other {添加“{name}”的亲生子女，或说明其没有}}',
  'zh-Hant':
    '{isYou, select, true {新增您的親生子女，或說明您沒有} other {新增「{name}」的親生子女，或說明其沒有}}',
} as const satisfies Wording;

/** The button under it recording that they have none. */
export const CHILDREN_NONE = {
  'en': '{isYou, select, true {I have no biological children} other {“{name}” has no biological children}}',
  'de': '{isYou, select, true {Ich habe keine leiblichen Kinder} other {„{name}“ hat keine leiblichen Kinder}}',
  'es': '{isYou, select, true {No tengo hijos biológicos} other {«{name}» no tiene hijos biológicos}}',
  'fr': '{isYou, select, true {Je n’ai pas d’enfant biologique} other {« {name} » n’a pas d’enfant biologique}}',
  'it': '{isYou, select, true {Non ho figli biologici} other {«{name}» non ha figli biologici}}',
  'nl': '{isYou, select, true {Ik heb geen biologische kinderen} other {“{name}” heeft geen biologische kinderen}}',
  'pt-BR':
    '{isYou, select, true {Não tenho filhos biológicos} other {“{name}” não tem filhos biológicos}}',
  'zh-Hans':
    '{isYou, select, true {我没有亲生子女} other {“{name}”没有亲生子女}}',
  'zh-Hant':
    '{isYou, select, true {我沒有親生子女} other {「{name}」沒有親生子女}}',
} as const satisfies Wording;

/** The question asking it in the side panel. */
export const CHILDREN_QUESTION = {
  'en': '{isYou, select, true {Do you have any biological children?} other {Does {name} have any biological children?}}',
  'de': '{isYou, select, true {Haben Sie leibliche Kinder?} other {Hat {name} leibliche Kinder?}}',
  'es': '{isYou, select, true {¿Tienes hijos biológicos?} other {¿{name} tiene hijos biológicos?}}',
  'fr': '{isYou, select, true {Avez-vous des enfants biologiques ?} other {Est-ce que {name} a des enfants biologiques ?}}',
  'it': '{isYou, select, true {Hai figli biologici?} other {{name} ha figli biologici?}}',
  'nl': '{isYou, select, true {Heb je biologische kinderen?} other {Heeft {name} biologische kinderen?}}',
  'pt-BR':
    '{isYou, select, true {Você tem filhos biológicos?} other {{name} tem filhos biológicos?}}',
  'zh-Hans':
    '{isYou, select, true {您有亲生子女吗？} other {{name}有亲生子女吗？}}',
  'zh-Hant':
    '{isYou, select, true {您有親生子女嗎？} other {{name}有親生子女嗎？}}',
} as const satisfies Wording;

/** The tracker entry for a person missing a required detail. */
export const DETAILS_ITEM = {
  'en': '{isYou, select, true {Some details are missing about you} other {Some details are missing for “{name}”}}',
  'de': '{isYou, select, true {Es fehlen einige Angaben zu Ihnen} other {Es fehlen einige Angaben zu „{name}“}}',
  'es': '{isYou, select, true {Faltan algunos datos sobre ti} other {Faltan algunos datos sobre «{name}»}}',
  'fr': '{isYou, select, true {Il manque des informations vous concernant} other {Il manque des informations sur « {name} »}}',
  'it': '{isYou, select, true {Mancano alcune informazioni su di te} other {Mancano alcune informazioni su «{name}»}}',
  'nl': '{isYou, select, true {Er ontbreken gegevens over jou} other {Er ontbreken gegevens over “{name}”}}',
  'pt-BR':
    '{isYou, select, true {Faltam algumas informações sobre você} other {Faltam algumas informações sobre “{name}”}}',
  'zh-Hans':
    '{isYou, select, true {缺少关于您的一些信息} other {缺少关于“{name}”的一些信息}}',
  'zh-Hant':
    '{isYou, select, true {缺少關於您的部分資訊} other {缺少關於「{name}」的部分資訊}}',
} as const satisfies Wording;

/** The note under the tracker when the family is recommended rather than required. */
export const RECOMMENDED_NOTE = {
  'en': 'You can also continue without these by pressing Next again.',
  'de': 'Sie können auch ohne diese Angaben fortfahren, indem Sie erneut auf „Weiter“ klicken.',
  'es': 'También puedes continuar sin esto pulsando de nuevo la flecha de avance.',
  'fr': 'Vous pouvez aussi continuer sans ces éléments en cliquant à nouveau sur « Suivant ».',
  'it': 'Puoi anche continuare senza questi elementi facendo di nuovo clic su «Avanti».',
  'nl': 'Je kunt ook zonder deze gegevens verdergaan door nogmaals op “Volgende” te klikken.',
  'pt-BR':
    'Você também pode continuar sem isso clicando em “Avançar” novamente.',
  'zh-Hans': '您也可以再次点击“下一步”，不完成这些内容直接继续。',
  'zh-Hant': '您也可以再次點選「下一步」，不完成這些項目直接繼續。',
} as const satisfies Wording;
