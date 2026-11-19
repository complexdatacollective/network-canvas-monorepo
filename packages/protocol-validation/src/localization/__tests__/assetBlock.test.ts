import { describe, expect, it } from 'vitest';

import {
  type AssetBlock,
  ASSET_BLOCK_DEFAULTS,
  assetBlockMarkdown,
  assetBlocksInMarkdown,
  assetBlocksInMessage,
  assetBlockUrl,
  readAssetBlockUrl,
} from '../assetBlock.ts';
import { escapeMessageText } from '../messageSyntax.ts';

const roundTrip = (block: AssetBlock) =>
  assetBlocksInMarkdown(assetBlockMarkdown(block)).map(
    ({ block: read }) => read,
  );

describe('assetBlockUrl', () => {
  it('names the file alone when no setting differs from the defaults', () => {
    expect(assetBlockUrl({ assetId: 'abc' })).toBe('asset:abc');
  });

  it.each([
    ['size', { assetId: 'a', size: 'small' }, 'asset:a?size=small'],
    ['size', { assetId: 'a', size: 'medium' }, 'asset:a?size=medium'],
    ['size', { assetId: 'a', size: 'large' }, 'asset:a?size=large'],
    ['align start', { assetId: 'a', align: 'start' }, 'asset:a?align=start'],
    ['align end', { assetId: 'a', align: 'end' }, 'asset:a?align=end'],
    ['autoplay', { assetId: 'a', autoplay: false }, 'asset:a?autoplay=false'],
    ['loop', { assetId: 'a', loop: false }, 'asset:a?loop=false'],
  ] as const)('writes %s and reads it back', (_name, block, url) => {
    expect(assetBlockUrl(block)).toBe(url);
    expect(readAssetBlockUrl(url)).toEqual({ block, problems: [] });
  });

  it('writes every setting in one order whatever order the block holds them', () => {
    const url = 'asset:a?size=large&align=end&autoplay=false&loop=false';
    expect(
      assetBlockUrl({
        loop: false,
        autoplay: false,
        align: 'end',
        size: 'large',
        assetId: 'a',
      }),
    ).toBe(url);
    expect(
      assetBlockUrl({
        assetId: 'a',
        size: 'large',
        align: 'end',
        autoplay: false,
        loop: false,
      }),
    ).toBe(url);
  });

  it('never writes a setting that is the default', () => {
    expect(
      assetBlockUrl({
        assetId: 'a',
        align: ASSET_BLOCK_DEFAULTS.align,
        autoplay: ASSET_BLOCK_DEFAULTS.autoplay,
        loop: ASSET_BLOCK_DEFAULTS.loop,
      }),
    ).toBe('asset:a');
  });
});

describe('readAssetBlockUrl', () => {
  it('normalises settings written as defaults away', () => {
    expect(
      readAssetBlockUrl('asset:a?align=center&autoplay=true&loop=true'),
    ).toEqual({ block: { assetId: 'a' }, problems: [] });
  });

  it('reads the scheme without regard to case', () => {
    expect(readAssetBlockUrl('ASSET:a')?.block.assetId).toBe('a');
  });

  it.each(['https://example.com/a.png', 'a.png', 'assets:a', ''])(
    'is undefined for %j, which does not name a file of the protocol',
    (url) => {
      expect(readAssetBlockUrl(url)).toBeUndefined();
    },
  );

  it('reports an address with no asset', () => {
    expect(readAssetBlockUrl('asset:')?.problems).toEqual([
      { kind: 'noAsset' },
    ]);
    expect(readAssetBlockUrl('asset:?size=small')?.problems).toEqual([
      { kind: 'noAsset' },
    ]);
  });

  it('reports an id that is not valid percent-encoding as no asset', () => {
    expect(readAssetBlockUrl('asset:%E0%A4%A')?.problems).toEqual([
      { kind: 'noAsset' },
    ]);
  });

  it('reports a setting it does not know, and keeps the rest', () => {
    expect(readAssetBlockUrl('asset:a?colour=red&size=small')).toEqual({
      block: { assetId: 'a', size: 'small' },
      problems: [{ kind: 'unknownSetting', setting: 'colour' }],
    });
  });

  it.each([
    ['size', 'huge'],
    ['size', 'LARGE'],
    ['align', 'left'],
    ['autoplay', 'yes'],
    ['loop', '1'],
  ])('reports %s=%s as a value the setting cannot take', (setting, value) => {
    expect(readAssetBlockUrl(`asset:a?${setting}=${value}`)).toEqual({
      block: { assetId: 'a' },
      problems: [{ kind: 'invalidValue', setting, value }],
    });
  });

  it('reports every problem, in the order written', () => {
    expect(
      readAssetBlockUrl('asset:?size=huge&x=1&loop=maybe')?.problems,
    ).toEqual([
      { kind: 'noAsset' },
      { kind: 'invalidValue', setting: 'size', value: 'huge' },
      { kind: 'unknownSetting', setting: 'x' },
      { kind: 'invalidValue', setting: 'loop', value: 'maybe' },
    ]);
  });
});

