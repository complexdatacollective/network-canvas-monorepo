import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
import { legacyMarkdownAsStandard } from '../legacy-markdown.ts';
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
// make one: the tag was raw HTML, which the parser never saw as words.
const TYPED_BREAK = '\uE00B';

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
  // A line break or white space ending emphasis, moved to just after it.
  const breakOutOfEmphasis = (child: Nodes): Nodes[] => {
    if (child.type !== 'emphasis' && child.type !== 'strong') return [child];
    const last = child.children.at(-1);
    if (last?.type === 'break') {
      return [
        ...breakOutOfEmphasis({
          ...child,
          children: child.children.slice(0, -1),
        }),
        { type: 'break' },
      ];
    }
    if (last?.type === 'text' && /\s$/.test(last.value)) {
      const words = last.value.trimEnd();
      return [
        ...breakOutOfEmphasis({
          ...child,
          children: [
            ...child.children.slice(0, -1),
            ...(words === '' ? [] : [{ ...last, value: words }]),
          ],
        }),
        { type: 'text', value: ' ' },
      ];
    }
    return [child];
  };
  const tidy = (node: Nodes): Nodes => {
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
  ['a<br>- b', 'a\\\n\\- b', 'a - b'],
  ['a<br>1. b', 'a\\\n1\\. b', 'a 1. b'],
  ['a<br>## b', 'a\\\n\\## b', 'a ## b'],
  ['- a<br>> b', '- a\\\n&gt; b', '- a > b'],
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
      '*a*\\\n\\- b',
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

  it(
    'shows every markdown text the migration rewrites in the schema 8 fixtures as the legacy reading did',
    { timeout: 120_000 },
    async () => {
      const fixture = (relative: string): Record<string, unknown> => {
        const parsed: unknown = JSON.parse(
          readFileSync(new URL(relative, import.meta.url), 'utf8'),
        );
        if (!isRecord(parsed)) throw new Error(`${relative} is not an object`);
        return parsed;
      };
      const protocols: Record<string, unknown>[] = [
        fixture('./fixtures/eco-genetic-relationship-maps.schema-8.json'),
        fixture(
          '../../../../../protocols/e2e/release-smoke-schema8/protocol.json',
        ),
        fixture(
          '../../../../../protocols/e2e/fresco-release-test/protocol.json',
        ),
        fixture(
          '../../../../../protocols/e2e/fresco-release-test-migration/protocol.json',
        ),
        {
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
        },
      ];
      // Every committed protocol of schema 8 or older, brought to schema 8 the
      // way an import does.
      const repoRoot = path.resolve(import.meta.dirname, '../../../../../..');
      for (const root of [
        'packages/protocols',
        'apps/networkcanvas.com/public/protocols',
      ]) {
        const files = readdirSync(path.join(repoRoot, root), {
          recursive: true,
        })
          .filter((entry): entry is string => typeof entry === 'string')
          .filter((entry) => entry.endsWith('.netcanvas'));
        for (const file of files) {
          const { protocol } = await extractProtocol(
            readFileSync(path.join(repoRoot, root, file)),
          );
          if (detectSchemaVersion(protocol) > 8) continue;
          protocols.push(migrateProtocol(protocol, 8, { name: file }));
        }
      }
      const texts = protocols.flatMap(legacyMarkdownTexts);
      expect(texts.length).toBeGreaterThan(500);
      for (const [input, lines] of texts) expectSameReading(input, lines);
    },
  );
});
