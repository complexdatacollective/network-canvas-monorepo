/**
 * Count the user-perceived characters ("grapheme clusters") in a string.
 *
 * `String.prototype.length` counts UTF-16 code units, which charges 8 for a
 * single 🧑‍🤝‍🧑 and 4 for 🇸🇦 — so a `.length`-based cap penalises exactly the
 * emoji-heavy and non-Latin names #1397 exists to keep working. `Intl.Segmenter`
 * counts what a researcher actually sees, so a name of 100 emoji costs 100.
 *
 * Deliberately Architect-local rather than folded into `@codaco/fresco-ui`'s
 * `maxLength` validator: that validator also backs protocol-schema-mirrored
 * rules (the Anonymisation passphrase, Information panel copy) whose
 * enforcement has to stay identical to `@codaco/interview`'s at runtime.
 * Changing it there would silently diverge Architect from the interview engine.
 */

// One segmenter for the module: constructing an `Intl.Segmenter` is far more
// expensive than segmenting a protocol-name-length string, and this runs on
// every keystroke in the name control.
const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export default function countGraphemes(value: string): number {
  if (!graphemeSegmenter) {
    // Every browser Architect supports has `Intl.Segmenter`, but iterating the
    // string still beats `value.length` if one somehow does not: it counts
    // code points, so 🧑‍🤝‍🧑 costs 5 rather than 8 and 🇸🇦 costs 2 rather than 4.
    return Array.from(value).length;
  }

  return [...graphemeSegmenter.segment(value)].length;
}
