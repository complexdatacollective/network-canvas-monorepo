import { decodeNamedCharacterReference } from 'decode-named-character-reference';
import { nameToEmoji } from 'gemoji';
import type { Nodes, Parents, Root, Text } from 'mdast';
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
import { markdownTree } from '../../localization/markdownTree.ts';
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
// words are found by `bareAddressesIn`, which keeps their places too, and,
// for the old reading, by GitHub's own search of the words.
const { transforms: WORDS_SEARCHED_AFTERWARDS, ...ADDRESSES_FOUND_BY_PARSER } =
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
      for (let unit = 0; unit < reference.read.length; unit += 1) {
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

/**
 * Whether words under `ancestors` are in an address written as it is: in
 * angle brackets, or found bare by the parser. Such words are not decoded.
 */
const inAddressAsWritten = (source: string, ancestors: readonly Parents[]) =>
  ancestors.some(
    (ancestor) =>
      ancestor.type === 'link' &&
      source.charAt(ancestor.position?.start.offset ?? -1) !== '[',
  );

/**
 * Where each character of a text node's words was written (see
 * `sourceSpansOf`), and each `<br>` tag in them typed as it is: one with an
 * escaped `<` (`\<br>`) or a character written as a reference (`&lt;br>`)
 * stayed words. Undefined where the words do not follow from their source.
 */
const typedTagsOf = (
  source: string,
  node: Text,
  ancestors: readonly Parents[],
): Readonly<{ spans: Span[]; tags: Stretch[] }> | undefined => {
  const spans = sourceSpansOf(
    source,
    node,
    inAddressAsWritten(source, ancestors),
  );
  if (spans === undefined) return undefined;
  const tags = Array.from(node.value.matchAll(BREAK_TAG), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
  })).filter(({ from, to }) => writtenAsTyped(spans, from, to));
  return { spans, tags };
};

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

/** The punctuation that can end a sentence after an address. */
const TRAIL = new Set('!"&\'),.:;<>?]}');

