import { describe, expect, it } from 'vitest';

import { testId, withTestIds } from '../../../__tests__/testIds.ts';
import { localizedTextShapeAt } from '../../../utils/collectLocalizedStrings.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { informationStage } from '../stages/information.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type Fields = Record<string, unknown>;

const withManifest = (protocol: ReturnType<typeof completeProtocol>) => ({
  ...withTestIds(protocol),
  assetManifest: {
    ...protocol.assetManifest,
    clip: { id: 'clip', type: 'video', name: 'c.mp4', source: 'c.mp4' },
    tune: { id: 'tune', type: 'audio', name: 't.mp3', source: 't.mp3' },
  },
});

const informationIndex = (protocol: ReturnType<typeof completeProtocol>) =>
  (protocol.stages as Fields[]).findIndex(
    (stage) => stage.id === testId('information'),
  );

/** The complete protocol with the Information page set to the given content. */
const issuesWith = (content: Record<string, string>, locales = ['en']) => {
  const protocol = withManifest(completeProtocol());
  const index = informationIndex(protocol);
  const stages = protocol.stages as Fields[];
  stages[index] = { ...stages[index], content };
  const document = {
    ...protocol,
    localization: { defaultLocale: 'en', locales },
  };
  const result = ProtocolSchemaV9.safeParse(document);
  return {
    index,
    issues: result.success
      ? []
      : result.error.issues.map(({ path, message }) => ({ path, message })),
  };
};

