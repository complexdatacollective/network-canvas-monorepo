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
 * An `&` the renderer would decode: typed as `&lt;`, it would be shown as `<`.
 * A bare `&` is text to markdown, so it is left readable.
 */
const CHARACTER_REFERENCE = /&(?=#\d{1,7};|#x[\da-f]{1,6};|[a-z][a-z\d]*;)/gi;

const LINE_SO_FAR_IS_BLANK = /(^|\n)[^\S\n]*$/;

/**
 * The interview renderer passes raw HTML through and then sanitises it, so a
 * typed `<IRB OR ETHICS BOARD HERE>` was read as an unknown element and dropped
 * from the participant's screen. `<` can open HTML or an autolink almost
 * anywhere, so every one is escaped. `>` means something only where it opens a
 * line (a block quote) or closes a bracket, and is escaped only there: the
 * comparison in an option label like `A > B` stays readable in the lists that
 * show the stored source. Both are written as character references, the form
 * the sample protocol stores, so text saved again comes back unchanged.
 */
const escapeAngleBrackets = (value: string): string =>
  value
    .replace(/>/g, (bracket, offset: number) => {
      const before = value.slice(0, offset);
      return LINE_SO_FAR_IS_BLANK.test(before) || before.includes('<')
        ? '&gt;'
        : bracket;
    })
    .replaceAll('<', '&lt;');

/**
 * Plain text as markdown that renders it as written, the way Architect's rich
 * text editor stores what a researcher types: `*star*` stays two asterisks
 * around a word rather than becoming emphasis.
 */
export const escapeMarkdownText = (value: string): string =>
  escapeAngleBrackets(value.replace(CHARACTER_REFERENCE, '&amp;'))
    .replace(/\\/g, '\\\\')
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
