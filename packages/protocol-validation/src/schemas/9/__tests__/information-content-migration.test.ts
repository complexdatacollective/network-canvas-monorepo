import { describe, expect, it } from 'vitest';

import { assetBlocksInMarkdown } from '../../../localization/assetBlock.ts';
import { dynamicMessageParts } from '../../../localization/dynamicValueMessages.ts';
import { markdownTree } from '../../../localization/markdownTree.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import { combineInformationContent } from '../information-content-migration.ts';
import migrationV8toV9 from '../migration.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const EN = { defaultLocale: 'en', locales: ['en'] } as const;
const EN_FR = { defaultLocale: 'en', locales: ['en', 'fr'] } as const;

type Fields = Record<string, unknown>;

const MANIFEST = {
  photo: { id: 'photo', type: 'image', name: 'photo.png', source: 'photo.png' },
  clip: { id: 'clip', type: 'video', name: 'clip.mp4', source: 'clip.mp4' },
  tune: { id: 'tune', type: 'audio', name: 'tune.mp3', source: 'tune.mp3' },
};

/** A protocol holding one Information stage, combined in place. */
const combined = (
  stage: Fields,
  { manifest = MANIFEST, localization = EN }: Fields = {},
): Fields => {
  const protocol: Fields = {
    assetManifest: manifest,
    stages: [{ id: 'info', type: 'Information', label: 'Intro', ...stage }],
  };
  combineInformationContent(protocol, localization as typeof EN);
  const [result] = protocol.stages as Fields[];
  if (result === undefined) throw new Error('No stage');
  return result;
};

const text = (id: string, content: unknown): Fields => ({
  id,
  type: 'text',
  content,
});

const asset = (id: string, content: unknown, extra: Fields = {}): Fields => ({
  id,
  type: 'asset',
  content,
  ...extra,
});

