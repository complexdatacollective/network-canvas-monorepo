import { decodeNamedCharacterReference } from 'decode-named-character-reference';
import { nameToEmoji } from 'gemoji';
import type { Nodes, Parents, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import { decodeNumericCharacterReference } from 'micromark-util-decode-numeric-character-reference';

import {
  ASCII_PUNCTUATION,
  CHARACTER_REFERENCE,
  escapedAngleBracketAt,
  escapeMarkdownText,
  linkDestinationMarkdown,
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

/** A character reference starting exactly where `lastIndex` is set. */
const REFERENCE_HERE = new RegExp(CHARACTER_REFERENCE.source, 'iy');

/**
 * The reference written at `at` in `source` and the characters markdown reads
 * it as, or undefined where what is written there is not one markdown
 * decodes, such as an unknown name (`&nosuch;`), which is read as typed.
 */
const referenceAt = (
  source: string,
  at: number,
): Readonly<{ written: string; read: string }> | undefined => {
  REFERENCE_HERE.lastIndex = at;
  const written = REFERENCE_HERE.exec(source)?.[0];
  if (written === undefined) return undefined;
  const name = written.slice(1, -1);
  if (!name.startsWith('#')) {
    const read = decodeNamedCharacterReference(name);
    return read === false ? undefined : { written, read };
  }
  const hex = /^#x/i.test(name);
  return {
    written,
    read: decodeNumericCharacterReference(
      name.slice(hex ? 2 : 1),
      hex ? 16 : 10,
    ),
  };
};

/** Where in the source a character of a text node's words was written. */
type Span = readonly [start: number, end: number];

/**
 * Where each character of a text node's words was written in the source:
 * one character, or an escape (`\*`), or a character reference (`&lt;`),
 * which markdown always decodes in words. In an address written as it is
 * (`raw`), such as one in angle brackets, neither is decoded. Spaces that
 * indent a line, or end one, are not part of the words. Gives undefined for
 * a node whose words do not follow from its source.
 */
const sourceSpansOf = (
  source: string,
  node: Text,
  raw: boolean,
): Span[] | undefined => {
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
    if (!raw && char === '\\' && at + 1 < end && ASCII_PUNCTUATION.test(next)) {
      if (value.charAt(index) !== next) return undefined;
      spans.push([at, at + 2]);
      at += 2;
      index += 1;
      continue;
    }
    const reference =
      !raw && char === '&' ? referenceAt(source, at) : undefined;
    if (reference !== undefined) {
      if (!value.startsWith(reference.read, index)) return undefined;
      // One span for each code unit the reference is read as.
      for (const _unit of reference.read.split('')) {
        spans.push([at, at + reference.written.length]);
      }
      at += reference.written.length;
      index += reference.read.length;
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

type Edit = Readonly<{ start: number; end: number; text: string }>;

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
  `[${escapeMarkdownText(withEmoji(words))}](${linkDestinationMarkdown(href)})`;

/**
 * What would open a block of its own at the start of a line: a heading, a
 * list item, a code fence, a heading's underline or a rule. The group that
 * matched holds the marker, whose first character is escaped to keep the
 * line words.
 */
const OPENS_A_BLOCK =
  /^[^\S\n]*(?:(#{1,6})(?=[ \t]|$)|([-+*])(?=[ \t]|$)|\d{1,9}([.)])(?=[ \t]|$)|(`{3,}(?=[^`]*$)|~{3,})|(=+)[ \t]*$|(-+)[ \t]*$|([-*_])(?:[ \t]*[-*_]){2,}[ \t]*$)/;

/** A `>` opening a line, which would open a quotation. */
const OPENS_A_QUOTATION = /^[^\S\n]*>/;

/**
 * The edits that keep a line a break opens, at `from` in the source, the
 * words it was: a `>` opening it is written `&gt;`, and the marker of
 * anything else that would open a block there is escaped. What follows the
 * break is read from the source, whatever node it belongs to, since a line
 * may open with the end of emphasis or the start of a link as well as with
 * the words of the node the break was in.
 */
const lineOpeningEdits = (source: string, from: number): Edit[] => {
  const line = source.slice(from).split('\n')[0] ?? '';
  const quotation = OPENS_A_QUOTATION.exec(line);
  if (quotation !== null) {
    const at = from + quotation[0].length - 1;
    return [{ start: at, end: at + 1, text: '&gt;' }];
  }
  const match = OPENS_A_BLOCK.exec(line);
  const marker = match?.slice(1).find((group) => group !== undefined);
  if (marker === undefined) return [];
  const at = line.indexOf(marker, line.length - line.trimStart().length);
  return at === -1 ? [] : [{ start: from + at, end: from + at, text: '\\' }];
};

/**
 * A bare address in one line, which stays words, written as the editor
 * writes words (`escapeMarkdownText`) where it holds a character markdown
 * may read as something else inside a line: `www.example.org/*a*` would
 * otherwise show emphasis. Undefined for an address with none.
 */
const addressAsTyped = (words: string): string | undefined =>
  /[*_`[\]\\&<>]/.test(words) ? escapeMarkdownText(words) : undefined;

const leavesOf = (node: Nodes): Nodes[] =>
  'children' in node && node.children.length > 0
    ? node.children.flatMap(leavesOf)
    : [node];

/**
 * The outermost emphasis that `node` ends, together with any emphasis inside
 * it that it also ends, or undefined where it ends none.
 */
const closingFormatting = (
  node: Nodes,
  ancestors: readonly Parents[],
): Parents | undefined => {
  let outermost: Parents | undefined;
  for (const ancestor of ancestors.toReversed()) {
    if (ancestor.type !== 'emphasis' && ancestor.type !== 'strong') break;
    if (leavesOf(ancestor).at(-1) !== node) break;
    outermost = ancestor;
  }
  return outermost;
};

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
  const { value } = node;
  // Words in an address written as it is (in angle brackets, or found bare
  // by the parser) are not decoded.
  const raw = ancestors.some(
    (ancestor) =>
      ancestor.type === 'link' &&
      source.charAt(ancestor.position?.start.offset ?? -1) !== '[',
  );
  const spans = sourceSpansOf(source, node, raw);
  if (spans === undefined) {
    // Words whose source cannot be followed character by character are
    // written again as words, every character escaped to show as typed, so
    // that nothing in them can become HTML, a quotation or a block. A line
    // break, emoji shortcode or address in them is then shown as typed too.
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      edits.push({ start, end, text: escapeMarkdownText(value) });
    }
    return;
  }
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

  // In several lines a bare address becomes a link. In one line it stays
  // words, written so that its characters still read as typed (see
  // `addressAsTyped`), and is left alone where they already do.
  const addresses = (inLink ? [] : bareAddressesIn(value)).filter(
    (address) =>
      multiline ||
      (writtenAsTyped(spans, address.from, address.to) &&
        addressAsTyped(value.slice(address.from, address.to)) !== undefined),
  );
  for (const address of addresses) {
    const words = value.slice(address.from, address.to);
    edits.push({
      ...sourceOf(address),
      text: multiline
        ? linkMarkdown(words, address.href)
        : (addressAsTyped(words) ?? words),
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
    // A break that ends emphasis is written after the emphasis closes, with
    // the spaces beside it: a closing `*` or `_` after a space, or opening a
    // line, would close nothing.
    const closingEnd =
      !leading && !trailing && after.trim() === ''
        ? closingFormatting(node, ancestors)?.position?.end.offset
        : undefined;
    if (closingEnd !== undefined) {
      const spaces = /\s*$/.exec(before)?.[0].length ?? 0;
      edits.push({
        ...sourceOf({ from: stretch.from - spaces, to: value.length }),
        text: '',
      });
      edits.push({
        start: closingEnd,
        end: closingEnd,
        text: breaksApart ? '\\\n' : ' ',
      });
      if (breaksApart) edits.push(...lineOpeningEdits(source, closingEnd));
      continue;
    }
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
    if (opensLine) {
      edits.push(...lineOpeningEdits(source, sourceOf(replaced).end));
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
  if (isAddressFoundByParser(node, context.source) && node.type === 'link') {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const words = node.children
      .map((child) => (child.type === 'text' ? child.value : ''))
      .join('');
    const text = context.multiline
      ? linkMarkdown(words, node.url)
      : context.source.slice(start, end) === words
        ? addressAsTyped(words)
        : undefined;
    if (start !== undefined && end !== undefined && text !== undefined) {
      context.edits.push({ start, end, text });
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
 *   typed, and is no longer a link, with any character markdown would read
 *   otherwise escaped;
 * - a shortcode `remark-gemoji` drew as an emoji is written as the emoji.
 *
 * Markdown's own syntax (code, links and their addresses, addresses in angle
 * brackets) is left as written, as is everything GitHub's reading added that
 * the standard parser reads as words (`~~struck~~`, `- [ ] task`, tables).
 * Text rewritten once is left as it is if rewritten again, but for an
 * address in one line whose characters were escaped: GitHub's reading
 * takes a backslash in an address as part of it.
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
