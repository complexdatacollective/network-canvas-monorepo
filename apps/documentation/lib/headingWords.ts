const RIGHT_TO_LEFT_LETTER =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u;
const LEFT_TO_RIGHT_LETTER = new RegExp(
  `(?!${RIGHT_TO_LEFT_LETTER.source})\\p{L}`,
  'u',
);

function hasLetterOf(word: string, direction: 'ltr' | 'rtl') {
  return (
    direction === 'rtl' ? RIGHT_TO_LEFT_LETTER : LEFT_TO_RIGHT_LETTER
  ).test(word);
}

/**
 * The units a heading animates one by one: each word written in the page's
 * direction on its own, and each run of words that is not (a Latin name in a
 * right-to-left heading, with any numbers or punctuation between its words)
 * as one unit.
 *
 * An animated word is an inline block, which the bidirectional algorithm
 * places as a single neutral character: in the page's direction. Two Latin
 * words as two blocks in an Arabic heading would therefore swap places
 * ("Canvas Network"); kept in one block, the run lays out in its own
 * direction as running text does.
 */
export function headingWordUnits(
  line: string,
  direction: 'ltr' | 'rtl',
): string[] {
  const units: string[] = [];
  let run: string[] = [];
  for (const word of line.split(' ')) {
    if (hasLetterOf(word, direction)) {
      if (run.length > 0) units.push(run.join(' '));
      run = [];
      units.push(word);
    } else {
      run.push(word);
    }
  }
  if (run.length > 0) units.push(run.join(' '));
  return units;
}
