import { nameToEmoji } from 'gemoji';
import type { Nodes, Parents, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';

import {
  escapedAngleBracketAt,
  escapeMarkdownText,
} from '../../localization/markdownText.ts';
import type { LocalizedTextLines } from './localized-string.ts';

/**
 * The legacy editor stored what was typed as it was typed: a line opening
 * with `>` was a comparison ("> 5 years"), and `<...>` a placeholder ("<IRB
 * OR ETHICS BOARD HERE>"), never a quotation or HTML. The parser reads them
 * as those characters with the constructs that would read them otherwise
 * switched off, rather than the text being rewritten before it is read: the
 * parser alone knows where a `>` or `<` is markdown's own syntax (a
 * bracketed address, a code span), and those are left to it.
 */
const TYPED_CHARACTERS = {
  disable: { null: ['blockQuote', 'htmlFlow', 'htmlText'] },
};

// The web addresses the parser itself finds, each as a link that keeps its
// place in the text. The addresses GitHub's reading finds afterwards in the
// words are found by `bareAddressesIn`, which keeps their places too.
const { transforms: _wordsSearchedAfterwards, ...ADDRESSES_FOUND_BY_PARSER } =
  gfmAutolinkLiteralFromMarkdown();

/**
 * Schema 8 text as it was read: CommonMark, with `>` and `<` read as typed
 * characters, and with GitHub's bare web addresses read as links.
 */
const legacyTree = (markdown: string) =>
  fromMarkdown(markdown, {
    extensions: [TYPED_CHARACTERS, gfmAutolinkLiteral()],
    mdastExtensions: [ADDRESSES_FOUND_BY_PARSER],
  });

/** The one tag the legacy editor wrote for a line break, in any spelling. */
const BREAK_TAG = /<br\s*\/?>/gi;

const ONLY_SPACE_AND_BREAKS = /^(?:\s|<br\s*\/?>)*$/i;

/** A shortcode as `remark-gemoji`, which drew the emoji, finds one. */
const SHORTCODE = /:(\+1|[-\w]+):/g;

const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

const CHARACTER_REFERENCE = /^&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]*);/i;

const ENTITY_LIKE_AMPERSAND = /&(?=#\d{1,7};|#x[\da-f]{1,6};|[a-z][a-z\d]*;)/gi;

/** Where in the source a character of a text node's words was written. */
type Span = readonly [start: number, end: number];

/**
 * Where each character of a text node's words was written in the source:
 * one character, or an escape (`\*`), or a character reference (`&lt;`).
 * Spaces that indent a line, or end one, are not part of the words. Gives
 * undefined for a node it cannot follow, whose words are then left as typed.
 */
const sourceSpansOf = (source: string, node: Text): Span[] | undefined => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  const { value } = node;
  const spans: Span[] = [];
  let at = start;
  let index = 0;
  while (index < value.length) {
    if (at >= end) return undefined;
    const char = source.charAt(at);
    const next = source.charAt(at + 1);
    if (
      char === '\\' &&
      at + 1 < end &&
      ASCII_PUNCTUATION.test(next) &&
      value.charAt(index) === next
    ) {
      spans.push([at, at + 2]);
      at += 2;
      index += 1;
      continue;
    }
    const reference =
      char === '&'
        ? CHARACTER_REFERENCE.exec(source.slice(at, end))?.[0]
        : undefined;
    if (reference !== undefined && !value.startsWith(reference, index)) {
      // The character it stands for takes one to four code units in the
      // words; the source after it says where they end.
      const after = source.charAt(at + reference.length);
      let width = 1;
      while (
        width < 4 &&
        index + width < value.length &&
        value.charAt(index + width) !== after
      ) {
        width += 1;
      }
      for (let unit = 0; unit < width; unit += 1) {
        spans.push([at, at + reference.length]);
      }
      at += reference.length;
      index += width;
      continue;
    }
    if (char === value.charAt(index)) {
      spans.push([at, at + 1]);
      at += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      at += 1;
      continue;
    }
    return undefined;
  }
  return spans;
};

