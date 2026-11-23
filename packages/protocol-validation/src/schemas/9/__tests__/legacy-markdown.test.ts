import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { nameToEmoji } from 'gemoji';
import type { Nodes, PhrasingContent, Root } from 'mdast';
import { findAndReplace } from 'mdast-util-find-and-replace';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import { describe, expect, it } from 'vitest';

import { markdownTree } from '../../../localization/markdownTree.ts';
import {
  detectSchemaVersion,
  migrateProtocol,
} from '../../../migration/migrate-protocol.ts';
import {
  INFORMATION_PAGE_ASSETS,
  TEXT_PIECES,
  TEXTS_LEFT_OPEN,
  textItem,
} from '../../../testing/informationPages.ts';
import { collectLocalizedStringSites } from '../../../utils/collectLocalizedStrings.ts';
import { extractProtocol } from '../../../utils/extractProtocol.ts';
import {
  legacyMarkdownAsStandard,
  legacyMarkdownWritten,
} from '../legacy-markdown.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

type Lines = 'single' | 'multiple';

/**
 * The legacy reading, built here from the plugins the interview drew schema 8
 * text with rather than from the code under test: CommonMark with `>` and `<`
 * read as typed characters, GitHub's bare addresses read as links (the
 * parser's and the transform's, as `remark-gfm` runs them), `remark-gemoji`'s
 * shortcodes, and `<br>` as a line break.
 */
// Stands for a `<br>` typed as it is, which a backslash before it does not
// make one: the tag was raw HTML, which the parser never saw as words. It is
// a punctuation character, as the tag's `<` and `>` are, so emphasis beside
// it is read as it was beside the tag: `**a<br>**b` held no strong emphasis.
const TYPED_BREAK = '\u2E2E';

const legacyReading = (markdown: string, lines: Lines): Root => {
  const marked = markdown.replace(
    /(\\*)<br\s*\/?>/gi,
    (tag, backslashes: string) =>
      backslashes.length % 2 === 0 ? `${backslashes}${TYPED_BREAK}` : tag,
  );
  const tree = fromMarkdown(marked, {
    extensions: [
      { disable: { null: ['blockQuote', 'htmlFlow', 'htmlText'] } },
      gfmAutolinkLiteral(),
    ],
    mdastExtensions: [gfmAutolinkLiteralFromMarkdown()],
  });
  // A bare address is a link only where the field can hold one. Text of one
  // line holds none: the interview draws every link in it as its words (see
  // fresco-ui's `ALLOWED_MARKDOWN_LABEL_TAGS`), so a bare address there is
  // compared as its words. A link the text writes out, or an address in angle
  // brackets, is left as written and compared as the link the parser reads,
  // though in one line it too is drawn as its words.
  const bare = (node: Nodes): boolean =>
    node.type === 'link' &&
    (node.position === undefined ||
      !['<', '['].includes(marked.charAt(node.position.start.offset ?? 0)));
  findAndReplace(tree, [
    /:(\+1|[-\w]+):/g,
    (_: string, name: string) =>
      Object.hasOwn(nameToEmoji, name) ? (nameToEmoji[name] ?? false) : false,
  ]);
  const breaks = (node: Nodes, inHeading: boolean): void => {
    if (!('children' in node)) return;
    const heading = inHeading || node.type === 'heading';
    const children: Nodes[] = [];
    for (const child of node.children) {
      if (lines === 'single' && bare(child) && 'children' in child) {
        children.push(...child.children);
        continue;
      }
      if (child.type === 'code' || child.type === 'inlineCode') {
        child.value = child.value.replaceAll(TYPED_BREAK, '<br>');
      }
      if (child.type !== 'text') {
        breaks(child, heading);
        children.push(child);
        continue;
      }
      child.value.split(TYPED_BREAK).forEach((words, index) => {
        if (index > 0) {
          children.push(
            lines === 'multiple' && !heading
              ? { type: 'break' }
              : { type: 'text', value: ' ' },
          );
        }
        children.push({ type: 'text', value: words });
      });
    }
    Reflect.set(node, 'children', children);
  };
  breaks(tree, false);
  return tree;
};

/**
 * What a reading shows, ignoring what HTML rendering ignores: where each
 * node was read from, runs of white space, white space beside a line break,
 * a line break, or white space, at either end of a paragraph or heading, and
 * whether a line break that ends emphasis is inside it or just after it.
 */
