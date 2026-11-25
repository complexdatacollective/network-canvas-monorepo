import {
  type MessageNode,
  messageStructure,
  printMessageStructure,
} from './messageStructure.ts';

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
 * What markdown reads as a character reference (`&lt;`, `&#60;`, `&#x3c;`):
 * markdown shows the character it names rather than the characters typed.
 * Whether a named one is decoded depends on the name; this matches the
 * shape, so text escaped by it may escape an `&` that needed nothing.
 */
export const CHARACTER_REFERENCE =
  /&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]*);/i;

/** One ASCII punctuation character, each of which a backslash makes literal. */
export const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

/** Every `&` that opens a character reference (see `CHARACTER_REFERENCE`). */
const REFERENCE_AMPERSAND = new RegExp(
  `&(?=${CHARACTER_REFERENCE.source.slice(1)})`,
  'gi',
);

const LINE_SO_FAR_IS_BLANK = /(^|\n)[^\S\n]*$/;

/**
 * Markdown reads `<` as the start of HTML or of an address in angle brackets,
 * so a typed `<IRB OR ETHICS BOARD HERE>` would not be shown as typed. `<` can
 * open either almost anywhere, so every one is escaped. `>` means something
 * only where it opens a line (a block quote) or closes a bracket, and is
 * escaped only there: the
 * comparison in an option label like `A > B` stays readable in the lists that
 * show the stored source. Both are written as character references, the form
 * the sample protocol stores, so text saved again comes back unchanged.
 *
 * This gives what the character at `offset` in `value` is written as, or
 * undefined where it is written as it is, so that the 8 to 9 migration can
 * escape the brackets of legacy text exactly as the editor would.
 */
export const escapedAngleBracketAt = (
  value: string,
  offset: number,
): string | undefined => {
  const bracket = value.charAt(offset);
  if (bracket === '<') return '&lt;';
  if (bracket !== '>') return undefined;
  const before = value.slice(0, offset);
  return LINE_SO_FAR_IS_BLANK.test(before) || before.includes('<')
    ? '&gt;'
    : undefined;
};

const escapeAngleBrackets = (value: string): string =>
  value.replace(
    /[<>]/g,
    (bracket, offset: number) =>
      escapedAngleBracketAt(value, offset) ?? bracket,
  );

/**
 * A marker that opens a block where it opens a line, after any indentation,
 * which escaping the characters it is made of wherever they stand would
 * leave unescaped: a code fence of three or more tildes, a `+` that opens a
 * bulleted item, a number that opens a numbered item (`1.` or `1)`), a run of
 * `#` that opens a heading, and a line of `=` that turns the line before it
 * into a heading. One or two tildes, which mean nothing in CommonMark, are
 * left as they are. (`*`, `_` and backticks are escaped wherever they stand,
 * a `-` and a `>` where they open a line.)
 */
const MARKER_OPENING_A_LINE =
  /^([^\S\n]*)(~{3,}|\+(?=[^\S\n]|$)|\d{1,9}[.)](?=[^\S\n]|$)|#+(?=[^\S\n]|$)|=+(?=[^\S\n]*$))/gm;

/** A marker found by `MARKER_OPENING_A_LINE`, written to show as typed. */
const escapedMarker = (marker: string): string => {
  // A digit cannot be escaped, so a number's delimiter is.
  if (/^\d/.test(marker)) return `${marker.slice(0, -1)}\\${marker.slice(-1)}`;
  // Each `#` of a run, as `#` is escaped elsewhere.
  if (marker.startsWith('#')) return marker.replaceAll('#', '\\#');
  return `\\${marker}`;
};

/**
 * Indentation that makes the line it opens a code block: four columns of
 * spaces, or a tab, at the start of the text or of a paragraph after a blank
 * line. A backslash cannot escape white space, so its first character is
 * written as a character reference, which shows the same character and
 * indents nothing.
 */
const CODE_INDENTATION = /(^|\n[^\S\n]*\n)( {4}| {0,3}\t)/g;

/**
 * Plain text as markdown that renders it as written, the way Architect's rich
 * text editor stores what a researcher types: `*star*` stays two asterisks
 * around a word rather than becoming emphasis. Everything that plain
 * CommonMark reads as markdown is escaped, and nothing that only GitHub's
 * additions read (a pair of tildes, a table's `|`).
 */