describe('combineInformationContent', () => {
  it('writes the title as a heading, then each item in order, joined by blank lines', () => {
    const stage = combined({
      title: 'Welcome',
      items: [text('a', 'First *paragraph*.'), text('b', '- one\n- two')],
    });
    expect(stage.content).toBe(
      '# Welcome\n\nFirst *paragraph*.\n\n- one\n- two',
    );
  });

  it('removes the title, the items and their ids, keeping the rest of the stage', () => {
    const stage = combined({
      title: 'Welcome',
      items: [text('a', 'Hi')],
      skipLogic: { action: 'SKIP' },
    });
    expect(stage).toEqual({
      id: 'info',
      type: 'Information',
      label: 'Intro',
      skipLogic: { action: 'SKIP' },
      content: '# Welcome\n\nHi',
    });
  });

  it('leaves text items exactly as written, markdown and all', () => {
    const body = '## Sub\n\n> quote # not escaped\n\n1. a\n2. b';
    expect(combined({ title: 'T', items: [text('a', body)] }).content).toBe(
      `# T\n\n${body}`,
    );
  });

  it('leaves out the description of a text item, which no participant saw', () => {
    const stage = combined({
      title: 'T',
      items: [{ ...text('a', 'Hi'), description: 'Note to researcher' }],
    });
    expect(stage.content).toBe('# T\n\nHi');
  });

  describe('the title', () => {
    it('is escaped to show as written', () => {
      expect(
        combined({ title: '*Hi* _there_ <y> `z`', items: [] }).content,
      ).toBe('# \\*Hi\\* \\_there\\_ &lt;y&gt; \\`z\\`');
    });

    it('does not let a trailing run of # close the heading', () => {
      expect(combined({ title: 'Chapter ##', items: [] }).content).toBe(
        '# Chapter \\##',
      );
    });

    it('collapses line breaks and runs of spaces into single spaces', () => {
      expect(
        combined({ title: '  One\n\nTwo   three ', items: [] }).content,
      ).toBe('# One Two three');
    });

    it.each(['', ' ', '\t\n', '\u00a0', '\u200b'])(
      'is left out when it is %j, leaving the items',
      (title) => {
        expect(combined({ title, items: [text('a', 'Body')] }).content).toBe(
          'Body',
        );
      },
    );

    it('is left out when it is missing', () => {
      expect(combined({ items: [text('a', 'Body')] }).content).toBe('Body');
    });
  });

  describe('text items that show nothing', () => {
    it.each(['', ' ', '\n  \n', '\u00a0', '\u200b'])(
      'are left out when they are %j',
      (blank) => {
        expect(
          combined({
            title: 'T',
            items: [text('a', blank), text('b', 'Kept'), text('c', blank)],
          }).content,
        ).toBe('# T\n\nKept');
      },
    );

    it('are left out when their content is missing', () => {
      expect(
        combined({
          title: 'T',
          items: [{ id: 'a', type: 'text' }, text('b', 'K')],
        }).content,
      ).toBe('# T\n\nK');
    });
  });

  describe('a text item that leaves something open', () => {
    // Schema 8 drew each item alone, so what one left open ended with it.
    // Each case is what the item is closed with; without it the image below
    // is read as part of the item, and is no block.
    it.each([
      ['an HTML comment', '<!-- note: check wording', '-->'],
      ['a code block fenced with backticks', '```\ncode', '```'],
      ['a code block with a longer fence', '````\ncode', '````'],
      ['a code block fenced with tildes', '~~~\ncode', '~~~'],
      ['a pre element', '<pre>\nkept as typed', '</pre>'],
      ['a processing instruction', '<?php echo 1', '?>'],
    ])(
      'closes %s, so the items below it are still shown',
      (_what, open, close) => {
        const { content } = combined({
          title: 'T',
          items: [
            text('a', open),
            text('b', 'Welcome to the study.'),
            asset('c', 'photo', { description: 'Map' }),
          ],
        });
        expect(content).toBe(
          `# T\n\n${open}\n${close}\n\nWelcome to the study.\n\n![Map](asset:photo)`,
        );
        expect(
          assetBlocksInMarkdown(content as string).map(({ block }) => block),
        ).toEqual([{ assetId: 'photo', description: 'Map' }]);
      },
    );

    it('leaves an item that closes what it opens as it is', () => {
      const closed = '```\ncode\n```\n\n<!-- note -->';
      expect(
        combined({
          title: 'T',
          items: [text('a', closed), asset('c', 'photo')],
        }).content,
      ).toBe(`# T\n\n${closed}\n\n![](asset:photo)`);
    });

    it('closes each language of an item already in schema 9 form', () => {
      expect(
        combined(
          {
            title: { en: 'T', fr: 'T' },
            items: [
              text('a', { en: '<!-- note', fr: 'Bonjour' }),
              asset('c', 'photo'),
            ],
          },
          { localization: EN_FR },
        ).content,
      ).toEqual({
        en: '# T\n\n<!-- note\n-->\n\n![](asset:photo)',
        fr: '# T\n\nBonjour\n\n![](asset:photo)',
      });
    });

    // The interview reads a page's raw HTML and its markdown as one HTML
    // document, where an element left open holds what follows, and a link
    // or emphasis left open is opened again in every block below. Each item
    // is ended where the parser read it as it read alone; the interview
    // package checks the pages these give are drawn as the items were.
    describe('raw HTML', () => {
      const page = (...items: string[]): unknown =>
        combined({
          items: items.map((content, index) => text(`t${index}`, content)),
        }).content;

      it.each([
        [
          'a link, after its last words',
          '<a href="https://example.com">First',
          '<a href="https://example.com">First</a>',
        ],
        [
          'bold and italics, innermost first',
          'Read <strong>this <em>now',
          'Read <strong>this <em>now</em></strong>',
        ],
        ['a heading, in its own HTML', '<h2>A heading', '<h2>A heading</h2>'],
        [
          'a list, in its own HTML',
          '<ul><li>A raw list',
          '<ul><li>A raw list</li></ul>',
        ],
        ['a paragraph, in its own HTML', '<p>Raw', '<p>Raw</p>'],
        [
          'emphasis the blocks below were drawn inside, after them',
          '<em>First\n\nand second',
          '<em>First\n\nand second\n\n</em>',
        ],
        [
          'a raw block the markdown below was drawn inside, after it',
          '<div>\n\nInside',
          '<div>\n\nInside\n\n</div>',
        ],
        [
          'several ends after the item, behind an empty comment that makes them HTML',
          '<strong>a <em>b\n\nc',
          '<strong>a <em>b\n\nc\n\n<!----></em></strong>',
        ],
      ])('ends %s', (_what, open, ended) => {
        expect(page(open, 'Second')).toBe(`${ended}\n\nSecond`);
      });

      it.each([
        ['an element its paragraph ends', '<span>Inline'],
        [
          'what it closes itself',
          'Some <em>words</em> and <a href="x">a link</a>',
        ],
        ['a void element', 'A<br>break'],
      ])('leaves %s as written', (_what, written) => {
        expect(page(written, 'Second')).toBe(`${written}\n\nSecond`);
      });
    });

    it('drops the spaces an item opens with, which below a list would make it part of the last item', () => {
      const { content } = combined({
        title: 'T',
        items: [text('a', '- one\n- two'), text('b', '\n  After the list.')],
      });
      expect(content).toBe('# T\n\n- one\n- two\n\nAfter the list.');
    });
  });

  // Schema 8 drew each text item by itself. One text reads some things
  // across the whole of it, so items written one after another can read
  // differently from how each read alone.
  describe('text items that would read differently joined', () => {
    const page = (...items: string[]): unknown =>
      combined({
        title: 'T',
        items: items.map((content, index) =>
          content === '@photo'
            ? asset(`a${index}`, 'photo')
            : text(`t${index}`, content),
        ),
      }).content;

    it('keeps two numbered lists apart, so the second starts again at 1', () => {
      expect(
        page(
          '1. First instruction\n2. Second instruction',
          '1. First question\n2. Second question',
        ),
      ).toBe(
        '# T\n\n1. First instruction\n2. Second instruction\n\n1) First question\n2) Second question',
      );
    });

    it('keeps bulleted lists apart, however many follow one another', () => {
      expect(page('- a\n- b', '- c', '- d')).toBe(
        '# T\n\n- a\n- b\n\n* c\n\n- d',
      );
    });

    it('leaves lists with a file between them as they were written', () => {
      expect(page('* a', '@photo', '* b')).toBe(
        '# T\n\n* a\n\n![](asset:photo)\n\n* b',
      );
    });

    it('leaves lists of different kinds as they were written', () => {
      expect(page('* a', '1. b', '+ c')).toBe('# T\n\n* a\n\n1. b\n\n+ c');
    });

    it('writes each item’s links with the address its own label gave', () => {
      expect(
        page(
          'See the [policy].\n\n[policy]: https://example.com/privacy "Privacy"',
          'Sign the [policy][].\n\n[policy]: https://example.com/consent',
        ),
      ).toBe(
        '# T\n\nSee the [policy](https://example.com/privacy "Privacy").\n\nSign the [policy](https://example.com/consent).',
      );
    });

    it('keeps words in brackets as words when another item uses them as a label', () => {
      expect(
        page(
          'A literal [note] here.',
          'A linked [note].\n\n[note]: https://example.com/a',
        ),
      ).toBe(
        '# T\n\nA literal \\[note] here.\n\nA linked [note](https://example.com/a).',
      );
    });

    it('writes an image named by a label with its address', () => {
      expect(
        page(
          '![One][pic]\n\n[pic]: https://example.com/1.png',
          '![Two][pic]\n\n[pic]: https://example.com/2.png',
        ),
      ).toBe(
        '# T\n\n![One](https://example.com/1.png)\n\n![Two](https://example.com/2.png)',
      );
    });

    it('reads a label an item defines twice as its first address, as markdown does', () => {
      expect(
        page(
          'A [label].\n\n[label]: https://example.com/first\n\n[label]: https://example.com/second',
          'A [label] too.\n\n[label]: https://example.com/third',
        ),
      ).toBe(
        '# T\n\nA [label](https://example.com/first).\n\nA [label](https://example.com/third) too.',
      );
    });

    it('writes the heading and the files as it always does, whatever the text between them needs', () => {
      const file = asset('f', 'tune', {
        description: 'A *loud* [tune] & more',
      });
      const alone = combined({ title: 'T # 1 *', items: [file] }).content;
      if (typeof alone !== 'string') throw new Error('No content');
      const [heading, block] = alone.split('\n\n');

      expect(
        combined({
          title: 'T # 1 *',
          items: [text('a', '- a'), text('b', '- b'), file, text('c', '- c')],
        }).content,
      ).toBe(`${heading}\n\n- a\n\n* b\n\n${block}\n\n- c`);
    });

    it('gives each item’s footnotes labels of their own', () => {
      expect(
        page('One[^1]\n\n[^1]: First note', 'Two[^1]\n\n[^1]: Second note'),
      ).toBe(
        '# T\n\nOne[^2-1]\n\n[^2-1]: First note\n\nTwo[^3-1]\n\n[^3-1]: Second note',
      );
    });

    it('keeps code written by indenting it out of the list above it', () => {
      expect(page('- item', '    typed as code')).toBe(
        '# T\n\n- item\n\n```\ntyped as code\n```',
      );
    });

    it('leaves a page that reads the same joined exactly as it was written', () => {
      const items = [
        '_emphasis_ and __strong__\n\n* a list\n* of two',
        'A [link][home] and its label.\n\n[home]: https://example.com',
        'Setext heading\n---\n\n    indented code',
        '1) numbered',
      ];
      expect(page(...items)).toBe(`# T\n\n${items.join('\n\n')}`);
    });

    // What a text is read as: every block and what it holds, with a link's
    // address wherever its label was defined in that text. Written apart
    // from the migration's own check, which it is here to check.
    const outline = (markdown: string): string[] => {
      const tree = markdownTree(markdown);
      const addresses = new Map<string, string>();
      const lines: string[] = [];
      const visit = (node: unknown, depth: number, collect: boolean) => {
        if (typeof node !== 'object' || node === null) return;
        const { type, identifier, url, value, ordered, start, children } =
          node as Record<string, unknown>;
        if (collect) {
          if (type === 'definition' && !addresses.has(String(identifier))) {
            addresses.set(String(identifier), String(url));
          }
        } else if (type !== 'definition') {
          const reference =
            type === 'linkReference' || type === 'imageReference';
          const kind =
            type === 'linkReference'
              ? 'link'
              : type === 'imageReference'
                ? 'image'
                : String(type);
          const address = reference
            ? addresses.get(String(identifier))
            : type === 'footnoteReference' || type === 'footnoteDefinition'
              ? undefined
              : url;
          lines.push(
            `${'  '.repeat(depth)}${kind} ${JSON.stringify({
              address,
              // HTML left open is closed, and shows nothing either way.
              value: type === 'html' ? undefined : value,
              ordered,
              start,
            })}`,
          );
        }
        if (Array.isArray(children)) {
          for (const child of children) visit(child, depth + 1, collect);
        }
      };
      for (const child of tree.children) visit(child, 0, true);
      for (const child of tree.children) visit(child, 0, false);
      return lines;
    };

    // Each is something one text reads across the whole of it, or that the
    // text before it can change the reading of.
    const PIECES = [
      'A paragraph.',
      '- a\n- b',
      '* a\n\n* b',
      '+ a',
      '1. a\n2. b',
      '1) a',
      '3. third',
      '- a\n  - nested\n\n  second paragraph',
      'Uses [label] and [other][label].\n\n[label]: https://example.com/one',
      'Says [label] and means it.',
      '[label]: https://example.com/two "Two"\n\nAnother [label].',
      '![picture][label]\n\n[label]: https://example.com/three.png',
      '    indented code',
      '```\nfenced and left open',
      '<!-- a comment left open',
      '> a quotation',
      'Heading\n===',
      '---',
      '| a | b |\n| - | - |\n| 1 | 2 |',
      '- [ ] a task',
      '~~struck~~ and www.example.com',
      'Line one  \nline two\\\nline three',
      'A note[^1].\n\n[^1]: The note, with a [label].',
    ];

    it('reads every pair of items, joined, as each read alone', () => {
      for (const first of PIECES) {
        for (const second of PIECES) {
          const content = page(first, second);
          if (typeof content !== 'string') throw new Error('No content');
          expect(
            outline(content),
            `${JSON.stringify(first)} then ${JSON.stringify(second)} gave ${JSON.stringify(content)}`,
          ).toEqual([
            ...outline('# T'),
            ...outline(page(first) === undefined ? '' : first),
            ...outline(second),
          ]);
        }
      }
    });

    it('reads three of a kind in a row as three', () => {
      for (const piece of ['- a', '1. a', '1) a\n2) b', '* a\n\n- b']) {
        const content = page(piece, piece, piece);
        if (typeof content !== 'string') throw new Error('No content');
        expect(outline(content), JSON.stringify(content)).toEqual([
          ...outline('# T'),
          ...outline(piece),
          ...outline(piece),
          ...outline(piece),
        ]);
      }
    });
  });

  describe('a page with nothing left', () => {
    it('takes the stage label as its heading', () => {
      expect(
        combined({ title: ' ', items: [text('a', ' ')], label: 'Intro screen' })
          .content,
      ).toBe('# Intro screen');
    });

    it('does so with no items at all, escaping the label', () => {
      expect(
        combined({ title: '', items: [], label: '*Big* news' }).content,
      ).toBe('# \\*Big\\* news');
    });

    it('is left without content when the label says nothing either', () => {
      const stage = combined({ title: '', items: [], label: ' ' });
      expect(stage).not.toHaveProperty('content');
    });
  });

  describe('asset items', () => {
    const blocksOf = (items: Fields[], title = 'T') =>
      combined({ title, items }).content;

    it('become a block naming the file, with the description as its alternative text', () => {
      expect(blocksOf([asset('a', 'photo', { description: 'A map' })])).toBe(
        '# T\n\n![A map](asset:photo)',
      );
    });

    it('write no description when there is none or it says nothing', () => {
      expect(blocksOf([asset('a', 'photo')])).toBe('# T\n\n![](asset:photo)');
      expect(blocksOf([asset('a', 'photo', { description: '  ' })])).toBe(
        '# T\n\n![](asset:photo)',
      );
    });

    it('escape a description and collapse its line breaks', () => {
      expect(
        blocksOf([asset('a', 'photo', { description: 'A [b]\n*c*' })]),
      ).toBe('# T\n\n![A \\[b\\] \\*c\\*](asset:photo)');
    });

    it.each([
      ['SMALL', 'small'],
      ['MEDIUM', 'medium'],
      ['LARGE', 'large'],
    ])('writes the size %s of an image as %s', (size, lower) => {
      expect(blocksOf([asset('a', 'photo', { size })])).toBe(
        `# T\n\n![](asset:photo?size=${lower})`,
      );
    });

    it('writes the size of a video, and leaves out a size it does not know', () => {
      expect(blocksOf([asset('a', 'clip', { size: 'LARGE' })])).toBe(
        '# T\n\n![](asset:clip?size=large)',
      );
      expect(blocksOf([asset('a', 'clip', { size: 'HUGE' })])).toBe(
        '# T\n\n![](asset:clip)',
      );
    });

    it('writes a video with no loop setting, since a block repeats unless it says otherwise', () => {
      expect(blocksOf([asset('a', 'clip')])).toBe('# T\n\n![](asset:clip)');
    });

    it('writes an audio recording that starts at the start of the line and plays once, with no size', () => {
      expect(blocksOf([asset('a', 'tune', { size: 'LARGE' })])).toBe(
        '# T\n\n![](asset:tune?align=start&loop=false)',
      );
    });

    it('writes an image with no loop and no align setting', () => {
      expect(blocksOf([asset('a', 'photo')])).not.toMatch(/loop|align/);
    });

    it('leaves out an item naming a file missing from the manifest', () => {
      expect(
        blocksOf([
          asset('a', 'gone', { size: 'SMALL', description: 'Lost' }),
          text('c', 'Kept'),
        ]),
      ).toBe('# T\n\nKept');
    });

    it('leaves out an item naming a property every object has', () => {
      expect(blocksOf([asset('a', 'constructor'), text('c', 'Kept')])).toBe(
        '# T\n\nKept',
      );
    });

    it('leaves out every file of a page with no manifest at all', () => {
      expect(
        combined(
          { title: 'T', items: [asset('a', 'photo')] },
          { manifest: null },
        ).content,
      ).toBe('# T');
    });

    it('leaves out an item naming no file', () => {
      expect(
        blocksOf([asset('a', ''), asset('b', undefined), text('c', 'Kept')]),
      ).toBe('# T\n\nKept');
    });

    it('keeps an asset id that needs encoding', () => {
      expect(
        combined(
          { title: 'T', items: [asset('a', 'my photo (1)')] },
          {
            manifest: {
              'my photo (1)': { id: 'my photo (1)', type: 'image' },
            },
          },
        ).content,
      ).toBe('# T\n\n![](asset:my%20photo%20%281%29)');
    });

    it('puts blocks and paragraphs in the order the items were', () => {
      expect(
        blocksOf([text('a', 'One'), asset('b', 'photo'), text('c', 'Two')]),
      ).toBe('# T\n\nOne\n\n![](asset:photo)\n\nTwo');
    });
  });

  describe('a page already in schema 9 form', () => {
    it('is joined for each language any part has', () => {
      const stage = combined(
        {
          title: { en: 'Welcome', fr: 'Bienvenue' },
          items: [
            text('a', { en: 'Hello', fr: 'Bonjour' }),
            asset('b', 'photo', {
              description: { en: 'A map', fr: 'Une carte' },
            }),
          ],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: '# Welcome\n\nHello\n\n![A map](asset:photo)',
        fr: '# Bienvenue\n\nBonjour\n\n![Une carte](asset:photo)',
      });
    });

    it('reads a language a part lacks as the default language', () => {
      const stage = combined(
        {
          title: { en: 'Welcome', fr: 'Bienvenue' },
          items: [text('a', { en: 'Hello' })],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: '# Welcome\n\nHello',
        fr: '# Bienvenue\n\nHello',
      });
    });

    it('reads a language neither the part nor the default has as whichever the part has', () => {
      const stage = combined(
        {
          title: { en: 'Welcome', fr: 'Bienvenue' },
          items: [text('a', { de: 'Hallo' })],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: '# Welcome\n\nHallo',
        fr: '# Bienvenue\n\nHallo',
        de: '# Welcome\n\nHallo',
      });
    });

    it("reads a language a part lacks as that language's closest relative", () => {
      const stage = combined(
        {
          title: { 'en': 'Welcome', 'fr-CA': 'Bienvenue' },
          items: [text('a', { en: 'Hello', fr: 'Bonjour' })],
        },
        {
          localization: { defaultLocale: 'en', locales: ['en', 'fr', 'fr-CA'] },
        },
      );
      expect(stage.content).toEqual({
        'en': '# Welcome\n\nHello',
        'fr': '# Bienvenue\n\nBonjour',
        'fr-CA': '# Bienvenue\n\nBonjour',
      });
    });

    it('reads a part with neither the language nor the default in its first language by tag', () => {
      const stage = combined(
        {
          title: { en: 'Welcome' },
          items: [text('a', { es: 'Hola', de: 'Hallo' })],
        },
        { localization: { defaultLocale: 'en', locales: ['en', 'de', 'es'] } },
      );
      expect(stage.content).toEqual({
        en: '# Welcome\n\nHallo',
        es: '# Welcome\n\nHola',
        de: '# Welcome\n\nHallo',
      });
    });

    it('leaves out the translations of a part that show nothing', () => {
      const stage = combined(
        {
          title: { en: 'Welcome', fr: '  ' },
          items: [
            text('a', { en: ' ', fr: ' ' }),
            text('b', { en: 'Hi', fr: 'Salut' }),
          ],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: '# Welcome\n\nHi',
        fr: '# Welcome\n\nSalut',
      });
    });

    it('writes the heading of a message as plain text escaped as markdown', () => {
      const stage = combined(
        { title: { en: '*Hi*' }, items: [] },
        { localization: EN },
      );
      expect(stage.content).toEqual({ en: '# \\*Hi\\*' });
    });

    it('keeps a value a message shows, in every language it holds', () => {
      const stage = combined(
        {
          title: { en: 'Hi {name}', fr: 'Salut {name}' },
          items: [
            asset('a', 'tune', { description: { en: 'Song for {name}' } }),
          ],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: '# Hi {name}\n\n![Song for {name}](asset:tune?align=start&loop=false)',
        fr: '# Salut {name}\n\n![Song for {name}](asset:tune?align=start&loop=false)',
      });
    });

    // What a participant reads: the page with its values filled in, as the
    // interview reads it (see `dynamicMessageParts`). A number is a plural's
    // count; any other value a select's case.
    describe('shows the words of a message as written around its values', () => {
      const shown = (
        message: unknown,
        values: Record<string, string | number> = {},
      ) =>
        dynamicMessageParts(String(message), 'en', (name) => {
          const value = values[name];
          if (value === undefined) return { missing: true };
          return typeof value === 'number'
            ? { missing: false, count: value }
            : { missing: false, case: value };
        })
          .map((part) =>
            typeof part === 'string' ? part : String(values[part.argument]),
          )
          .join('');
      const page = (title: unknown, items: unknown[] = []) =>
        (combined({ title, items }).content as Record<string, string>).en;

      it("shows a plural's count as the number, and escapes its words", () => {
        const content = page({
          en: '{count, plural, one {# *new* item} other {# items}}',
        });
        expect(shown(content, { count: 1 })).toBe('# 1 \\*new\\* item');
        expect(shown(content, { count: 3 })).toBe('# 3 items');
      });

      it('escapes two tildes on either side of a value', () => {
        expect(shown(page({ en: '~{name}~' }), { name: 'Ana' })).toBe(
          '# \\~Ana\\~',
        );
      });

      it('does not let a run of # ending a version close the heading', () => {
        expect(
          shown(page({ en: '{n, select, other {Chapter ##}}' }), { n: 'x' }),
        ).toBe('# Chapter \\##');
        expect(shown(page({ en: '#' }))).toBe('# \\#');
      });

      it("shows a description's count as the number", () => {
        const content = page({ en: 'T' }, [
          asset('a', 'photo', {
            description: {
              en: '{count, plural, one {# photo} other {# photos}} [draft]',
            },
          }),
        ]);
        expect(
          assetBlocksInMarkdown(shown(content, { count: 3 }))[0]?.block
            .description,
        ).toBe('3 photos [draft]');
      });
    });

    it('writes a title of only # as a heading that shows it', () => {
      const stage = combined({ title: '##', items: [] });
      expect(markdownTree(String(stage.content)).children[0]).toMatchObject({
        type: 'heading',
        children: [{ value: '##' }],
      });
    });

    it('mixes a part written as one string with parts in several languages', () => {
      const stage = combined(
        {
          title: 'Plain {braces}',
          items: [text('a', { en: 'Hello', fr: 'Bonjour' })],
        },
        { localization: EN_FR },
      );
      expect(stage.content).toEqual({
        en: "# Plain '{'braces'}'\n\nHello",
        fr: "# Plain '{'braces'}'\n\nBonjour",
      });
    });
  });

  describe('a stage that already has content', () => {
    it('is left untouched', () => {
      const stage = combined({
        content: { en: '# Done' },
        title: 'Old',
        items: [],
      });
      expect(stage).toEqual({
        id: 'info',
        type: 'Information',
        label: 'Intro',
        content: { en: '# Done' },
        title: 'Old',
        items: [],
      });
    });

    it('is left untouched even when its content is a string', () => {
      expect(combined({ content: 'Written' }).content).toBe('Written');
    });
  });

  it('leaves a stage with neither title nor items, and other stage types, alone', () => {
    const protocol: Fields = {
      stages: [
        { id: 'a', type: 'Information', label: 'A' },
        { id: 'b', type: 'Sociogram', title: 'T', items: [] },
      ],
    };
    const before = structuredClone(protocol);
    combineInformationContent(protocol, EN);
    expect(protocol).toEqual(before);
  });

  it('does nothing to a document that is not a protocol', () => {
    expect(() => combineInformationContent(undefined, EN)).not.toThrow();
    expect(() => combineInformationContent({ stages: 3 }, EN)).not.toThrow();
  });

  it('is idempotent', () => {
    const protocol: Fields = {
      assetManifest: MANIFEST,
      stages: [
        {
          id: 'info',
          type: 'Information',
          label: 'Intro',
          title: 'Hello *you*',
          items: [
            text('a', 'Body'),
            asset('b', 'tune', { description: 'Song' }),
          ],
        },
      ],
    };
    combineInformationContent(protocol, EN);
    const once = structuredClone(protocol);
    combineInformationContent(protocol, EN);
    expect(protocol).toEqual(once);
  });
});