const shown = (tree: Root): unknown => {
  // A line break or white space at the edge of emphasis or of a link's
  // text, moved to just outside it, and a container left holding nothing
  // left out: a reader sees no difference.
  const CONTAINERS = new Set(['emphasis', 'strong', 'link', 'linkReference']);
  const breakOutOfEmphasis = (child: Nodes): Nodes[] => {
    if (!CONTAINERS.has(child.type) || !('children' in child)) return [child];
    const children: Nodes[] = [...child.children];
    const before: Nodes[] = [];
    const after: Nodes[] = [];
    for (;;) {
      const first = children[0];
      if (first?.type === 'break') {
        before.push(first);
        children.shift();
      } else if (first?.type === 'text' && /^\s/.test(first.value)) {
        before.push({ type: 'text', value: ' ' });
        const words = first.value.trimStart();
        if (words === '') children.shift();
        else children[0] = { ...first, value: words };
      } else break;
    }
    for (;;) {
      const last = children.at(-1);
      if (last?.type === 'break') {
        after.unshift(last);
        children.pop();
      } else if (last?.type === 'text' && /\s$/.test(last.value)) {
        after.unshift({ type: 'text', value: ' ' });
        const words = last.value.trimEnd();
        if (words === '') children.pop();
        else children[children.length - 1] = { ...last, value: words };
      } else break;
    }
    const kept = children.length === 0 ? [] : [{ ...child, children } as Nodes];
    return [...before, ...kept, ...after];
  };
  const tidy = (node: Nodes): Nodes => {
    // The interview draws a code span as its words (`code` is not an
    // element it draws).
    if (node.type === 'inlineCode') return { type: 'text', value: node.value };
    if (!('children' in node)) return node;
    const merged: Nodes[] = [];
    for (const child of node.children.map(tidy).flatMap(breakOutOfEmphasis)) {
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
          (child.children as PhrasingContent[]).length === 0
        ),
    );
    return { ...node, children: kept } as Nodes;
  };
  return JSON.parse(
    JSON.stringify(tidy(structuredClone(tree)), (key, value: unknown) =>
      key === 'position' || key === 'data' ? undefined : value,
    ),
  );
};

/** Whether the standard reading of the output shows what the input showed. */
const expectSameReading = (input: string, lines: Lines) => {
  const output = legacyMarkdownAsStandard(input, { lines });
  expect(
    shown(markdownTree(output)),
    `${JSON.stringify(input)} written as ${JSON.stringify(output)}`,
  ).toEqual(shown(legacyReading(input, lines)));
};

/** Whether the standard reading of the output shows what the input showed. */
const WRITTEN = new Map<string, ReturnType<typeof legacyMarkdownWritten>>();

/**
 * What the migration writes for an input, worked out once and shared by
 * every test that reads it, so that no test's time depends on another's.
 */
const writtenOnce = (input: string, lines: Lines) => {
  const key = `${lines}\0${input}`;
  const known = WRITTEN.get(key);
  if (known !== undefined) return known;
  const written = legacyMarkdownWritten(input, { lines });
  WRITTEN.set(key, written);
  return written;
};

const readsTheSame = (input: string, lines: Lines): boolean =>
  isDeepStrictEqual(
    shown(markdownTree(writtenOnce(input, lines).written)),
    shown(legacyReading(input, lines)),
  );

/**
 * Every way a run of line breaks can be typed: one, two or three tags, in
 * each spelling, with and without spaces among them and beside them.
 */
const BREAK_RUNS: readonly string[] = [1, 2, 3].flatMap((count) =>
  ['<br>', '<br/>', '<br />'].flatMap((tag) =>
    ['', ' '].flatMap((among) =>
      ['', ' '].map(
        (beside) =>
          `${beside}${Array.from({ length: count }, () => tag).join(among)}${beside}`,
      ),
    ),
  ),
);

/** Inline containers, by what opens and what closes each. */
const CONTAINERS: readonly (readonly [string, string])[] = [
  ['*', '*'],
  ['_', '_'],
  ['**', '**'],
  ['__', '__'],
  ['***', '***'],
  ['**_', '_**'],
  ['_**', '**_'],
  ['[', '](https://example.org)'],
  ['[*', '*](https://example.org)'],
];

/** What comes before and after a container: words, nothing, another
 * container, a line that would open a block, punctuation. */
const OUTSIDE: readonly (readonly [string, string])[] = [
  ['x ', ' y'],
  ['', ''],
  ['*z* ', ' *z*'],
  ['x ', '- b'],
  ['(', ').'],
];

/** The shapes text is read in: several lines, one line, and a heading. */
const SHAPES: readonly (readonly [string, Lines, string])[] = [
  ['several lines', 'multiple', ''],
  ['one line', 'single', ''],
  ['a heading', 'multiple', '# '],
];

/**
 * Where a run of breaks sits in a container: before its closer, after its
 * opener, or alone in it.
 */
const EDGES: readonly (readonly [string, (run: string) => string])[] = [
  ['a run before a closer', (run) => `a${run}`],
  ['a run after an opener', (run) => `${run}a`],
  ['a run alone in a container', (run) => run],
];

/**
 * Words the migration rewrites, at the edge of a container: an emoji for a
 * shortcode, a link for a bare address, and an escaped angle bracket.
 */
