/**
 * A run of dashes opening a line, which is the only place CommonMark reads one
 * as anything but a hyphen: a bullet, a thematic break, or the underline of a
 * setext heading. Escaped everywhere, an age band was stored as `18\\-24` and a
 * category as `Part\\-time` — harmless to the participant, who is shown the
 * rendered label, and shown exactly like that to the researcher by every
 * read-only list that displays the stored source.
 */
const DASHES_OPENING_A_LINE = /^([^\S\n]*)(-+)/gm;

/**
 * An ampersand that opens a character reference (`&amp;`, `&#73;`), which
 * markdown would render as the character it names. A lone ampersand is
 * already text, so it is left as it is.
 */
const AMPERSAND_OPENING_A_REFERENCE = /&(?=#?[a-z\d]+;)/gi;

/**
 * A `>` opening a line, which CommonMark reads as a block quote. It is written
 * as `&gt;` rather than `\>`, because Architect's rich text editor reads every
 * `>` in stored markdown as `&gt;` before parsing it, which would turn `\>`
 * into the escaped text `&gt;`.
 */
const ANGLE_BRACKET_OPENING_A_LINE = /^([^\S\n]*)>/gm;

/**
 * Plain text as markdown that renders it as written, the way Architect's rich
 * text editor stores what a researcher types: `*star*` stays two asterisks
 * around a word rather than becoming emphasis.
 */
export const escapeMarkdownText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(AMPERSAND_OPENING_A_REFERENCE, '\\&')
    // Every `<`, because one opens raw HTML or an autolink, which the
    // renderer's sanitiser would remove or turn into a link.
    .replace(/</g, '\\<')
    .replace(ANGLE_BRACKET_OPENING_A_LINE, '$1&gt;')
    .replace(/(^\d+)+(\.)/g, '$1\\$2')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(
      DASHES_OPENING_A_LINE,
      (_all, indent: string, dashes: string) =>
        `${indent}${dashes.replaceAll('-', '\\-')}`,
    )
    .replace(/(\s*)#+(\s)/g, '$1\\#$2')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