/** Each character from `from` to `to` was written as itself. */
const writtenAsTyped = (spans: readonly Span[], from: number, to: number) =>
  spans.slice(from, to).every(([start, end]) => end - start === 1);

/** A stretch of a text node's words, from `from` up to `to`. */
type Stretch = Readonly<{ from: number; to: number }>;

type BareAddress = Stretch & Readonly<{ href: string }>;

const overlaps = (stretch: Stretch, others: readonly Stretch[]) =>
  others.some(({ from, to }) => stretch.from < to && from < stretch.to);

// What GitHub's reading of bare addresses accepts before one: the start of
// the words, a space, or punctuation (but a slash before an email address).
const opensAddress = (input: string, index: number, email: boolean) => {
  if (index === 0) return true;
  const before = input.charAt(index - 1);
  return (
    (/\s/.test(before) || /\p{P}|\p{S}/u.test(before)) &&
    (!email || before !== '/')
  );
};

// A part of a domain GitHub's reading accepts: absent or empty, or with a
// letter or digit and no underscore.
const fitsDomain = (part: string | undefined) =>
  part === undefined ||
  part === '' ||
  (!part.includes('_') && /[a-zA-Z\d]/.test(part));

const isDomain = (domain: string) => {
  const parts = domain.split('.');
  return (
    parts.length >= 2 && fitsDomain(parts.at(-1)) && fitsDomain(parts.at(-2))
  );
};