const REWRITTEN_AT_EDGES: readonly string[] = [
  ':smile:',
  'a :smile:',
  ':smile: a',
  'see www.example.org',
  'www.example.org now',
  '<a>',
  'a >',
  '< a',
];

type Generated = readonly (readonly [string, Lines])[];

const inContainers = (
  contents: readonly string[],
  containers: readonly (readonly [string, string])[],
  [, lines, lead]: readonly [string, Lines, string],
): Generated =>
  contents.flatMap((content) =>
    containers.flatMap(([open, close]) =>
      OUTSIDE.map(
        ([before, after]) =>
          [`${lead}${before}${open}${content}${close}${after}`, lines] as const,
      ),
    ),
  );

const isLinkLabel = ([open]: readonly [string, string]) => open.startsWith('[');

/** The generated texts, grouped by the kind of edge they test. */
const EDGE_CASES: readonly (readonly [string, Generated])[] = SHAPES.flatMap(
  (shape) => [
    ...EDGES.flatMap(([edge, place]) => [
      [
        `${edge} of emphasis, in ${shape[0]}`,
        inContainers(
          BREAK_RUNS.map(place),
          CONTAINERS.filter((container) => !isLinkLabel(container)),
          shape,
        ),
      ] as const,
      [
        `${edge} of a link's label, in ${shape[0]}`,
        inContainers(
          BREAK_RUNS.map(place),
          CONTAINERS.filter(isLinkLabel),
          shape,
        ),
      ] as const,
    ]),
    [
      `an emoji, a link or an escaped bracket at an edge, in ${shape[0]}`,
      inContainers(REWRITTEN_AT_EDGES, CONTAINERS, shape),
    ] as const,
  ],
);

/**
 * What can come first on a line that the migration opens or uncovers: every
 * ASCII punctuation character, a number with each delimiter of a numbered
 * item, one to five spaces, a tab, and a letter.
 */
const LINE_OPENERS: readonly string[] = [
  ...Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'),
  '1.',
  '1)',
  ...[1, 2, 3, 4, 5].map((count) => ' '.repeat(count)),
  '\t',
  'a',
];

/** What follows the first thing on the line: a space and a word, a word, or nothing. */
const AFTER_OPENERS: readonly string[] = [' word', 'word', ''];

/**
 * Where a run of breaks leaves what follows it at the start of a line or of
 * a paragraph: after a run at the start, after one in the middle of a
 * paragraph, and after one moved out of emphasis.
 */
const LINE_START_PLACES: readonly (readonly [
  string,
  (rest: string) => string,
])[] = [
  ['after a leading run', (rest) => `<br>${rest}`],
  ['after a run in the middle of a paragraph', (rest) => `a<br>${rest}`],
  ['after a run moved out of emphasis', (rest) => `**a<br>**${rest}`],
];

/** Link reference definitions, each with the label it defines. */
const DEFINITIONS: readonly (readonly [string, string])[] = [
  ['[Contact]: https://example.org', '[Contact]'],
  ['[Contact]: <https://example.org> "title"', '[Contact]'],
  ['[^1]: note', '[^1]'],
];

/**
 * A definition after a run: at the start of text that goes on, after
 * emphasis that held only breaks, and as all the text there is; each with
 * and without the label defined before it, and used after it.
 */
const definitionsAfterRuns = (lead: string): readonly string[] =>
  DEFINITIONS.flatMap(([definition, label]) =>
    ['', `${label}: https://example.net\n\n`].flatMap((earlier) =>
      ['', `\n\nSee ${label}.`].flatMap((later) => [
        `${earlier}${lead}<br>${definition}\nand more${later}`,
        `${earlier}${lead}**<br>**${definition}${later}`,
        `${earlier}${lead}<br>${definition}${later}`,
      ]),
    ),
  );

/** Lines that change the line before them, after a run. */
const LINES_AFTER_RUNS: readonly string[] = [
  'a<br>===',
  'a<br>---',
  'a<br>| a |',
  '| a |<br>| --- |',
];

/**
 * Code spans of three to five backticks, on one line or running onto the
 * next, after a leading run and after emphasis that held only breaks, with
 * and without words after them.
 */
const CODE_SPANS_AFTER_RUNS: readonly string[] = [3, 4, 5].flatMap((count) => {
  const ticks = '`'.repeat(count);
  return [`${ticks}a${ticks}`, `${ticks}a\nb${ticks}`].flatMap((span) =>
    ['<br>', '**<br>**'].flatMap((run) =>
      ['', ' c'].map((after) => `${run}${span}${after}`),
    ),
  );
});