// The address without the punctuation that ends a sentence after it, but
// with the closing brackets the address opened.
const withoutTrail = (url: string): string => {
  let trailStart = url.length;
  while (trailStart > 0 && TRAIL.has(url.charAt(trailStart - 1))) {
    trailStart -= 1;
  }
  if (trailStart === url.length) return url;
  let kept = url.slice(0, trailStart);
  let rest = url.slice(trailStart);
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

/** A character of an email address's name. */
const EMAIL_NAME = /[-.\w+]/;

/** An email address's domain, starting exactly where `lastIndex` is set. */
const EMAIL_DOMAIN_HERE = /[-\w]+(?:\.[-\w]+)+/y;

/**
 * The start of the words, or white space, punctuation or a symbol before
 * `at`: the last character of the two code units before it, which may be
 * one character outside the Basic Multilingual Plane.
 */
const startsWord = (words: string, at: number) =>
  at === 0 || /(?:\s|\p{P}|\p{S})$/u.test(words.slice(Math.max(0, at - 2), at));

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

/**
 * The email addresses in `words`, found as the expression
 * `(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)` finds them, but
 * from each `@` outwards, so that the time taken grows with the length of
 * the words rather than with its square.
 */
const emailsIn = (words: string, offset: number): BareAddress[] => {
  const found: BareAddress[] = [];
  // Where the last address found ends: the next starts no earlier.
  let searched = 0;
  for (
    let at = words.indexOf('@');
    at !== -1;
    at = words.indexOf('@', at + 1)
  ) {
    let nameStart = at;
    while (
      nameStart > searched &&
      EMAIL_NAME.test(words.charAt(nameStart - 1))
    ) {
      nameStart -= 1;
    }
    while (nameStart < at && !startsWord(words, nameStart)) nameStart += 1;
    if (nameStart === at) continue;
    EMAIL_DOMAIN_HERE.lastIndex = at + 1;
    const domain = EMAIL_DOMAIN_HERE.exec(words)?.[0];
    if (domain === undefined) continue;
    const to = at + 1 + domain.length;
    searched = to;
    if (!opensAddress(words, nameStart, true) || /[-\d_]$/.test(domain)) {
      continue;
    }
    found.push({
      from: offset + nameStart,
      to: offset + to,
      href: `mailto:${words.slice(nameStart, to)}`,
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
 * Inline containers: emphasis, strong emphasis and a link's text, whose
 * delimiters decide what they hold by the characters beside them.
 */
const INLINE_CONTAINERS = new Set([
  'emphasis',
  'strong',
  'link',
  'linkReference',
]);

/**
 * The outermost inline container whose words start (`start`) or end (`end`)
 * with `node`, or undefined where `node` is not at that edge of any.
 */
const outermostContainerAt = (
  node: Nodes,
  ancestors: readonly Parents[],
  edge: 'start' | 'end',
): Parents | undefined => {
  let outermost: Parents | undefined;
  for (const ancestor of ancestors.toReversed()) {
    if (!INLINE_CONTAINERS.has(ancestor.type)) break;
    const leaves = leavesOf(ancestor);
    if ((edge === 'start' ? leaves[0] : leaves.at(-1)) !== node) break;
    outermost = ancestor;
  }
  return outermost;
};

/**
 * The outermost inline container that holds `node` and nothing else, or
 * undefined where none does.
 */
const containerOfOnly = (
  node: Nodes,
  ancestors: readonly Parents[],
): Parents | undefined => {
  let outermost: Parents | undefined;
  for (const ancestor of ancestors.toReversed()) {
    if (!INLINE_CONTAINERS.has(ancestor.type)) break;
    const leaves = leavesOf(ancestor);
    if (leaves.length !== 1 || leaves[0] !== node) break;
    outermost = ancestor;
  }
  return outermost;
};

/**
 * Where the line that `at` in the source is on ends, when only spaces and
 * tabs stand before its line ending: past them, and whether two or more
 * spaces there made that line ending a line break of its own. Undefined
 * where the line goes on.
 */
const lineEndAfter = (
  source: string,
  at: number,
): Readonly<{ end: number; breaks: boolean }> | undefined => {
  const spaces = /^[ \t]*/.exec(source.slice(at))?.[0] ?? '';
  const next = source.charAt(at + spaces.length);
  if (next !== '\n' && next !== '\r') return undefined;
  return { end: at + spaces.length, breaks: / {2}$/.test(spaces) };
};

/**
 * `count` line breaks as markdown: each a backslash ending a line, but for
 * the last where the line already ends there.
 */
const lineBreaks = (count: number, lineEndsAfter: boolean): string =>
  '\\\n'.repeat(count - (lineEndsAfter ? 1 : 0)) + (lineEndsAfter ? '\\' : '');

type CodeSpan = Readonly<{
  start: number;
  end: number;
  words: string;
  block: Readonly<{ start: number; end: number }>;
}>;

type Context = Readonly<{
  source: string;
  multiline: boolean;
  edits: Edit[];
  /** Where in the source each character the old reading read as typed words was written. */
  typed: Set<number>;
  /** Those of `typed` in a link's words. */
  linked: Set<number>;
  /**
   * Where in the source a line or a paragraph may begin, or its words
   * change, once the edits are made (see `lineStartGuard`).
   */
  lineStarts: number[];
  /** Each code span, with the paragraph or heading it is in. */
  codeSpans: CodeSpan[];
  /** The edits that write a shortcode as its emoji. */
  emoji: Edit[];
  /** The edits that write an emoji or a link in place of words. */
  rewritten: Edit[];
  /** Each paragraph or heading that holds words the edits change. */
  blocks: Set<Parents>;
}>;

/**
 * The edits that make a text node's words read, in standard CommonMark, as
 * the legacy reading read them.
 */
const editWords = (
  node: Text,
  ancestors: readonly Parents[],
  {
    source,
    multiline,
    edits,
    typed,
    linked,
    lineStarts,
    emoji,
    rewritten,
  }: Context,
) => {
  const { value } = node;
  const raw = inAddressAsWritten(source, ancestors);
  const followed = typedTagsOf(source, node, ancestors);
  if (followed === undefined) {
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
  const { spans, tags } = followed;
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
  if (!raw) {
    for (const [index, [start, end]] of spans.entries()) {
      if (end - start === 1 && source.charAt(start) === value.charAt(index)) {
        typed.add(start);
        if (inLink) linked.add(start);
      }
    }
  }
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
    const edit = {
      ...sourceOf(address),
      text: multiline
        ? linkMarkdown(words, address.href)
        : (addressAsTyped(words) ?? words),
    };
    edits.push(edit);
    rewritten.push(edit);
  }

  // Line breaks, in runs: the tags side by side, with any spaces among and
  // beside them. In several lines each tag is a break; where no break can
  // be (one line, or a heading) a run is one space between words; at the
  // start or end of a paragraph, where it showed nothing, a run is dropped.
  const breaksApart = multiline && !inHeading;
  const runs: { from: number; to: number; breaks: Stretch[] }[] = [];
  for (const stretch of tags) {
    if (overlaps(stretch, addresses)) continue;
    const last = runs.at(-1);
    if (
      last !== undefined &&
      value.slice(last.to, stretch.from).trim() === ''
    ) {
      last.to = stretch.to;
      last.breaks.push(stretch);
    } else runs.push({ ...stretch, breaks: [stretch] });
  }
  const breaks = runs.flatMap((run) => run.breaks);
  // The words as they will be read around each break, for where a `>`
  // opens a line.
  let context = value;
  const blank = (stretch: Stretch, opensLine: boolean) => {
    const width = stretch.to - stretch.from;
    const placeholder = opensLine
      ? `\n${' '.repeat(width - 1)}`
      : ' '.repeat(width);
    context = `${context.slice(0, stretch.from)}${placeholder}${context.slice(stretch.to)}`;
  };
  for (const run of runs) {
    const before = value.slice(0, run.from);
    const after = value.slice(run.to);
    const atStart = before.trim() === '';
    const atEnd = after.trim() === '';
    // The run with the spaces beside it, up to the edge of the words it
    // touches.
    const spacesBefore = before.length - before.trimEnd().length;
    const spacesAfter = /^\s*/.exec(after)?.[0].length ?? 0;
    const whole = {
      from: run.from - spacesBefore,
      to: run.to + spacesAfter,
    };
    // The line the run is in, and what follows it, read differently once
    // the tags are gone.
    const runStart = sourceOf(run).start;
    lineStarts.push(
      Math.max(
        source.lastIndexOf('\n', runStart - 1) + 1,
        block?.position?.start.offset ?? 0,
      ),
      sourceOf(whole).end,
    );
    const only =
      atStart && atEnd ? containerOfOnly(node, ancestors) : undefined;
    const removed = (() => {
      const from = only?.position?.start.offset;
      const to = only?.position?.end.offset;
      return from === undefined || to === undefined
        ? sourceOf(whole)
        : { start: from, end: to };
    })();

    if ((firstInBlock && atStart) || (lastInBlock && atEnd)) {
      edits.push({ ...removed, text: '' });
      lineStarts.push(removed.end);
      blank(whole, false);
      continue;
    }

    /**
     * A delimiter run that closes emphasis cannot follow white space, and
     * one that opens it cannot be followed by white space; a line ending
     * counts as white space, so a break is one too (CommonMark's
     * right-flanking and left-flanking delimiter runs). So whatever is
     * written for a run of breaks, a line break or a space, is never the
     * first or last thing inside emphasis, or, for the same look, inside a
     * link's text. A run that touches the inner edge of such a container,
     * with the spaces beside it, is written just outside the outermost
     * container it touches, on the side it touches, keeping its number of
     * breaks; a container that held nothing but the run goes with it.
     */
    const closing = atEnd
      ? outermostContainerAt(node, ancestors, 'end')
      : undefined;
    const opening =
      closing === undefined && atStart
        ? outermostContainerAt(node, ancestors, 'start')
        : undefined;
    const at = closing?.position?.end.offset ?? opening?.position?.start.offset;
    if (at !== undefined) {
      const lineEnd =
        closing === undefined ? undefined : lineEndAfter(source, at);
      edits.push({ ...removed, text: '' });
      edits.push({
        start: at,
        end: lineEnd?.end ?? at,
        text: breaksApart
          ? `${lineBreaks(run.breaks.length, lineEnd !== undefined)}${lineEnd?.breaks === true ? '\n\\' : ''}`
          : lineEnd?.breaks === true
            ? '  '
            : ' ',
      });
      blank(whole, false);
      lineStarts.push(at);
      continue;
    }

    if (!breaksApart) {
      const lineEnd = lineEndAfter(source, sourceOf(run).end);
      if (lineEnd !== undefined) {
        // The line ends after the run: it goes, with the spaces beside it,
        // which would otherwise end the line with a line break. Two spaces
        // after it were a line break of their own, and stay one.
        edits.push({
          start: sourceOf(whole).start,
          end: lineEnd.end,
          text: lineEnd.breaks ? '  ' : '',
        });
        blank(run, false);
        continue;
      }
      const spaced = /\s$/.test(before) || /^\s/.test(after);
      edits.push({ ...sourceOf(run), text: spaced ? '' : ' ' });
      blank(run, false);
      continue;
    }
    for (const stretch of run.breaks) {
      const lineEnd = lineEndAfter(source, sourceOf(stretch).end);
      if (lineEnd !== undefined) {
        // The line already ends here: the break ends it, written over the
        // spaces before the line ending, which would otherwise follow the
        // backslash and keep it from being a break.
        edits.push({
          start: sourceOf(stretch).start,
          end: lineEnd.end,
          text: lineEnd.breaks ? '\\\n\\' : '\\',
        });
        blank(stretch, false);
        continue;
      }
      edits.push({ ...sourceOf(stretch), text: '\\\n' });
      blank(stretch, true);
      lineStarts.push(sourceOf(stretch).end);
    }
  }

  for (const address of addresses) {
    context = `${context.slice(0, address.from)}${'x'.repeat(address.to - address.from)}${context.slice(address.to)}`;
  }
  const taken = [...addresses, ...breaks];

  for (const shortcode of shortcodesIn(value)) {
    if (overlaps(shortcode, taken)) continue;
    const edit = { ...sourceOf(shortcode), text: shortcode.emoji };
    edits.push(edit);
    emoji.push(edit);
    rewritten.push(edit);
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
  if (node.type === 'inlineCode') {
    const block = ancestors.findLast(
      (ancestor) =>
        ancestor.type === 'paragraph' || ancestor.type === 'heading',
    );
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      context.codeSpans.push({
        start,
        end,
        words: node.value,
        block: {
          start: block?.position?.start.offset ?? start,
          end: block?.position?.end.offset ?? end,
        },
      });
    }
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
      context.rewritten.push({ start, end, text });
      return;
    }
  }
  if (!('children' in node)) return;
  const before = context.edits.length;
  for (const child of node.children) {
    collectEdits(child, [...ancestors, node], context);
  }
  if (
    (node.type === 'paragraph' || node.type === 'heading') &&
    context.edits.length > before
  ) {
    context.blocks.add(node);
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
 * What the legacy interview showed for `source`, from `tree`, its legacy
 * reading (`legacyTree`), which this changes: CommonMark with `>` and `<`
 * read as typed characters, GitHub's bare addresses read as links (as words
 * in one line, which held no links), `remark-gemoji`'s shortcodes as their
 * emoji, and each `<br>` typed as it is as a line break (a space in one line
 * or a heading).
 *
 * The source is read exactly as it was typed. The tag was raw HTML, which
 * the parser never read as words; read as typed characters instead, its
 * `<` and `>` stand beside emphasis, and end an address the parser finds,
 * as the tag did. Each tag found in the words (see `typedTagsOf`) then
 * divides them, before GitHub's search of the words for addresses runs, as
 * the tag divided them.
 */
const oldReading = (source: string, tree: Root, multiline: boolean): Root => {
  const atTags = (node: Nodes, ancestors: readonly Parents[]): void => {
    if (!('children' in node)) return;
    const heading =
      node.type === 'heading' ||
      ancestors.some((ancestor) => ancestor.type === 'heading');
    const children: Nodes[] = [];
    for (const child of node.children) {
      if (child.type !== 'text') {
        atTags(child, [...ancestors, node]);
        children.push(child);
        continue;
      }
      const tags = typedTagsOf(source, child, [...ancestors, node])?.tags ?? [];
      let from = 0;
      for (const tag of tags) {
        children.push(
          { type: 'text', value: child.value.slice(from, tag.from) },
          multiline && !heading
            ? { type: 'break' }
            : { type: 'text', value: ' ' },
        );
        from = tag.to;
      }
      children.push(
        from === 0 ? child : { type: 'text', value: child.value.slice(from) },
      );
    }
    Reflect.set(node, 'children', children);
  };
  atTags(tree, []);
  for (const transform of WORDS_SEARCHED_AFTERWARDS ?? []) transform(tree);

  // The parser's addresses begin where they were written; those GitHub's
  // search finds in the words were not written as links, and have no place.
  const bare = (node: Nodes) =>
    node.type === 'link' &&
    (node.position?.start.offset === undefined ||
      !['<', '['].includes(source.charAt(node.position.start.offset)));
  const read = (node: Nodes): void => {
    if (!('children' in node)) return;
    const children: Nodes[] = [];
    for (const child of node.children) {
      if (!multiline && bare(child) && 'children' in child) {
        for (const grandchild of child.children) read(grandchild);
        children.push(...child.children);
        continue;
      }
      if (child.type === 'text') child.value = withEmoji(child.value);
      read(child);
      children.push(child);
    }
    Reflect.set(node, 'children', children);
  };
  read(tree);
  return tree;
};

/**
 * A line break or white space just inside emphasis or a link's text, moved
 * to just outside it, and the container left out where nothing is left in
 * it: a participant sees no difference.
 */
const outOfContainer = (node: Nodes): Nodes[] => {
  if (!INLINE_CONTAINERS.has(node.type) || !('children' in node)) {
    return [node];
  }
  const inside: Nodes[] = [...node.children];
  const before: Nodes[] = [];
  const after: Nodes[] = [];
  const edge = (at: 'start' | 'end'): boolean => {
    const child = at === 'start' ? inside[0] : inside.at(-1);
    const out = at === 'start' ? before : after;
    if (child?.type === 'break') {
      if (at === 'start') out.push(child);
      else out.unshift(child);
    } else if (
      child?.type === 'text' &&
      (at === 'start' ? /^\s/ : /\s$/).test(child.value)
    ) {
      const space: Nodes = { type: 'text', value: ' ' };
      if (at === 'start') out.push(space);
      else out.unshift(space);
      const words =
        at === 'start' ? child.value.trimStart() : child.value.trimEnd();
      if (words !== '') {
        inside.splice(at === 'start' ? 0 : -1, 1, { ...child, value: words });
        return true;
      }
    } else return false;
    inside.splice(at === 'start' ? 0 : -1, 1);
    return true;
  };
  while (edge('start'));
  while (edge('end'));
  const copy = { ...node };
  Reflect.set(copy, 'children', inside);
  return [...before, ...(inside.length === 0 ? [] : [copy]), ...after];
};

/**
 * What a reading shows a participant, as a string to compare: every node and
 * its properties but where it was read from, with what drawing it ignores
 * left out. A code span is its words, as the interview draws it; runs of
 * white space are one space; white space beside a line break, and a line
 * break or white space at either end of a paragraph or heading, show
 * nothing; and a line break or white space just inside emphasis or a link's
 * text shows as it would just outside it, where the migration writes it.
 */
const shownBy = (tree: Root): string => {
  const tidy = (node: Nodes): Nodes => {
    if (node.type === 'inlineCode') return { type: 'text', value: node.value };
    if (!('children' in node)) return node;
    const merged: Nodes[] = [];
    for (const child of node.children.map(tidy).flatMap(outOfContainer)) {
      const last = merged.at(-1);
      if (child.type === 'text' && last?.type === 'text') {
        last.value += child.value;
      } else merged.push(child.type === 'text' ? { ...child } : child);
    }
    for (const [index, child] of merged.entries()) {
      if (child.type !== 'text') continue;
      child.value = child.value.replace(/\s+/g, ' ');
      if (merged[index - 1]?.type === 'break') {
        child.value = child.value.trimStart();
      }
      if (merged[index + 1]?.type === 'break') {
        child.value = child.value.trimEnd();
      }
    }
    let kept = merged.filter(
      (child) => child.type !== 'text' || child.value !== '',
    );
    if (node.type === 'paragraph' || node.type === 'heading') {
      while (kept[0]?.type === 'break') kept = kept.slice(1);
      while (kept.at(-1)?.type === 'break') kept = kept.slice(0, -1);
      const first = kept[0];
      if (first?.type === 'text') first.value = first.value.trimStart();
      const last = kept.at(-1);
      if (last?.type === 'text') last.value = last.value.trimEnd();
      kept = kept.filter(
        (child) => child.type !== 'text' || child.value !== '',
      );
    }
    kept = kept.filter(
      (child) =>
        !(
          child.type === 'paragraph' &&
          'children' in child &&
          child.children.length === 0
        ),
    );
    const copy = { ...node };
    Reflect.set(copy, 'children', kept);
    return copy;
  };
  return JSON.stringify(tidy(structuredClone(tree)), (key, value: unknown) =>
    key === 'position' || key === 'data' ? undefined : value,
  );
};

/**
 * The words a participant saw in a block of the old reading, as markdown
 * that shows them as typed, with no formatting: each line break written as
 * one where the block can hold it, and as a space where it cannot.
 */
const wordsOf = (node: Nodes, breaksApart: boolean): string => {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return escapeMarkdownText(node.value);
  }
  if (node.type === 'break') return breaksApart ? '\\\n' : ' ';
  if (node.type === 'image') return escapeMarkdownText(node.alt ?? '');
  if (!('children' in node)) return '';
  return node.children.map((child) => wordsOf(child, breaksApart)).join('');
};

/**
 * The edit that keeps a line the migration opens, uncovers or rewrites,
 * whose first character is at or after `at` in the source, from opening a
 * block the old reading did not have: that first character, where the old
 * reading read it as typed words, written as a numeric character reference,
 * which markdown never reads as syntax of any kind. A line that opens with
 * markup the old reading did read (emphasis, a link, a code span) keeps it,
 * and its first typed punctuation is written so instead: in `[x]: y`, where
 * `[x]` is a link, the colon, which would otherwise make the line a
 * definition. Undefined where the line holds nothing to write so, or where
 * the migration already rewrites that character.
 */
const lineStartGuard = (
  source: string,
  at: number,
  { typed, linked, edits }: Context,
): Edit | undefined => {
  const newline = source.indexOf('\n', at);
  const lineEnd = newline === -1 ? source.length : newline;
  let first = at;
  while (first < lineEnd && /[ \t]/.test(source.charAt(first))) first += 1;
  const rewritten = (offset: number) =>
    edits.some(({ start, end }) => start <= offset && offset < end);
  if (first >= lineEnd || rewritten(first)) return undefined;
  let offset: number | undefined = typed.has(first) ? first : undefined;
  for (
    let next = first + 1;
    offset === undefined && next < lineEnd;
    next += 1
  ) {
    if (rewritten(next) || linked.has(next)) continue;
    if (typed.has(next) && ASCII_PUNCTUATION.test(source.charAt(next))) {
      offset = next;
    }
  }
  if (offset === undefined) return undefined;
  // The whole run of that character, as markdown reads a run of `*`, `_` or
  // backticks as one: guarding only the first would leave the rest a
  // shorter run, read differently.
  const char = String.fromCodePoint(source.codePointAt(offset) ?? 0);
  let end = offset + char.length;
  while (source.startsWith(char, end) && typed.has(end) && !rewritten(end)) {
    end += char.length;
  }
  return {
    start: offset,
    end,
    text: `&#${char.codePointAt(0)};`.repeat((end - offset) / char.length),
  };
};

/**
 * What the migration does where what it wrote would not read as the old
 * reading did, in the order it tries them, each at a cost:
 *
 * - `line start`: the first character of a line that a break opened,
 *   uncovered or rewrote is written as a numeric character reference (see
 *   `lineStartGuard`), which shows the same character but is less readable
 *   in the stored text;
 * - `emoji`: an emoji written for a shortcode is written as numeric character
 *   references, which begin and end with punctuation as the shortcode's
 *   colons did, so emphasis beside it is read as it was; the stored text
 *   then shows the codes rather than the emoji;
 * - `delimiter`: a `*` or `_` that the old reading showed as typed, right
 *   beside a link written for a bare address or an emoji, is escaped with a
 *   backslash, since the link's brackets or the emoji could otherwise make
 *   it open or close emphasis; the stored text shows the backslash;
 * - `code span`: each code span in a paragraph whose lines the breaks
 *   changed is written as its words, losing its code formatting, which the
 *   interview never drew (`code` is not among the elements
 *   `RenderMarkdown` draws for protocol text);
 * - `words`: as a last resort, a paragraph or heading the edits changed is
 *   written as the words the old reading showed in it, escaped to show as
 *   typed: every character a participant saw is kept, and its formatting
 *   (emphasis, links) is lost.
 */
type Repair = 'line start' | 'emoji' | 'delimiter' | 'code span' | 'words';

const REPAIRS: readonly Repair[] = [
  'line start',
  'emoji',
  'delimiter',
  'code span',
  'words',
];

/**
 * What `legacyMarkdownAsStandard` writes, and the repairs it needed (see
 * `Repair`).
 */
export const legacyMarkdownWritten = (
  markdown: string,
  { lines }: Readonly<{ lines: LocalizedTextLines }>,
): Readonly<{ written: string; repairs: readonly Repair[] }> => {
  const multiline = lines === 'multiple';
  const tree = legacyTree(markdown);
  const context: Context = {
    source: markdown,
    multiline,
    edits: [],
    typed: new Set(),
    linked: new Set(),
    lineStarts: [],
    codeSpans: [],
    emoji: [],
    rewritten: [],
    blocks: new Set(),
  };
  collectEdits(tree, [], context);
  // A repair takes the place of every edit it covers, and of every smaller
  // repair.
  const writtenWith = (repairs: readonly Edit[]) => {
    const covers = (repair: Edit, edit: Edit) =>
      repair !== edit &&
      repair.start < repair.end &&
      repair.start <= edit.start &&
      edit.end <= repair.end &&
      // What is inserted where a repair starts or ends stays beside it.
      (edit.start < edit.end ||
        (repair.start < edit.start && edit.start < repair.end));
    const replaced = (edit: Edit, isRepair: boolean) =>
      repairs.some(
        (repair) =>
          covers(repair, edit) &&
          (!isRepair || repair.end - repair.start > edit.end - edit.start),
      );
    return applyEdits(markdown, [
      ...context.edits.filter((edit) => !replaced(edit, false)),
      ...repairs.filter((repair) => !replaced(repair, true)),
    ]);
  };
  const expected = shownBy(
    oldReading(markdown, structuredClone(tree), multiline),
  );
  const reads = (repairs: readonly Edit[]) =>
    shownBy(markdownTree(writtenWith(repairs)));

  const written = writtenWith([]);
  if (reads([]) === expected) return { written, repairs: [] };

  const editedBlocks = [...context.blocks];
  // A `*` or `_` the old reading showed as typed, and its escape.
  const typedDelimiter = (at: number) =>
    context.typed.has(at) && /[*_]/.test(markdown.charAt(at));
  const escape = (at: number) => ({
    start: at,
    end: at + 1,
    text: `\\${markdown.charAt(at)}`,
  });
  const candidates: Record<Repair, Edit[]> = {
    'line start': [
      ...new Map(
        context.lineStarts
          .map((at) => lineStartGuard(markdown, at, context))
          .filter((guard) => guard !== undefined)
          .map((guard) => [guard.start, guard]),
      ).values(),
    ],
    'emoji': context.emoji.map(({ start, end, text }) => ({
      start,
      end,
      text: Array.from(text, (char) => `&#${char.codePointAt(0)};`).join(''),
    })),
    'delimiter': context.rewritten.flatMap(({ start, end }) => {
      const escapes: Edit[] = [];
      for (let at = start - 1; typedDelimiter(at); at -= 1) {
        escapes.push(escape(at));
      }
      for (let at = end; typedDelimiter(at); at += 1) {
        escapes.push(escape(at));
      }
      return escapes;
    }),
    'code span': context.codeSpans
      .filter(({ block }) =>
        context.lineStarts.some((at) => block.start <= at && at <= block.end),
      )
      .map(({ start, end, words }) => ({
        start,
        end,
        // A line ending in a code span is shown as a space.
        text: escapeMarkdownText(words.replace(/\r\n|\r|\n/g, ' ')),
      })),
    'words': editedBlocks.flatMap((block) => {
      const first = block.children[0]?.position?.start.offset;
      const last = block.children.at(-1)?.position?.end.offset;
      if (first === undefined || last === undefined) return [];
      const words = markdown.slice(first, last);
      const [shown] = oldReading(words, legacyTree(words), multiline).children;
      return shown === undefined
        ? []
        : [
            {
              start: first,
              end: last,
              text: wordsOf(shown, multiline && block.type !== 'heading'),
            },
          ];
    }),
  };

  // Each repair is tried in turn, cheapest first, until the result reads as
  // the old reading did; then each repair that changes nothing is left out
  // again, so that only what needs one keeps it.
  let tried: Edit[] = [];
  for (const repair of REPAIRS) {
    tried = [...tried, ...candidates[repair]];
    if (reads(tried) === expected) break;
  }
  const target = reads(tried);
  let kept = tried;
  for (const edit of tried) {
    const without = kept.filter((other) => other !== edit);
    if (reads(without) === target) kept = without;
  }
  return {
    written: writtenWith(kept),
    repairs: REPAIRS.filter((repair) =>
      candidates[repair].some((edit) => kept.includes(edit)),
    ),
  };
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
 * - a shortcode `remark-gemoji` drew as an emoji is written as the emoji;
 * - what is written is read back with the standard parser and compared
 *   with the legacy reading, blocks and inline content alike (emphasis,
 *   links and their addresses, line breaks, words); where they differ, it is
 *   repaired, at the least cost that makes them the same (see `Repair`).
 *
 * Markdown's own syntax (code, but as above, links and their addresses, addresses in angle
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
  options: Readonly<{ lines: LocalizedTextLines }>,
): string => legacyMarkdownWritten(markdown, options).written;

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