describe('an asset id through real markdown', () => {
  it.each([
    'plain',
    'has space',
    'paren(thesis)',
    "apo'strophe",
    'what?',
    'a&b',
    '100%',
    '50%25',
    'star*bang!',
    'ünïcödé-年',
    'a/b#c',
    'with=equals&size=large',
  ])('keeps %j', (assetId) => {
    const url = assetBlockUrl({ assetId, size: 'small' });
    expect(url).not.toMatch(/[ ()'!*]/);
    expect(roundTrip({ assetId, size: 'small' })).toEqual([
      { assetId, size: 'small' },
    ]);
  });
});

describe('a description through real markdown', () => {
  it.each([
    ['brackets', 'a [b] c'],
    ['an unbalanced bracket', 'a ] b [ c'],
    ['asterisks', '*bold* and **strong**'],
    ['underscores', '_a_ b'],
    ['a backslash', 'a\\b'],
    ['angle brackets', '<b>x</b> <https://example.com>'],
    ['an ampersand entity', 'fish &amp; chips &copy;'],
    ['a backtick', 'use `code`'],
    ['a leading hash', '# not a heading'],
    ['an exclamation before a bracket', 'wow![x](y)'],
  ])('shows %s as written', (_name, description) => {
    expect(roundTrip({ assetId: 'a', description })).toEqual([
      { assetId: 'a', description },
    ]);
  });

  it('collapses line breaks and runs of spaces into single spaces', () => {
    expect(
      roundTrip({
        assetId: 'a',
        description: '  one\n\ntwo\r\n  three\tfour ',
      }),
    ).toEqual([{ assetId: 'a', description: 'one two three four' }]);
  });

  it('writes the block as a single line', () => {
    expect(
      assetBlockMarkdown({ assetId: 'a', description: 'one\ntwo' }),
    ).not.toContain('\n');
  });

  it('leaves out a description that is blank', () => {
    expect(assetBlockMarkdown({ assetId: 'a', description: '  \n ' })).toBe(
      '![](asset:a)',
    );
    expect(roundTrip({ assetId: 'a', description: '   ' })).toEqual([
      { assetId: 'a' },
    ]);
  });
});

describe('assetBlocksInMarkdown', () => {
  it('finds several, in the order the text names them', () => {
    const markdown = [
      '# Heading',
      '![One](asset:a)',
      'Text between.',
      '![Two](asset:b?size=large)',
      '![Three](asset:c?loop=false)',
    ].join('\n\n');
    expect(assetBlocksInMarkdown(markdown).map(({ block }) => block)).toEqual([
      { assetId: 'a', description: 'One' },
      { assetId: 'b', description: 'Two', size: 'large' },
      { assetId: 'c', description: 'Three', loop: false },
    ]);
  });

  it('finds the same file named twice twice', () => {
    expect(
      assetBlocksInMarkdown('![](asset:a)\n\n![](asset:a)').map(
        ({ block }) => block.assetId,
      ),
    ).toEqual(['a', 'a']);
  });

  it('ignores an image whose address is not a file of the protocol', () => {
    expect(assetBlocksInMarkdown('![x](https://example.com/a.png)')).toEqual(
      [],
    );
  });

  it('ignores an address inside a code span', () => {
    expect(assetBlocksInMarkdown('Write `![x](asset:a)` like this')).toEqual(
      [],
    );
  });

  it('ignores an address inside a code block', () => {
    expect(
      assetBlocksInMarkdown('```\n![x](asset:a)\n```\n\n    ![y](asset:b)'),
    ).toEqual([]);
  });

  it('ignores an escaped image', () => {
    expect(assetBlocksInMarkdown('\\![x](asset:a)')).toEqual([]);
    expect(assetBlocksInMarkdown('!\\[x](asset:a)')).toEqual([]);
  });

  it('finds a reference-style image through its definition', () => {
    const found = assetBlocksInMarkdown(
      '![A map][map]\n\n[map]: asset:m1?size=small',
    );
    expect(found.map(({ block }) => block)).toContainEqual({
      assetId: 'm1',
      size: 'small',
    });
    expect(found.every(({ block }) => block.assetId === 'm1')).toBe(true);
  });

  it('reports what is wrong with an address it finds', () => {
    expect(assetBlocksInMarkdown('![](asset:a?zoom=2)')).toEqual([
      {
        block: { assetId: 'a' },
        problems: [{ kind: 'unknownSetting', setting: 'zoom' }],
      },
    ]);
  });
});

describe('assetBlocksInMessage', () => {
  const ids = (message: string) =>
    assetBlocksInMessage(message).map(({ block }) => block.assetId);

  it('finds nothing in a message that never mentions the scheme', () => {
    expect(ids('Just {count, plural, one {a} other {b}} words')).toEqual([]);
  });

  it('finds a block in plain text', () => {
    expect(ids('# Hi\n\n![](asset:a)')).toEqual(['a']);
  });

  // Markdown reads each of these addresses as `asset:a`, and the interview
  // shows the file, so the text is read rather than searched for `asset:`.
  it.each([
    ['a backslash before the colon', '![Map](asset\\:a)'],
    ['a numbered character for the colon', '![Map](asset&#58;a)'],
    ['a named character for the colon', '![Map](asset&colon;a)'],
    ['a numbered character in the scheme', '![Map](&#97;sset:a)'],
    [
      'a version, with the colon escaped',
      '{k, select, other {![Map](asset\\:a)}}',
    ],
  ])('finds a block whose address is written with %s', (_how, message) => {
    expect(ids(message)).toEqual(['a']);
  });

  it('finds blocks inside every version of a select and a plural', () => {
    expect(
      ids(
        '{kind, select, a {![](asset:one)} b {![](asset:two)} other {![](asset:three)}}',
      ),
    ).toEqual(['one', 'two', 'three']);
    expect(
      ids('{count, plural, one {![](asset:single)} other {![](asset:many)}}'),
    ).toEqual(['single', 'many']);
  });

  it('finds blocks in versions nested in versions, and beside them', () => {
    expect(
      ids(
        '![](asset:top)\n\n{a, select, x {{n, plural, one {![](asset:deep)} other {}}} other {![](asset:side)}}',
      ),
    ).toEqual(['top', 'deep', 'side']);
  });

  it('survives ICU-quoted text in a description', () => {
    const description = "Grandma's '{' house";
    const message = escapeMessageText(
      assetBlockMarkdown({ assetId: 'a', description, size: 'small' }),
    );
    expect(assetBlocksInMessage(message).map(({ block }) => block)).toEqual([
      { assetId: 'a', description, size: 'small' },
    ]);
  });

  it('does not let a value in the text join the words around it into a block', () => {
    expect(ids('![{name}](asset:a)')).toEqual(['a']);
    expect(ids('![x]{name}(asset:a)')).toEqual([]);
  });

  it('searches the text as written when it is not a valid message', () => {
    const message = '![](asset:a) {unclosed';
    expect(ids(message)).toEqual(['a']);
  });
});