/** The generated texts, grouped by what is first on the line a run opens. */
const LINE_START_CASES: readonly (readonly [string, Generated])[] =
  SHAPES.flatMap(([shape, lines, lead]) => [
    ...LINE_START_PLACES.map(
      ([place, write]) =>
        [
          `each first character ${place}, in ${shape}`,
          LINE_OPENERS.flatMap((opener) =>
            AFTER_OPENERS.map(
              (after) =>
                [`${lead}${write(`${opener}${after}`)}`, lines] as const,
            ),
          ),
        ] as const,
    ),
    [
      `a definition after a run, in ${shape}`,
      definitionsAfterRuns(lead).map((text) => [text, lines] as const),
    ] as const,
    [
      `an underline or a table row after a run, in ${shape}`,
      LINES_AFTER_RUNS.map((text) => [`${lead}${text}`, lines] as const),
    ] as const,
    [
      `a code span after a run, in ${shape}`,
      CODE_SPANS_AFTER_RUNS.map((text) => [`${lead}${text}`, lines] as const),
    ] as const,
  ]);

/**
 * What the migration rewrites inside a line: an emoji for a shortcode, a
 * link for a bare address, and an escaped `<` or `>`.
 */
const REWRITTEN_WORDS: readonly (readonly [string, string])[] = [
  ['a shortcode', ':smile:'],
  ['a bare address', 'www.example.org'],
  ['a `<`', '<'],
  ['a `>`', '>'],
];

/** What can stand on the other side of something rewritten. */
const NEIGHBOURS: readonly string[] = ['x', '1', ' ', '.', ''];

/**
 * Something rewritten immediately beside each delimiter of a container:
 * before its opener, after its opener, before its closer and after its
 * closer, with each neighbour on its other side.
 */
const besideDelimiters = (
  words: string,
  [, lines, lead]: readonly [string, Lines, string],
): Generated =>
  CONTAINERS.filter(([open]) => !['**_', '_**', '[*'].includes(open)).flatMap(
    ([open, close]) =>
      NEIGHBOURS.flatMap((other) =>
        [
          `${other}${words}${open}a${close}`,
          `${open}${words}${other}a${close}`,
          `${open}a${other}${words}${close}`,
          `${open}a${close}${words}${other}`,
        ].map((text) => [`${lead}${text}`, lines] as const),
      ),
  );

/** The white space that can stand beside a run and a line ending. */
const LINE_END_SPACES: readonly string[] = ['', ' ', '  ', '   ', '\t'];

/**
 * A `<br>` beside a line ending, with each white space before the run,
 * between it and the line ending, and after the line ending; in no
 * container, in each container, and closing each container.
 */
const besideLineEnds = (
  [open, close]: readonly [string, string],
  closesAfterRun: boolean,
  [, lines, lead]: readonly [string, Lines, string],
): Generated =>
  LINE_END_SPACES.flatMap((before) =>
    LINE_END_SPACES.flatMap((between) =>
      LINE_END_SPACES.map((after) => {
        const text = closesAfterRun
          ? `${open}a${before}<br>${close}${between}\n${after}b`
          : `${open}a${before}<br>${between}\n${after}b${close}`;
        return [`${lead}${text}`, lines] as const;
      }),
    ),
  );

const INLINE_CASES: readonly (readonly [string, Generated])[] = SHAPES.flatMap(
  (shape) => [
    ...REWRITTEN_WORDS.map(
      ([name, words]) =>
        [
          `${name} beside a delimiter, in ${shape[0]}`,
          besideDelimiters(words, shape),
        ] as const,
    ),
    [
      `a run beside a line ending, in ${shape[0]}`,
      besideLineEnds(['', ''], false, shape),
    ] as const,
    ...CONTAINERS.flatMap(
      (container) =>
        [
          [
            `a run beside a line ending in ${container[0]}…${container[1]}, in ${shape[0]}`,
            besideLineEnds(container, false, shape),
          ],
          [
            `a run beside a line ending that closes ${container[0]}…${container[1]}, in ${shape[0]}`,
            besideLineEnds(container, true, shape),
          ],
        ] as const,
    ),
  ],
);