describe('through the whole 8 to 9 migration', () => {
  const schema8 = (stage: Fields, manifest: Fields = MANIFEST) => {
    const document = asSchema8Protocol(createBaseProtocol());
    return {
      ...document,
      assetManifest: manifest,
      stages: [
        ...document.stages,
        { id: 'info', type: 'Information', label: 'Intro', ...stage },
      ],
    };
  };

  const infoStage = (document: unknown): Fields | undefined => {
    const stage = migrateProtocol(document, 9).stages.find(
      ({ id }) => id === 'info',
    );
    return stage === undefined ? undefined : { ...stage };
  };

  it('writes a valid page with a heading, text, an image, a video and audio', () => {
    const stage = infoStage(
      schema8({
        title: 'Welcome',
        items: [
          text('t', 'Some text.'),
          asset('i', 'photo', { description: 'A map', size: 'MEDIUM' }),
          asset('v', 'clip', { size: 'SMALL' }),
          asset('s', 'tune', { description: 'A song' }),
        ],
      }),
    );
    expect(stage?.content).toEqual({
      en: [
        '# Welcome',
        'Some text.',
        '![A map](asset:photo?size=medium)',
        '![](asset:clip?size=small)',
        '![A song](asset:tune?align=start&loop=false)',
      ].join('\n\n'),
    });
    expect(stage).not.toHaveProperty('title');
    expect(stage).not.toHaveProperty('items');
  });

  it('escapes message syntax in the text it records', () => {
    const stage = infoStage(
      schema8({ title: "It's {here}", items: [text('t', "Don't {panic}")] }),
    );
    expect(stage?.content).toEqual({
      en: "# It's '{'here'}'\n\nDon't '{'panic'}'",
    });
  });

  it('writes a title with a trailing # so that it shows', () => {
    const stage = infoStage(
      schema8({ title: 'Chapter #', items: [text('t', 'x')] }),
    );
    expect(stage?.content).toEqual({ en: '# Chapter \\#\n\nx' });
  });

  it('gives a page with nothing the stage name as its heading', () => {
    const stage = infoStage(schema8({ title: ' ', items: [text('t', '  ')] }));
    expect(stage?.content).toEqual({ en: '# Intro' });
  });

  it('migrates a page whose item names no file to a page without the block', () => {
    const stage = infoStage(
      schema8({ title: 'T', items: [asset('a', ''), text('t', 'Kept')] }),
    );
    expect(stage?.content).toEqual({ en: '# T\n\nKept' });
  });

  it('migrates a page with no items', () => {
    expect(
      infoStage(schema8({ title: 'Only a heading', items: [] }))?.content,
    ).toEqual({ en: '# Only a heading' });
  });

  it('migrates a page whose item names a file missing from the manifest, without the item', () => {
    const stage = infoStage(
      schema8({ title: 'T', items: [asset('a', 'gone'), text('t', 'Kept')] }),
    );
    expect(stage?.content).toEqual({ en: '# T\n\nKept' });
  });

  it('migrates a page whose item names a file a page cannot show, without the item', () => {
    const stage = infoStage(
      schema8(
        { title: 'T', items: [asset('a', 'data'), text('t', 'Kept')] },
        {
          data: {
            id: 'data',
            type: 'network',
            name: 'd.csv',
            source: 'd.csv',
          },
        },
      ),
    );
    expect(stage?.content).toEqual({ en: '# T\n\nKept' });
  });

  it('gives one result when its output is migrated again', () => {
    const migrated = migrateProtocol(
      schema8({
        title: 'Welcome',
        items: [text('t', 'Hi'), asset('s', 'tune', { description: 'Song' })],
      }),
      9,
    );
    const { schemaVersion: _version, ...again } = migrated;
    const second = migrationV8toV9.migrate(
      ProtocolSchemaV8.parse({ ...again, schemaVersion: 8 }),
      {},
    );
    const stages = second.stages as Fields[];
    expect(stages.find((stage) => stage.id === 'info')).toEqual(
      migrated.stages.find((stage) => stage.id === 'info'),
    );
  });
});