export const escapeMarkdownText = (value: string): string =>
  escapeAngleBrackets(value.replace(REFERENCE_AMPERSAND, '&amp;'))
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(
      DASHES_OPENING_A_LINE,
      (_all, indent: string, dashes: string) =>
        `${indent}${dashes.replaceAll('-', '\\-')}`,
    )
    // Each `#` of a run, so the run keeps its length: `## 2` is two signs.
    .replace(/#+(?=\s)/g, (run) => run.replaceAll('#', '\\#'))
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(
      MARKER_OPENING_A_LINE,
      (_all, indent: string, marker: string) =>
        `${indent}${escapedMarker(marker)}`,
    )
    .replace(
      CODE_INDENTATION,
      (_all, before: string, indentation: string) =>
        `${before}&#${indentation.charCodeAt(0)};${indentation.slice(1)}`,
    );

/**
 * A link's address as markdown that reads back as exactly that address, for
 * every writer of a link (the 8 to 9 migration and Architect's editor), so
 * that saving a text without a change never changes where a link leads.
 * A backslash, an angle bracket, a parenthesis and an `&` that would open a
 * character reference are escaped. An address holding a space or another
 * control character is written between angle brackets, where markdown allows
 * them; a line ending cannot be written there and is percent-encoded.
 */
export const linkDestinationMarkdown = (address: string): string => {
  const escaped = address
    .replace(/[\\<>]/g, '\\$&')
    .replace(REFERENCE_AMPERSAND, '\\&');
  // oxlint-disable-next-line no-control-regex -- control characters are what this looks for
  if (address === '' || /[\s\u0000-\u001f\u007f]/.test(address)) {
    return `<${escaped.replace(/\n/g, '%0A').replace(/\r/g, '%0D')}>`;
  }
  return escaped.replace(/[()]/g, '\\$&');
};

/**
 * A link's title as markdown, in double quotes, that reads back as exactly
 * that title: a backslash, a double quote and an `&` that would open a
 * character reference are escaped.
 */
export const linkTitleMarkdown = (title: string): string =>
  `"${title.replace(/[\\"]/g, '\\$&').replace(REFERENCE_AMPERSAND, '\\&')}"`;

const oneLine = (text: string): string => text.replace(/\s+/g, ' ');

/**
 * Escaped text that ends a heading's line: a run of # there, or one that is
 * all the line holds, would close the heading rather than show, so it is
 * escaped.
 */
const headingEnd = (escaped: string): string =>
  escaped.replace(/(^|\s)(#+)$/, '$1\\$2');

/** Plain text as a top-level markdown heading that shows it as written. */
export const headingMarkdown = (text: string): string =>
  `# ${headingEnd(escapeMarkdownText(oneLine(text.trim())))}`;

const mapText = (
  nodes: readonly MessageNode[],
  map: (text: string) => string,
): MessageNode[] =>
  nodes.map((node) => {
    if (node.kind === 'text') return { kind: 'text', text: map(node.text) };
    if (node.kind !== 'switch') return node;
    return {
      ...node,
      versions: node.versions.map((version) => ({
        key: version.key,
        nodes: mapText(version.nodes, map),
      })),
    };
  });

/**
 * A message whose words are plain text, as one line of markdown that shows
 * them as written once its values are filled in. Only its words are escaped
 * (see `escapeMarkdownText`), each run of them alone. `end` escapes what may
 * end the line. What the message shows of a value,
 * the versions it chooses between and a plural's count are left as they
 * are, and its words keep the quoting ICU reads them with. A message that
 * cannot be read is kept as written, for validation to report.
 */
const messageLine = (
  message: string,
  end: (escaped: string) => string,
): string => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message.trim();
  return printMessageStructure(
    mapText(structure.nodes, (text) => end(escapeMarkdownText(oneLine(text)))),
  ).trim();
};

/**
 * A message whose words are plain text (a label, a file's description) as a
 * message of one line of markdown that shows them as written (see
 * `escapeMessageText` for text written as a string).
 */
export const messageTextAsMarkdown = (message: string): string =>
  messageLine(message, (escaped) => escaped);

/**
 * A message whose words are plain text as a message of a top-level markdown
 * heading that shows them as written: `headingMarkdown` for a message.
 */
export const messageHeadingMarkdown = (message: string): string =>
  `# ${messageLine(message, headingEnd)}`;

/**
 * What stands at the start of a version while it is read as markdown. A
 * version sits inside a line, so text at its start (`# means`, `1. `) is not
 * the start of a heading or list; a private-use character authored text
 * cannot hold keeps markdown from taking it as one.
 */
export const VERSION_LINE_LEAD = '\uE002';

/**
 * A version's markdown as it is read inside the line it sits in: one line,
 * without the spaces at its ends, behind `VERSION_LINE_LEAD`.
 */
export const versionLineMarkdown = (markdown: string): string =>
  VERSION_LINE_LEAD + markdown.trim();
