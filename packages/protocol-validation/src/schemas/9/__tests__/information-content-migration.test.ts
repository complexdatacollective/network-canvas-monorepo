import { describe, expect, it } from 'vitest';

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
