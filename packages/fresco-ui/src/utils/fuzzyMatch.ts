import { foldText } from './foldText';

/**
 * Characters that start a new word inside a name, such as the `_` in
 * `close_friend` or the space in `close friend`.
 */
const WORD_SEPARATOR = /[\s_\-./]/u;

/**
 * How well a search matches a piece of text, or `undefined` when it does not
 * match at all. A lower score is a better match.
 *
 * The search matches when its characters appear in the text in the same
 * order, not necessarily next to each other, so an abbreviation finds the
 * word it abbreviates: "mrd" matches "married" and "cls" matches
 * "close_friend". Matching ignores case and accents.
 *
 * Text that contains the whole search scores below 1, earliest first. Any
 * other match scores 1 or more: characters that follow one another, and
 * characters at the start of a word, cost less than characters found after a
 * gap.
 *
 * Fuse.js, which `collection` uses for its search, measures how many edits
 * turn the search into part of the text. That suits a misspelled word, but
 * not an abbreviation: "mrd" is two edits from any part of "married", so Fuse
 * rejects it at every useful threshold.
 */
export function fuzzyMatchScore(
  search: string,
  text: string,
  locale?: string,
): number | undefined {
  const needle = foldText(search.trim(), locale);
  if (needle === '') return 0;
  const haystack = foldText(text, locale);

  const substringAt = haystack.indexOf(needle);
  if (substringAt !== -1) return substringAt / (haystack.length + 1);

  let score = 1;
  let from = 0;
  let previous = -2;
  for (const character of needle) {
    const at = haystack.indexOf(character, from);
    if (at === -1) return undefined;
    if (at !== previous + 1) {
      const atWordStart =
        at === 0 || WORD_SEPARATOR.test(haystack.charAt(at - 1));
      score += atWordStart ? 0.5 : 1 + (at - from) / 10;
    }
    previous = at;
    from = at + character.length;
  }
  return score;
}

/**
 * The items whose text matches the search, best match first. Items that
 * match equally well keep the order they were given in, so a list sorted by
 * name stays sorted by name within each score.
 *
 * An empty search matches every item and returns them in their given order.
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  search: string,
  textOf: (item: T) => string,
  locale?: string,
): T[] {
  if (search.trim() === '') return [...items];
  return items
    .flatMap((item, index) => {
      const score = fuzzyMatchScore(search, textOf(item), locale);
      return score === undefined ? [] : [{ item, index, score }];
    })
    .toSorted((first, second) =>
      first.score === second.score
        ? first.index - second.index
        : first.score - second.score,
    )
    .map(({ item }) => item);
}
