/**
 * Where a long kinship word may break inside a person's symbol, for every
 * language the stage's kinship words come in. This is the only place those
 * break points are set: the words themselves, as the stage or a protocol
 * holds them, carry none, and any they do carry are ignored. So a word
 * breaks at the same place however the label came to be written: in a
 * protocol saved before break points existed, in wording a researcher
 * edited, or wherever else the word appears in the label.
 *
 * Each word is written in lower case with `|` at each place it may break,
 * at a boundary a reader recognises ("grand|mother", not "grandmo|ther").
 * A word matches whatever its case on the canvas. Short words, and words
 * that fit a symbol whole ("grandson"), have none.
 */
const BREAKS: Readonly<Record<string, readonly string[]>> = {
  'en': [
    'bio|logical',
    'daugh|ter',
    'grand|child',
    'grand|daughter',
    'grand|father',
    'grand|mother',
    'grand|parent',
    'step|brother',
    'step|daughter',
    'step|father',
    'step|mother',
    'step|sister',
    'surro|gacy',
    'surro|gate',
  ],
  'de': [
    'adoptiv|bruder',
    'adoptiv|eltern|teil',
    'adoptiv|geschwister|teil',
    'adoptiv|mutter',
    'adoptiv|schwester',
    'adoptiv|vater',
    'eizell|spenderin',
    'eltern|teil',
    'eltern|teils',
    'enkel|kind',
    'enkel|sohn',
    'enkel|tochter',
    'geschwister|teil',
    'geschwister|teils',
    'groß|eltern|teil',
    'groß|eltern|teils',
    'groß|mutter',
    'groß|onkel',
    'groß|tante',
    'groß|vater',
    'halb|bruder',
    'halb|geschwister|teil',
    'halb|schwester',
    'leih|mutter',
    'leih|mutter|schaft',
    'mütter|licher|seits',
    'partner|person',
    'samen|spender',
    'schwieger|eltern|teil',
    'schwieger|kind',
    'schwieger|mutter',
    'schwieger|sohn',
    'schwieger|tochter',
    'schwieger|vater',
    'spender|kind',
    'stief|bruder',
    'stief|eltern|teil',
    'stief|geschwister|teil',
    'stief|groß|eltern|teil',
    'stief|groß|mutter',
    'stief|groß|vater',
    'stief|kind',
    'stief|mutter',
    'stief|schwester',
    'stief|sohn',
    'stief|tochter',
    'stief|vater',
    'urenkel|kind',
    'urenkel|sohn',
    'urenkel|tochter',
    'urgroß|eltern|teil',
    'urgroß|mutter',
    'urgroß|vater',
    'väter|licher|seits',
  ],
  'es': [
    'abue|lastra',
    'abue|lastro',
    'bio|lógica',
    'bio|lógico',
    'herma|nastra',
    'herma|nastro',
    'progeni|tor',
  ],
  'fr': ['bio|logique', 'mater|nelle', 'parte|naire', 'pater|nelle'],
  'it': [
    'acqui|sita',
    'acqui|siti',
    'acqui|sito',
    'biolo|gica',
    'biolo|gico',
    'dona|zione',
    'fratel|lastro',
    'gesta|zione',
    'sorel|lastra',
  ],
  'nl': [
    'achter|klein|dochter',
    'achter|klein|kind',
    'achter|klein|zoon',
    'adoptief|broer',
    'adoptief|moeder',
    'adoptief|ouder',
    'adoptief|vader',
    'adoptief|zus',
    'bio|logische',
    'donor|kind',
    'draag|moeder',
    'draag|moeder|schap',
    'eicel|donor',
    'eicel|ouder',
    'groot|ouder',
    'half|broer',
    'half|zus',
    'klein|dochter',
    'klein|kind',
    'klein|zoon',
    'moeders|kant',
    'oud|tante',
    'over|groot|moeder',
    'over|groot|ouder',
    'over|groot|vader',
    'schoon|dochter',
    'schoon|kind',
    'schoon|moeder',
    'schoon|ouder',
    'schoon|vader',
    'schoon|zoon',
    'schoon|zus',
    'stief|broer',
    'stief|dochter',
    'stief|groot|ouder',
    'stief|kind',
    'stief|moeder',
    'stief|oma',
    'stief|opa',
    'stief|ouder',
    'stief|vader',
    'stief|zoon',
    'stief|zus',
    'vaders|kant',
    'zaad|donor',
    'zaad|ouder',
  ],
  'pt-BR': ['afini|dade', 'bio|lógica', 'bio|lógico', 'substi|tuição'],
};

const SOFT_HYPHEN = '­';

const breakPointsByLanguage = new Map(
  Object.entries(BREAKS).map(([locale, words]) => [
    locale,
    new Map(
      words.map((word) => {
        const at: number[] = [];
        let plain = '';
        for (const part of word.split('|')) {
          if (plain !== '') at.push(plain.length);
          plain += part;
        }
        return [plain, at] as const;
      }),
    ),
  ]),
);

/** The break points for a language, by its full tag or else its base
 * language ("pt-BR", then "pt"). */
const breakPointsFor = (locale: string) =>
  breakPointsByLanguage.get(locale) ??
  breakPointsByLanguage.get(locale.split('-')[0] ?? locale);

/**
 * A kinship word, or a label built from them, with soft hyphens at each
 * place `BREAKS` sets for its language and nowhere else. A soft hyphen is
 * invisible unless the word does break there, and then it draws a hyphen.
 */
export function withKinshipBreaks(text: string, locale: string): string {
  const plain = text.replaceAll(SOFT_HYPHEN, '');
  const breaks = breakPointsFor(locale);
  if (!breaks) return plain;
  return plain.replace(/\p{L}+/gu, (word) => {
    const lower = word.toLocaleLowerCase(locale);
    // A word whose lower case is not letter for letter is left whole.
    const at = lower.length === word.length ? breaks.get(lower) : undefined;
    if (!at) return word;
    let result = '';
    let from = 0;
    for (const index of at) {
      result += word.slice(from, index) + SOFT_HYPHEN;
      from = index;
    }
    return result + word.slice(from);
  });
}
