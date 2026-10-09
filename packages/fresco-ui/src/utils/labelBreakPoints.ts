const SOFT_HYPHEN = '­';

/** Fewest letters left on either side of a break. */
const MIN_FRAGMENT = 3;

/**
 * Shortest word that is given break points. A word of eight letters or fewer
 * fits a line of the smallest type in all but the tiniest nodes, and a name
 * that fits is left exactly as written; the words worth marking are the ones
 * that might not fit.
 */
const MIN_WORD = 9;

const VOWEL = /^[aeiouyæœø]$/i;
// Letter pairs that read as one sound and are never split: "Bartho-lomew",
// never "Bart-holomew".
const DIGRAPH = /^(?:ch|sh|th|ph|gh|wh|ck|ng|qu)$/i;

/** The base letter of an accented one, so "é" and "Ü" count as vowels. */
const baseLetter = (letter: string) =>
  letter.normalize('NFD').replace(/\p{M}/gu, '');

const isVowel = (letter: string) => VOWEL.test(baseLetter(letter));

// Consonant pairs that begin a syllable together: "Su-bra", not "Sub-ra".
const ONSET = /^(?:[bcdfgkpstvw][lr]|s[ptkcwnm]|tw|kn|wr)$/i;

/**
 * Whether a word may be broken before its `index`th letter, by the common
 * syllable rules: before a single consonant that sits between two vowels
 * (Ma-ria), before a consonant pair that begins a syllable (Su-bra), or
 * between two consonants that sit between vowels (Fer-nan-dez), never inside
 * a digraph.
 */
function canBreakBefore(letters: readonly string[], index: number): boolean {
  const before = letters[index - 1]!;
  const at = letters[index]!;
  const next = letters[index + 1];
  if (next === undefined) return false;
  const preceding = letters[index - 2];

  if (isVowel(before)) {
    if (isVowel(at)) return false;
    if (isVowel(next)) return true;
    const afterNext = letters[index + 2];
    return (
      afterNext !== undefined &&
      isVowel(afterNext) &&
      ONSET.test(`${at}${next}`)
    );
  }

  if (isVowel(at) || !isVowel(next)) return false;
  if (preceding === undefined || !isVowel(preceding)) return false;
  const pair = `${before}${at}`;
  return !DIGRAPH.test(pair) && !ONSET.test(pair);
}

/**
 * Marks places a long word may be broken, as soft hyphens, for a word that no
 * size of type can hold whole.
 *
 * Browsers hyphenate from a dictionary and, in Chromium, leave capitalised
 * words alone — which is nearly every name — so the only break left is the
 * emergency one, at any character, that strands a single letter on a line.
 * A soft hyphen is invisible unless the word does break there, and then it
 * draws a hyphen. The letters themselves are never changed, and a break is
 * never offered within `MIN_FRAGMENT` letters of either end of a word.
 *
 * Words that already carry a soft hyphen, words shorter than `MIN_WORD`, and
 * anything that is not a run of Latin letters, are left exactly as they are.
 */
export function withLabelBreakPoints(label: string): string {
  return label.replace(/[\p{Script=Latin}\u00AD]+/gu, (word) => {
    const letters = [...word];
    if (letters.length < MIN_WORD || word.includes(SOFT_HYPHEN)) {
      return word;
    }
    let result = '';
    letters.forEach((letter, index) => {
      if (
        index >= MIN_FRAGMENT &&
        index <= letters.length - MIN_FRAGMENT &&
        canBreakBefore(letters, index)
      ) {
        result += SOFT_HYPHEN;
      }
      result += letter;
    });
    return result;
  });
}