describe('files shown as blocks in an Information page', () => {
  it('accepts blocks naming an image, a video and an audio recording', () => {
    expect(
      issuesWith({
        en: '# T\n\n![](asset:img)\n\n![](asset:clip?size=large)\n\n![](asset:tune?align=start&loop=false)',
      }).issues,
    ).toEqual([]);
  });

  it('reports a file that is not in the manifest, at the translation', () => {
    const { index, issues } = issuesWith({ en: '# T\n\n![](asset:gone)' });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message:
          'This text shows the file "gone", which is not an asset in the manifest.',
      },
    ]);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty'])(
    'reports "%s" as a file not in the manifest, not one every object inherits',
    (assetId) => {
      const { index, issues } = issuesWith({
        en: `# T\n\n![](asset:${assetId})`,
      });
      expect(issues).toEqual([
        {
          path: ['stages', index, 'content', 'en'],
          message: `This text shows the file "${assetId}", which is not an asset in the manifest.`,
        },
      ]);
    },
  );

  it.each([
    ['escaped', '![](asset\\:gone)'],
    ['a numbered character', '![](asset&#58;gone)'],
  ])(
    'reports a missing file whose address is written with the colon %s',
    (_how, block) => {
      const { index, issues } = issuesWith({ en: `# T\n\n${block}` });
      expect(issues).toEqual([
        {
          path: ['stages', index, 'content', 'en'],
          message:
            'This text shows the file "gone", which is not an asset in the manifest.',
        },
      ]);
    },
  );

  it('reports a file that is not an image, audio or video', () => {
    const { index, issues } = issuesWith({ en: '![](asset:roster)' });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message:
          "This text shows the file \"roster\", which must be an 'image', 'audio' or 'video' asset, but is of type \"network\".",
      },
    ]);
  });

  it('reports a block that names no asset', () => {
    const { index, issues } = issuesWith({ en: '![](asset:)' });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message: 'A file shown in this text does not name an asset.',
      },
    ]);
  });

  it('reports a setting no block has, and the file is still checked', () => {
    const { index, issues } = issuesWith({ en: '![](asset:img?zoom=2)' });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message:
          'A file shown in this text has a setting "zoom", which is not one a file can have.',
      },
    ]);
  });

  it.each([
    ['size', 'huge'],
    ['align', 'left'],
    ['autoplay', 'yes'],
    ['loop', 'no'],
  ])('reports %s=%s as a value the setting cannot be', (setting, value) => {
    const { index, issues } = issuesWith({
      en: `![](asset:img?${setting}=${value})`,
    });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message: `A file shown in this text has "${value}" for its setting "${setting}", which that setting cannot be.`,
      },
    ]);
  });

  it('checks each language on its own, at its own path', () => {
    const { index, issues } = issuesWith(
      { en: '![](asset:img)', fr: '![](asset:gone)', de: '![](asset:roster)' },
      ['en', 'fr', 'de'],
    );
    expect(issues.map(({ path }) => path)).toEqual([
      ['stages', index, 'content', 'fr'],
      ['stages', index, 'content', 'de'],
    ]);
  });

  it('reports a block inside a version a message chooses between, and still checks its file', () => {
    const { index, issues } = issuesWith({
      en: '{kind, select, a {![](asset:img)} other {![](asset:gone)}}',
    });
    const path = ['stages', index, 'content', 'en'];
    // The unbound `kind` is the dynamic values' to report, not the file's.
    const ofFiles = issues.filter(({ message }) => message.includes('file'));
    expect(ofFiles).toEqual([
      { path, message: expect.stringContaining('inside one version') },
      { path, message: expect.stringContaining('inside one version') },
      {
        path,
        message:
          'This text shows the file "gone", which is not an asset in the manifest.',
      },
    ]);
  });

  it.each([
    ['a heading', '# ![A](asset:img)'],
    ['a link', '[![A](asset:img)](https://example.com)'],
    ['emphasis', '*![A](asset:img)*'],
    ['a quotation', '> ![A](asset:img)'],
  ])('reports a block written inside %s', (_where, en) => {
    const { index, issues } = issuesWith({ en });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message: expect.stringContaining('Write it in a paragraph'),
      },
    ]);
  });

  it.each([
    ['a paragraph of its own', '# T\n\n![A](asset:img)'],
    ['a sentence', '# T\n\nSee ![A](asset:img) here.'],
    ['an item of a list', '- one\n- ![A](asset:img)'],
    [
      'an item of a list in a list',
      '1. one\n   - ![A](asset:img)\n\n     more',
    ],
    ['an item of a list of tasks', '- [ ] ![A](asset:img)'],
    ['a paragraph beside words struck through', '~~old~~ ![A](asset:img)'],
    // Text is standard CommonMark, which strikes nothing through and has no
    // tables: each of these is an image in a paragraph, with words beside it.
    ['words between tildes', '~~![A](asset:img)~~'],
    ['words between single tildes', '~![A](asset:img)~'],
    [
      'lines that GitHub would read as a table',
      '| File |\n| - |\n| ![A](asset:img) |',
    ],
  ])('accepts a block written in %s', (_where, en) => {
    expect(issuesWith({ en }).issues).toEqual([]);
  });

  it('reports a block named through a reference', () => {
    const { index, issues } = issuesWith({
      en: '# T\n\n![A][map]\n\n[map]: asset:img',
    });
    expect(issues).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message: expect.stringContaining('named through a reference'),
      },
    ]);
  });

  it.each([
    ['its description', '# T\n\n![A {kind}](asset:img)'],
    ['its settings', '# T\n\n![A](asset:img?size={kind})'],
    ['the file it names', '# T\n\n![A](asset:{kind})'],
    [
      'a choice of versions in its description',
      '# T\n\n![{kind, select, a {One} other {Other}}](asset:img)',
    ],
  ])('reports a value in %s, and nothing else about the file', (_where, en) => {
    const { index, issues } = issuesWith({ en });
    expect(issues.filter(({ message }) => message.includes('file'))).toEqual([
      {
        path: ['stages', index, 'content', 'en'],
        message: expect.stringContaining('has a value in its description'),
      },
    ]);
  });

  it('accepts a value in the words beside a block', () => {
    const { issues } = issuesWith({
      en: '# {kind}\n\n![A](asset:img)\n\n{kind}',
    });
    expect(issues.filter(({ message }) => message.includes('file'))).toEqual(
      [],
    );
  });

  it('reports an issue for each block with a problem', () => {
    const { issues } = issuesWith({
      en: '![](asset:gone)\n\n![](asset:alsogone)',
    });
    expect(issues).toHaveLength(2);
  });

  it('raises nothing for an image whose address is not a file of the protocol', () => {
    expect(issuesWith({ en: '![](https://example.com/a.png)' }).issues).toEqual(
      [],
    );
  });

  it('raises nothing for an asset image in text not declared to hold blocks', () => {
    const protocol = withManifest(completeProtocol());
    const stages = protocol.stages as Fields[];
    const index = stages.findIndex((stage) => stage.id === testId('egoForm'));
    stages[index] = {
      ...stages[index],
      introductionPanel: {
        title: { en: 'About you title' },
        text: { en: '![](asset:gone)' },
      },
    };
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });
});

describe('declaring text that holds blocks', () => {
  it('is reported by the shape of an Information page', () => {
    expect(localizedTextShapeAt(informationStage, ['content'])).toEqual({
      format: 'markdown',
      lines: 'multiple',
      assetBlocks: true,
    });
  });

  it('is not reported by text that does not hold them', () => {
    expect(
      localizedTextShapeAt(informationStage, ['label']),
    ).not.toHaveProperty('assetBlocks');
  });

  it.each([
    ['plain text', { format: 'plain', lines: 'multiple' }],
    ['plain single-line text', { format: 'plain', lines: 'single' }],
    ['single-line markdown', { format: 'markdown', lines: 'single' }],
  ] as const)(
    'is refused for %s, as the schema is declared',
    (_name, shape) => {
      expect(() =>
        localizedString(nonBlankText(), { ...shape, assetBlocks: true }),
      ).toThrow(
        'Only markdown text of several lines can hold files as blocks.',
      );
    },
  );

  it('is accepted for markdown of several lines', () => {
    expect(() =>
      localizedString(nonBlankText(), {
        format: 'markdown',
        lines: 'multiple',
        assetBlocks: true,
      }),
    ).not.toThrow();
  });
});