const GENERATED_CASES = [...EDGE_CASES, ...LINE_START_CASES, ...INLINE_CASES];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every markdown text of a schema 8 protocol that the migration rewrites:
 * each string in a field schema 9 declares markdown, and the texts it moves
 * into one (an Information page's text items, an introduction panel's text,
 * an Anonymisation stage's explanation), each with the lines it may hold.
 */
const legacyMarkdownTexts = (
  protocol: Record<string, unknown>,
): (readonly [string, Lines])[] => {
  const texts: (readonly [string, Lines])[] = [];
  for (const site of collectLocalizedStringSites(ProtocolSchemaV9, protocol)) {
    if (site.format === 'markdown' && typeof site.value === 'string') {
      texts.push([site.value, site.lines]);
    }
  }
  const stages = Array.isArray(protocol.stages) ? protocol.stages : [];
  for (const stage of stages.filter(isRecord)) {
    const items = Array.isArray(stage.items) ? stage.items : [];
    const nested = [
      ...items
        .filter(isRecord)
        .filter((item) => item.type === 'text')
        .map((item) => item.content),
      isRecord(stage.introductionPanel) ? stage.introductionPanel.text : '',
      isRecord(stage.explanationText) ? stage.explanationText.body : '',
    ];
    for (const text of nested) {
      if (typeof text === 'string' && text !== '') {
        texts.push([text, 'multiple']);
      }
    }
  }
  return texts;
};

/** What each legacy text is written as, in several lines and in one line. */
const CASES: readonly (readonly [string, string, string])[] = [
  ['> 5 years', '&gt; 5 years', '&gt; 5 years'],
  [
    '<IRB OR ETHICS BOARD HERE>',
    '&lt;IRB OR ETHICS BOARD HERE&gt;',
    '&lt;IRB OR ETHICS BOARD HERE&gt;',
  ],
  ['a < b > c', 'a &lt; b &gt; c', 'a &lt; b &gt; c'],
  ['A > B', 'A > B', 'A > B'],
  ['Line one<br>Line two', 'Line one\\\nLine two', 'Line one Line two'],
  ['Line one<BR/>Line two', 'Line one\\\nLine two', 'Line one Line two'],
  ['Line one <br /> Line two', 'Line one \\\n Line two', 'Line one  Line two'],
  ['a<br><br>b', 'a\\\n\\\nb', 'a b'],
  ['a<br>\nb', 'a\\\nb', 'a\nb'],
  ['<br>a<br>', 'a', 'a'],
  ['# Title<br>words', '# Title words', '# Title words'],
  ['a<br>- b', 'a\\\n&#45; b', 'a - b'],
  ['a<br>1. b', 'a\\\n&#49;. b', 'a 1. b'],
  ['a<br>## b', 'a\\\n&#35;&#35; b', 'a ## b'],
  ['- a<br>> b', '- a\\\n&gt; b', '- a > b'],
  [
    'a<br>~~~example~~~',
    'a\\\n&#126;&#126;&#126;example~~~',
    'a ~~~example~~~',
  ],
  ['a<br>+ b', 'a\\\n&#43; b', 'a + b'],
  ['a<br>1) b', 'a\\\n&#49;) b', 'a 1) b'],
  ['a<br>===', 'a\\\n&#61;&#61;&#61;', 'a ==='],
  ['a<br>#', 'a\\\n&#35;', 'a #'],
  // Breaks at the inner edge of emphasis or of a link's text are written
  // just outside it, all of them.
  ['**a<br><br>** b', '**a**\\\n\\\n b', '**a**  b'],
  ['*a <br>* b', '*a*\\\n b', '*a*  b'],
  ['x **<br> <br>a** y', 'x \\\n\\\n**a** y', 'x  **a** y'],
  [
    'see [the site <br>](https://example.org) now',
    'see [the site](https://example.org)\\\n now',
    'see [the site](https://example.org)  now',
  ],
  ['x **_a<br>_** y', 'x **_a_**\\\n y', 'x **_a_**  y'],
  ['x _**<br>a**_ y', 'x \\\n_**a**_ y', 'x  _**a**_ y'],
  // A line a run opens, uncovers or rewrites keeps the blocks it had: its
  // first character is written as a character reference where it would
  // otherwise open one, and left alone where it would not.
  [
    '<br>[Contact]: https://example.org',
    '&#91;Contact]: [https://example.org](https://example.org)',
    '&#91;Contact]: https://example.org',
  ],
  [
    '[Contact]: https://example.net\n\n<br>[Contact]: https://example.org',
    '[Contact]: https://example.net\n\n[Contact]&#58; [https://example.org](https://example.org)',
    '[Contact]: https://example.net\n\n[Contact]&#58; https://example.org',
  ],
  ['<br>**bold**', '**bold**', '**bold**'],
  // An emoji beside emphasis is written as character references, which,
  // like the shortcode's colons, begin and end with punctuation.
  ['__hello__:smile:', '__hello__&#128516;', '__hello__&#128516;'],
  [':smile:_hello_', '&#128516;_hello_', '&#128516;_hello_'],
  // A typed `_` beside a link written for an address is escaped.
  [
    '_a_www.example.org',
    '_a\\_[www.example.org](http://www.example.org)',
    '_a_www.example.org',
  ],
  // A run before a line ending is written over the spaces before it; two
  // spaces there were a line break of their own.
  ['a<br> \nb', 'a\\\nb', 'a\nb'],
  ['a<br>  \nb', 'a\\\n\\\nb', 'a  \nb'],
  ['*a<br>*  \nb', '*a*\\\n\\\nb', '*a*  \nb'],
  // A code span that would open a code block is written as its words.
  ['<br>```a\nb``` c', 'a b c', 'a b c'],
  ['#<br>a', '#\\\na', '&#35; a'],
  ['# a<br>#', '# a &#35;', '# a &#35;'],
  ['** <br> **', '** \\\n **', '**  &#42;&#42;'],
  [
    'Visit www.example.org today',
    'Visit [www.example.org](http://www.example.org) today',
    'Visit www.example.org today',
  ],
  [
    'See https://example.org.',
    'See [https://example.org](https://example.org).',
    'See https://example.org.',
  ],
  [
    'Email help@example.org',
    'Email [help@example.org](mailto:help@example.org)',
    'Email help@example.org',
  ],
  [
    'See www.example.org/*a* now',
    'See [www.example.org/\\*a](http://www.example.org/*a)* now',
    'See www.example.org/\\*a* now',
  ],
  [
    'https://example.org/`x` and *y*',
    '[https://example.org/\\`x\\`](https://example.org/`x`) and *y*',
    'https://example.org/\\`x\\` and *y*',
  ],
  [
    'www.example.org/a_b',
    '[www.example.org/a\\_b](http://www.example.org/a_b)',
    'www.example.org/a\\_b',
  ],
  [
    'https://example.org/wiki/Foo_(bar) ok',
    '[https://example.org/wiki/Foo\\_(bar)](https://example.org/wiki/Foo_\\(bar\\)) ok',
    'https://example.org/wiki/Foo\\_(bar) ok',
  ],
  ['<https://example.org>', '<https://example.org>', '<https://example.org>'],
  ['Enter `a > b`', 'Enter `a > b`', 'Enter `a > b`'],
  ['```\n<b> & <br>\n```', '```\n<b> & <br>\n```', '```\n<b> & <br>\n```'],
  [
    '[label](https://example.org)',
    '[label](https://example.org)',
    '[label](https://example.org)',
  ],
  [
    '[www.example.org](http://www.example.org)',
    '[www.example.org](http://www.example.org)',
    '[www.example.org](http://www.example.org)',
  ],
  [':smile: Welcome', '😄 Welcome', '😄 Welcome'],
  [':+1: and :thumbsup:', '👍 and 👍', '👍 and 👍'],
  [':notanemoji: text', ':notanemoji: text', ':notanemoji: text'],
  [':x:smile:', '❌smile:', '❌smile:'],
  [
    'This is ~~not~~ required',
    'This is ~~not~~ required',
    'This is ~~not~~ required',
  ],
  ['- [ ] first', '- [ ] first', '- [ ] first'],
  [
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '| a | b |\n|---|---|\n| 1 | 2 |',
  ],
  [
    'A note[^1].\n\n[^1]: Note',
    'A note[^1].\n\n[^1]: Note',
    'A note[^1].\n\n[^1]: Note',
  ],
  ['About ~5 minutes', 'About ~5 minutes', 'About ~5 minutes'],
  [
    '\\<br> and &lt;b&gt;',
    '\\<br&gt; and &lt;b&gt;',
    '\\<br&gt; and &lt;b&gt;',
  ],
  [
    "It's {name} > '{b}' <b> :smile:",
    "It's {name} > '{b}' &lt;b&gt; 😄",
    "It's {name} > '{b}' &lt;b&gt; 😄",
  ],
];

/**
 * Texts that test how the source is followed: character references side by
 * side, which each stand for a number of characters only decoding tells, and
 * a line break followed by the end of emphasis or by something else that
 * would open a block, which is read from the source whatever node it is in.
 */
const SOURCE_FOLLOWING: readonly string[] = [
  'Hello&nbsp;&nbsp;<br>world',
  'Ages&nbsp;&nbsp;\n> 5 years',
  '&#97;&#97;:smile:',
  'x&#8203;&#8203;:smile: <y>',
  '&copy;&reg; <IRB>',
  '&#x1F600;&#128512;<br>- b',
  '&lt;&gt;&amp;<br># b',
  '&nosuch;&amp;<br>1. b',
  '*a<br>* b',
  '**a<br>** b',
  '_a<br>_ b',
  '*a<br>*- b',
  '***a<br>***\n+ b',
  '*a <br>* b',
  '[a<br>](https://example.org)- b',
  'a<br>```x```',
  'a<br>```js',
  '`x`<br>> b',
  '*a*<br>> b',
];

/**
 * Addresses holding what a link's address must escape to read back as
 * itself: an `&` that looks like a character reference, a backslash,
 * parentheses, angle brackets and a space.
 */
const LINK_ADDRESSES: readonly string[] = [
  'See https://example.org/a\\b(c)&amp;d now',
  'See www.example.org/?q=&lt;x&gt; now',
  '[x](https://example.org/?q=\\&lt;)',
  '[x](<https://example.org/a b>)',
  '[x](https://example.org/a\\(b\\)c "A &amp; B")',
];

/** The inputs whose bare address is escaped in one line. */
const ESCAPED_ADDRESSES = new Set([
  'See www.example.org/*a* now',
  'https://example.org/`x` and *y*',
  'www.example.org/a_b',
  'https://example.org/wiki/Foo_(bar) ok',
]);

const fixture = (relative: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(relative, import.meta.url), 'utf8'),
  );
  if (!isRecord(parsed)) throw new Error(`${relative} is not an object`);
  return parsed;
};

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');