// The address without the punctuation that ends a sentence after it, but
// with the closing brackets the address opened.
const withoutTrail = (url: string): string => {
  const trail = /[!"&'),.:;<>?\]}]+$/.exec(url);
  if (trail === null) return url;
  let kept = url.slice(0, trail.index);
  let rest = trail[0];
  let close = rest.indexOf(')');
  const opening = kept.split('(').length - 1;
  let closing = kept.split(')').length - 1;
  while (close !== -1 && opening > closing) {
    kept += rest.slice(0, close + 1);
    rest = rest.slice(close + 1);
    close = rest.indexOf(')');
    closing += 1;
  }
  return kept;
};

const URL_IN_WORDS = /(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi;
const EMAIL_IN_WORDS =
  /(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu;

const urlsIn = (words: string, offset: number): BareAddress[] => {
  const found: BareAddress[] = [];
  for (const match of words.matchAll(URL_IN_WORDS)) {
    const [, scheme = '', host = '', path = ''] = match;
    if (!opensAddress(words, match.index, false)) continue;
    const www = /^w/i.test(scheme);
    const domain = www ? scheme + host : host;
    if (!isDomain(domain)) continue;
    const kept = withoutTrail(domain + path);
    if (kept === '') continue;
    const shown = (www ? '' : scheme) + kept;
    found.push({
      from: offset + match.index,
      to: offset + match.index + shown.length,
      href: (www ? 'http://' : '') + shown,
    });
  }
  return found;
};

const emailsIn = (words: string, offset: number): BareAddress[] => {
  const found: BareAddress[] = [];
  for (const match of words.matchAll(EMAIL_IN_WORDS)) {
    const [address, , label = ''] = match;
    if (!opensAddress(words, match.index, true) || /[-\d_]$/.test(label)) {
      continue;
    }
    found.push({
      from: offset + match.index,
      to: offset + match.index + address.length,
      href: `mailto:${address}`,
    });
  }
  return found;
};

/**
 * The bare web and email addresses GitHub's reading finds in the words of a
 * text node that the parser left as words, as `mdast-util-gfm-autolink-literal`
 * finds them: web addresses first, then email addresses in the words between.
 */
const bareAddressesIn = (words: string): BareAddress[] => {
  const urls = urlsIn(words, 0);
  const emails: BareAddress[] = [];
  let from = 0;
  for (const url of [...urls, { from: words.length, to: words.length }]) {
    emails.push(...emailsIn(words.slice(from, url.from), from));
    from = url.to;
  }
  return [...urls, ...emails].toSorted((a, b) => a.from - b.from);
};

/** Each shortcode `remark-gemoji` drew as an emoji, with the emoji. */
const shortcodesIn = (
  words: string,
): (Stretch & Readonly<{ emoji: string }>)[] => {
  const found: (Stretch & Readonly<{ emoji: string }>)[] = [];
  const pattern = new RegExp(SHORTCODE);
  for (
    let match = pattern.exec(words);
    match !== null;
    match = pattern.exec(words)
  ) {
    const name = match[1] ?? '';
    if (!Object.hasOwn(nameToEmoji, name)) {
      // Not a shortcode after all: its closing colon may open the next.
      pattern.lastIndex = match.index + 1;
      continue;
    }
    found.push({
      from: match.index,
      to: match.index + match[0].length,
      emoji: nameToEmoji[name] ?? '',
    });
  }
  return found;
};

const withEmoji = (words: string): string =>
  shortcodesIn(words)
    .toReversed()
    .reduce(
      (text, { from, to, emoji }) =>
        `${text.slice(0, from)}${emoji}${text.slice(to)}`,
      words,
    );

/**
 * A link to `href` showing `words`, written as Architect's editor writes
 * one: the words escaped to show as written, the address as it is, with the
 * characters that would end it or be read as markdown escaped.
 */
const linkMarkdown = (words: string, href: string): string =>
  `[${escapeMarkdownText(withEmoji(words))}](${href
    .replace(/[\\()<>]/g, '\\$&')
    .replace(ENTITY_LIKE_AMPERSAND, '\\&')})`;

/**
 * What would open a block of its own at the start of a line: a heading, a
 * list item, a fence, a heading's underline or a rule. The group that
 * matched holds the marker, whose first character is escaped to keep the
 * line words.
 */
const OPENS_A_BLOCK =
  /^[^\S\n]*(?:(#{1,6})(?=[ \t]|$)|([-+*])(?=[ \t]|$)|\d{1,9}([.)])(?=[ \t]|$)|(`{3,}|~{3,})|(=+)[ \t]*$|(-+)[ \t]*$|([-*_])(?:[ \t]*[-*_]){2,}[ \t]*$)/;

/** Where in `words` a backslash keeps a line that starts there words. */
const blockOpenerAt = (words: string, from: number): number | undefined => {
  const line = words.slice(from).split('\n')[0] ?? '';
  const match = OPENS_A_BLOCK.exec(line);
  if (match === null) return undefined;
  const marker = match.slice(1).find((group) => group !== undefined);
  if (marker === undefined) return undefined;
  const at = line.indexOf(marker, line.length - line.trimStart().length);
  return at === -1 ? undefined : from + at;
};

type Edit = Readonly<{ start: number; end: number; text: string }>;

const leavesOf = (node: Nodes): Nodes[] =>
  'children' in node && node.children.length > 0
    ? node.children.flatMap(leavesOf)
    : [node];

type Context = Readonly<{
  source: string;
  multiline: boolean;
  edits: Edit[];
}>;

/**
 * The edits that make a text node's words read, in standard CommonMark, as
 * the legacy reading read them.
 */
const editWords = (
  node: Text,
  ancestors: readonly Parents[],
  { source, multiline, edits }: Context,
) => {
  const spans = sourceSpansOf(source, node);
  if (spans === undefined) return;
  const { value } = node;
  const sourceOf = ({ from, to }: Stretch) => ({
    start: spans[from]?.[0] ?? 0,
    end: spans[to - 1]?.[1] ?? 0,
  });
  const block = ancestors.findLast(
    (ancestor) => ancestor.type === 'paragraph' || ancestor.type === 'heading',
  );
  const inHeading = block?.type === 'heading';
  const inLink = ancestors.some(
    (ancestor) => ancestor.type === 'link' || ancestor.type === 'linkReference',
  );
  const leaves = block === undefined ? [] : leavesOf(block);
  const firstInBlock = leaves[0] === node;
  const lastInBlock = leaves.at(-1) === node;

  // Several lines hold links, which a bare address becomes. In one line an
  // address stays words, as typed.
  const addresses = multiline && !inLink ? bareAddressesIn(value) : [];
  for (const address of addresses) {
    edits.push({
      ...sourceOf(address),
      text: linkMarkdown(value.slice(address.from, address.to), address.href),
    });
  }

  // A line break: several of them in a line that runs on are each a break;
  // anywhere a break cannot be, a run of them is one space between words.
  const breaksApart = multiline && !inHeading;
  const breakPattern = breaksApart
    ? BREAK_TAG
    : /<br\s*\/?>(?:\s*<br\s*\/?>)*/gi;
  const breaks: Stretch[] = [];
  // The words as they will be read around each break, for where a `>`
  // opens a line.
  let context = value;
  for (const match of value.matchAll(breakPattern)) {
    const stretch = { from: match.index, to: match.index + match[0].length };
    if (overlaps(stretch, addresses)) continue;
    if (!writtenAsTyped(spans, stretch.from, stretch.to)) continue;
    breaks.push(stretch);
    const before = value.slice(0, stretch.from);
    const after = value.slice(stretch.to);
    const leading = firstInBlock && ONLY_SPACE_AND_BREAKS.test(before);
    const trailing = lastInBlock && ONLY_SPACE_AND_BREAKS.test(after);
    let text: string;
    let opensLine = false;
    let replaced = stretch;
    if (leading || trailing) {
      text = '';
      opensLine = leading && !inHeading;
    } else if (!breaksApart) {
      const spaced = /\s$/.test(before) || /^\s/.test(after);
      text = spaced ? '' : ' ';
    } else {
      const spaces = /^[^\S\n]*/.exec(after)?.[0].length ?? 0;
      if (value.charAt(stretch.to + spaces) === '\n') {
        // The line already ends here: the break ends it.
        text = '\\';
        replaced = { from: stretch.from, to: stretch.to + spaces };
      } else {
        text = '\\\n';
        opensLine = true;
      }
    }
    const placeholder = opensLine
      ? `\n${' '.repeat(replaced.to - replaced.from - 1)}`
      : ' '.repeat(replaced.to - replaced.from);
    context = `${context.slice(0, replaced.from)}${placeholder}${context.slice(replaced.to)}`;
    edits.push({ ...sourceOf(replaced), text });
    if (!opensLine) continue;
    const opener = blockOpenerAt(value, stretch.to);
    if (opener !== undefined && writtenAsTyped(spans, opener, opener + 1)) {
      const at = spans[opener]?.[0] ?? 0;
      edits.push({ start: at, end: at, text: '\\' });
    }
  }

  for (const address of addresses) {
    context = `${context.slice(0, address.from)}${'x'.repeat(address.to - address.from)}${context.slice(address.to)}`;
  }
  const taken = [...addresses, ...breaks];

  for (const shortcode of shortcodesIn(value)) {
    if (overlaps(shortcode, taken)) continue;
    edits.push({ ...sourceOf(shortcode), text: shortcode.emoji });
  }

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char !== '<' && char !== '>') continue;
    if (overlaps({ from: index, to: index + 1 }, taken)) continue;
    if (!writtenAsTyped(spans, index, index + 1)) continue;
    const escaped = escapedAngleBracketAt(context, index);
    if (escaped !== undefined) {
      edits.push({
        ...sourceOf({ from: index, to: index + 1 }),
        text: escaped,
      });
    }
  }
};

const isAddressFoundByParser = (node: Nodes, source: string): boolean => {
  if (node.type !== 'link') return false;
  const start = node.position?.start.offset;
  if (start === undefined) return false;
  const opening = source.charAt(start);
  return opening !== '<' && opening !== '[';
};

const collectEdits = (
  node: Nodes,
  ancestors: readonly Parents[],
  context: Context,
) => {
  if (node.type === 'text') {
    editWords(node, ancestors, context);
    return;
  }
  if (
    context.multiline &&
    isAddressFoundByParser(node, context.source) &&
    node.type === 'link'
  ) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      const words = node.children
        .map((child) => (child.type === 'text' ? child.value : ''))
        .join('');
      context.edits.push({ start, end, text: linkMarkdown(words, node.url) });
      return;
    }
  }
  if (!('children' in node)) return;
  for (const child of node.children) {
    collectEdits(child, [...ancestors, node], context);
  }
};

const applyEdits = (source: string, edits: readonly Edit[]): string => {
  const ordered = edits.toSorted((a, b) => a.start - b.start || a.end - b.end);
  let written = '';
  let at = 0;
  for (const edit of ordered) {
    // An edit inside one already made is part of it.
    if (edit.start < at) continue;
    written += source.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return written + source.slice(at);
};

/**
 * Schema 8 markdown as standard CommonMark (see `markdownTree`) that shows a
 * participant what the legacy reading of it showed. The legacy reading is
 * CommonMark in which a typed `>` or `<` is a character, never a quotation or
 * HTML; `<br>` is a line break; a bare web or email address is a link, as
 * GitHub reads one; and a shortcode such as `:smile:` is its emoji. Only the
 * characters whose meaning would otherwise change are rewritten:
 *
 * - each typed `<`, and each `>` that could open a quotation or close a tag,
 *   is escaped as Architect's editor escapes it (see `escapedAngleBracketAt`);
 * - in text of several lines, `<br>` becomes a line break; where no break
 *   can be (one line, or a heading) a run of them becomes a space between
 *   words, and at the start or end of a paragraph, where it showed nothing,
 *   it is dropped;
 * - in text of several lines, which can hold links, a bare address becomes
 *   a link written as the editor writes one
 *   (`[www.example.org](http://www.example.org)`); in one line it stays as
 *   typed, and is no longer a link;
 * - a shortcode `remark-gemoji` drew as an emoji is written as the emoji.
 *
 * Markdown's own syntax (code, links and their addresses, addresses in angle
 * brackets) is left as written, as is everything GitHub's reading added that
 * the standard parser reads as words (`~~struck~~`, `- [ ] task`, tables).
 * Text rewritten once is left as it is if rewritten again.
 *
 * `lines` is the shape the field declares: whether it holds one line or
 * several. Only markdown of several lines can hold links and line breaks.
 */
export const legacyMarkdownAsStandard = (
  markdown: string,
  { lines }: Readonly<{ lines: LocalizedTextLines }>,
): string => {
  const edits: Edit[] = [];
  collectEdits(legacyTree(markdown), [], {
    source: markdown,
    multiline: lines === 'multiple',
    edits,
  });
  return applyEdits(markdown, edits);
};

/**
 * The texts the migration writes as standard markdown itself, such as a
 * heading made from a schema 8 title or a caption made from an attribute's
 * name, each named by the object that holds it and its key. They are not
 * read the legacy way when the migration localizes them.
 */
export type TextsWrittenAsStandard = Readonly<{
  add: (container: object, key: string | number) => void;
  has: (container: object, key: string | number) => boolean;
}>;

export const textsWrittenAsStandard = (): TextsWrittenAsStandard => {
  const keys = new WeakMap<object, Set<string | number>>();
  return {
    add: (container, key) => {
      const held = keys.get(container) ?? new Set();
      held.add(key);
      keys.set(container, held);
    },
    has: (container, key) => keys.get(container)?.has(key) ?? false,
  };
};
