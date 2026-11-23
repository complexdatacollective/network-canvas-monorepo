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

const TILDES = /~+/g;

/**
 * The interview reads markdown with GitHub's additions, where a tilde or two
 * on either side of words strikes them through. That takes two runs of them,
 * so a lone one (`~5 minutes`) means nothing and stays readable in the lists
 * that show the stored source.
 */
const strikesThrough = (value: string): boolean =>
  (value.match(TILDES)?.length ?? 0) > 1;

// Plain text as markdown that renders it as written; `tildes` is whether
// what the text is read in strikes through, so its tildes are escaped.
const escapeMarkdown = (value: string, tildes: boolean): string =>
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
    // Each `#` of a run, so the run keeps its length: `## 2` is two signs.
    .replace(/#+(?=\s)/g, (run) => run.replaceAll('#', '\\#'))
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(TILDES, (run) => (tildes ? run.replaceAll('~', '\\~') : run));

/**
 * Plain text as markdown that renders it as written, the way Architect's rich
 * text editor stores what a researcher types: `*star*` stays two asterisks
 * around a word rather than becoming emphasis.
 */
export const escapeMarkdownText = (value: string): string =>
  escapeMarkdown(value, strikesThrough(value));

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

// The words a message holds, with a space where it shows a value or chooses
// between versions, so that words on either side of one are not read as one.
const wordsOf = (nodes: readonly MessageNode[]): string =>
  nodes
    .map((node) => {
      if (node.kind === 'text') return node.text;
      if (node.kind !== 'switch') return ' ';
      return ` ${node.versions.map((version) => wordsOf(version.nodes)).join(' ')} `;
    })
    .join('');

/**
 * A message whose words are plain text, as one line of markdown that shows
 * them as written once its values are filled in. Only its words are escaped
 * (see `escapeMarkdownText`), each run of them alone but for what takes more
 * than one: two tildes strike through what is between them, a value
 * included, so a tilde anywhere in the message is escaped when another is.
 * `end` escapes what may end the line. What the message shows of a value,
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
  const tildes = strikesThrough(wordsOf(structure.nodes));
  return printMessageStructure(
    mapText(structure.nodes, (text) =>
      end(escapeMarkdown(oneLine(text), tildes)),
    ),
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
 * A version's markdown as the editor reads it (see `markdownAsEdited`): one
 * line, without the spaces at its ends, behind `VERSION_LINE_LEAD`.
 */
export const versionLineMarkdown = (markdown: string): string =>
  VERSION_LINE_LEAD + markdown.trim();