/**
 * Every committed protocol of schema 8 or older, each with how to load it
 * at schema 8 (undefined for one already of schema 9): the fixtures as they are, the sample Information pages in an
 * Information stage, and each `.netcanvas` file brought to schema 8 the way
 * an import does.
 */
const SCHEMA_8_SOURCES: readonly (readonly [
  string,
  () => Promise<Record<string, unknown> | undefined>,
])[] = [
  ...[
    './fixtures/eco-genetic-relationship-maps.schema-8.json',
    '../../../../../protocols/e2e/release-smoke-schema8/protocol.json',
    '../../../../../protocols/e2e/fresco-release-test/protocol.json',
    '../../../../../protocols/e2e/fresco-release-test-migration/protocol.json',
  ].map(
    (relative) =>
      [
        path.basename(path.dirname(relative)) + '/' + path.basename(relative),
        () => Promise.resolve(fixture(relative)),
      ] as const,
  ),
  [
    'the sample Information pages',
    () =>
      Promise.resolve({
        ...fixture('./fixtures/eco-genetic-relationship-maps.schema-8.json'),
        assetManifest: INFORMATION_PAGE_ASSETS,
        stages: [
          {
            id: 'information',
            type: 'Information',
            label: 'Information',
            title: 'Pieces',
            items: TEXT_PIECES.map((text, index) =>
              textItem(`item-${index}`, text),
            ),
          },
        ],
      }),
  ],
  ...['packages/protocols', 'apps/networkcanvas.com/public/protocols'].flatMap(
    (root) =>
      readdirSync(path.join(REPO_ROOT, root), { recursive: true })
        .filter((entry): entry is string => typeof entry === 'string')
        .filter((entry) => entry.endsWith('.netcanvas'))
        .map(
          (file) =>
            [
              file,
              async () => {
                const { protocol } = await extractProtocol(
                  readFileSync(path.join(REPO_ROOT, root, file)),
                );
                return detectSchemaVersion(protocol) > 8
                  ? undefined
                  : migrateProtocol(protocol, 8, { name: file });
              },
            ] as const,
        ),
  ),
];

