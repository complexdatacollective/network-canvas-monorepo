/**
 * Matching for the everything bar's local inventories.
 *
 * Case- and diacritic-insensitive, and index-mapped: every folded character
 * remembers the range of the ORIGINAL string it came from, so a match found in
 * folded space highlights the right characters of the label the researcher
 * actually sees. Folding is not length-preserving (NFD decomposition splits a
 * character into two, `ß` lowercases to `ss`), so mapping by index is the only
 * way a highlight can survive it.
 *
 * The substring pass makes no word-order or whitespace assumptions, so it works
 * on CJK and agglutinative labels that have no spaces at all. The initials pass
 * adds the "crp" → "Community Recovery Panel" shorthand on top, from token
 * starts rather than from a split on spaces.
 */

export type EverythingBarMatchRange = { start: number; end: number };

const DIACRITIC = /\p{Diacritic}/gu;
/** Whitespace, punctuation and symbols all end a token. */
const SEPARATOR = /[\p{White_Space}\p{P}\p{S}]/u;
const UPPERCASE = /\p{Lu}/u;
const LOWERCASE = /\p{Ll}/u;

type FoldedText = {
  folded: string;
  /** Start offset in the original string for each folded character. */
  starts: number[];
  /** End offset in the original string for each folded character. */
  ends: number[];
};

function foldCharacter(character: string, locale?: string): string {
  return character
    .normalize('NFD')
    .replace(DIACRITIC, '')
    .toLocaleLowerCase(locale);
}

/**
 * Folds `value` for comparison while recording, per folded character, the slice
 * of the original string that produced it.
 */
function foldForMatch(value: string, locale?: string): FoldedText {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  for (const character of value) {
    const end = offset + character.length;
    for (const foldedCharacter of foldCharacter(character, locale)) {
      folded += foldedCharacter;
      starts.push(offset);
      ends.push(end);
    }
    offset = end;
  }

  return { folded, starts, ends };
}

/**
 * The offsets at which a token begins: the first non-separator character, any
 * character following a separator, and the capital in a camel-cased word. A
 * script without case simply has fewer token starts, and the substring pass
 * still matches those labels.
 */
function tokenStarts(value: string): number[] {
  const starts: number[] = [];
  let offset = 0;
  let previous: string | undefined;

  for (const character of value) {
    if (!SEPARATOR.test(character)) {
      const afterSeparator = previous === undefined || SEPARATOR.test(previous);
      const camelCaseBoundary =
        previous !== undefined &&
        LOWERCASE.test(previous) &&
        UPPERCASE.test(character);
      if (afterSeparator || camelCaseBoundary) starts.push(offset);
    }
    previous = character;
    offset += character.length;
  }

  return starts;
}

function rangeOfFoldedSpan(
  folded: FoldedText,
  from: number,
  length: number,
): EverythingBarMatchRange | null {
  const start = folded.starts[from];
  const end = folded.ends[from + length - 1];
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

function matchInitials(
  label: string,
  foldedQuery: string,
  locale?: string,
): EverythingBarMatchRange[] | null {
  const starts = tokenStarts(label);
  if (starts.length === 0) return null;

  const initials = starts.map((start) => {
    const character = String.fromCodePoint(label.codePointAt(start) ?? 0);
    return {
      start,
      end: start + character.length,
      // A token start that folds away entirely (a lone combining mark) can
      // never match, and must not silently take the next initial's place.
      folded: foldCharacter(character, locale).charAt(0),
    };
  });

  const initialsText = initials.map((initial) => initial.folded).join('');
  const at = initialsText.indexOf(foldedQuery);
  if (at === -1) return null;

  return initials
    .slice(at, at + foldedQuery.length)
    .map(({ start, end }) => ({ start, end }));
}

/**
 * The ranges of `label` that `query` matches, or `null` when it does not match
 * at all. An empty query matches everything and highlights nothing.
 */
export function matchLabel(
  label: string,
  query: string,
  locale?: string,
): EverythingBarMatchRange[] | null {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const foldedQuery = foldForMatch(trimmed, locale).folded;
  if (foldedQuery === '') return [];

  const folded = foldForMatch(label, locale);
  const at = folded.folded.indexOf(foldedQuery);
  if (at !== -1) {
    const range = rangeOfFoldedSpan(folded, at, foldedQuery.length);
    return range ? [range] : [];
  }

  return matchInitials(label, foldedQuery, locale);
}

/**
 * Splits `label` into rendered segments, marking the matched ones. Ranges are
 * assumed to be in ascending order and non-overlapping, which is what
 * `matchLabel` returns.
 */
export function segmentLabel(
  label: string,
  ranges: EverythingBarMatchRange[],
): Array<{ text: string; matched: boolean }> {
  const segments: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: label.slice(cursor, range.start), matched: false });
    }
    segments.push({
      text: label.slice(range.start, range.end),
      matched: true,
    });
    cursor = range.end;
  }

  if (cursor < label.length) {
    segments.push({ text: label.slice(cursor), matched: false });
  }

  return segments;
}