describe('legacyMarkdownAsStandard', () => {
  describe.each([
    ['several lines', 'multiple', 1],
    ['one line', 'single', 2],
  ] as const)('in a field of %s', (_, lines, column) => {
    it.each(CASES)('writes %j as standard markdown', (...row) => {
      expect(legacyMarkdownAsStandard(row[0], { lines })).toBe(row[column]);
    });

    it.each(CASES)('shows %j as the legacy reading did', (input) => {
      expectSameReading(input, lines);
    });

    // GitHub's reading takes a backslash in a bare address as part of it,
    // so an address escaped in one line is escaped again.
    it.each(
      CASES.filter(
        ([input]) => lines === 'multiple' || !ESCAPED_ADDRESSES.has(input),
      ),
    )('leaves %j alone once it has been written', (input) => {
      const once = legacyMarkdownAsStandard(input, { lines });
      expect(legacyMarkdownAsStandard(once, { lines })).toBe(once);
    });
  });

  // A closing delimiter run cannot follow white space, a line ending
  // included, and an opening one cannot be followed by it: whatever is
  // written for a `<br>` must never be the first or last thing in emphasis.
  // And a line a `<br>` opens, uncovers or rewrites must open no block the
  // legacy reading did not have.
  it.each(GENERATED_CASES)(
    'writes %s so that it reads as it did',
    (_kind, cases) => {
      expect(
        cases.filter(([input, lines]) => !readsTheSame(input, lines)),
      ).toEqual([]);
    },
  );

  it.each(GENERATED_CASES)(
    'leaves %s alone once it has been written',
    (_kind, cases) => {
      expect(
        cases.filter(([input, lines]) => {
          // An address in one line is escaped each time (see below).
          if (lines === 'single' && input.includes('www.')) return false;
          const once = writtenOnce(input, lines).written;
          return legacyMarkdownAsStandard(once, { lines }) !== once;
        }),
      ).toEqual([]);
    },
  );

  // Writing code spans as words is the last resort, taken only where the
  // read-back check finds that guarding line starts was not enough: a code
  // span running onto a second line, uncovered at the start of a paragraph,
  // which would open a code block. Anything else taking it would be a gap in
  // the guards.
  // Each repair is taken only where the migration's own read-back finds
  // that it needs one. Writing a block as its words, the last resort, is
  // reached by no generated text, and writing code spans as words only by a
  // code span running onto a second line, uncovered at the start of a
  // paragraph, where it would open a code block. Which texts take the other
  // repairs is recorded, so that a change to it is seen.
  it.each(GENERATED_CASES)(
    'repairs %s only where it needs one',
    (kind, cases) => {
      const reaching = (repair: string) =>
        cases
          .filter(([input, lines]) =>
            writtenOnce(input, lines).repairs.includes(repair),
          )
          .map(([input, lines]) => `${lines}: ${input}`);
      expect(reaching('words')).toEqual([]);
      expect(reaching('code span')).toEqual(
        kind.startsWith('a code span after a run') && !kind.endsWith('heading')
          ? cases
              .filter(([input]) => input.includes('\n'))
              .map(([input, lines]) => `${lines}: ${input}`)
          : [],
      );
      expect({
        'line start': reaching('line start'),
        'emoji': reaching('emoji'),
        'delimiter': reaching('delimiter'),
      }).toMatchSnapshot();
    },
  );

  it.each(SOURCE_FOLLOWING)(
    'follows the source of %j character by character',
    (input) => {
      expectSameReading(input, 'multiple');
      expectSameReading(input, 'single');
    },
  );

  it.each(LINK_ADDRESSES)(
    'keeps where %j leads, and keeps it once written',
    (input) => {
      for (const lines of ['multiple', 'single'] as const) {
        expectSameReading(input, lines);
        const once = legacyMarkdownAsStandard(input, { lines });
        if (lines === 'multiple') {
          expect(legacyMarkdownAsStandard(once, { lines })).toBe(once);
        }
      }
    },
  );

  it('decodes each of two character references side by side', () => {
    expect(
      legacyMarkdownAsStandard('Hello&nbsp;&nbsp;<br>world', {
        lines: 'multiple',
      }),
    ).toBe('Hello&nbsp;&nbsp;\\\nworld');
    expect(
      legacyMarkdownAsStandard('Ages&nbsp;&nbsp;\n> 5 years', {
        lines: 'multiple',
      }),
    ).toBe('Ages&nbsp;&nbsp;\n&gt; 5 years');
    expect(
      legacyMarkdownAsStandard('&#97;&#97;:smile:', { lines: 'multiple' }),
    ).toBe('&#97;&#97;😄');
  });

  it('writes a line break that ends emphasis after the emphasis closes', () => {
    expect(legacyMarkdownAsStandard('*a<br>* b', { lines: 'multiple' })).toBe(
      '*a*\\\n b',
    );
    expect(legacyMarkdownAsStandard('*a<br>*- b', { lines: 'multiple' })).toBe(
      '*a*\\\n&#45; b',
    );
  });

  it('reads what GitHub added and nothing reads now as words or a list item', () => {
    expect(markdownTree('This is ~~not~~ required').children).toMatchObject([
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'This is ~~not~~ required' }],
      },
    ]);
    expect(markdownTree('- [ ] first').children).toMatchObject([
      {
        type: 'list',
        children: [
          {
            type: 'listItem',
            checked: null,
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: '[ ] first' }],
              },
            ],
          },
        ],
      },
    ]);
    expect(
      markdownTree('| a | b |\n|---|---|\n| 1 | 2 |').children,
    ).toMatchObject([
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '| a | b |\n|---|---|\n| 1 | 2 |' }],
      },
    ]);
    // A footnote's mark reads as a link to its note's first word, where
    // that word could be an address; a note of several words is words.
    expect(markdownTree('A note[^1].\n\n[^1]: Note').children).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'A note' },
          { type: 'linkReference', identifier: '^1' },
          { type: 'text', value: '.' },
        ],
      },
      { type: 'definition', identifier: '^1', url: 'Note' },
    ]);
    expect(
      markdownTree('A note[^1].\n\n[^1]: The note itself.').children,
    ).toMatchObject([
      { type: 'paragraph', children: [{ type: 'text', value: 'A note[^1].' }] },
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '[^1]: The note itself.' }],
      },
    ]);
  });

  it('shows every text of the sample Information pages as the legacy reading did', () => {
    for (const text of [
      ...TEXT_PIECES,
      ...TEXTS_LEFT_OPEN.map(([, open]) => open),
    ]) {
      expectSameReading(text, 'multiple');
    }
  });

  // Each protocol is its own test, so that none takes long on a slow
  // machine.
  it.each(SCHEMA_8_SOURCES)(
    'shows every markdown text the migration rewrites in %s as the legacy reading did',
    async (_name, load) => {
      const protocol = await load();
      // A protocol of schema 9 is not migrated.
      if (protocol === undefined) return;
      const texts = legacyMarkdownTexts(protocol);
      expect(texts.length).toBeGreaterThan(0);
      for (const [input, lines] of texts) expectSameReading(input, lines);
    },
  );
});
