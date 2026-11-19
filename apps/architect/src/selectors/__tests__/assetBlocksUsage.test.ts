import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';

import { getAssetIndex } from '../indexes';
import { getUnusedAssets } from '../issues';

const assetManifest = {
  a: { id: 'a', type: 'image', name: 'a.png' },
  b: { id: 'b', type: 'audio', name: 'b.mp3' },
  c: { id: 'c', type: 'video', name: 'c.mp4' },
  d: { id: 'd', type: 'image', name: 'd.png' },
  e: { id: 'e', type: 'image', name: 'e.png' },
};

const stateWith = (stages: object[]): RootState =>
  ({
    activeProtocol: {
      present: {
        schemaVersion: 9,
        name: 'test',
        localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
        codebook: { node: {} },
        assetManifest,
        stages,
      },
    },
  }) as unknown as RootState;

const information = (content: Record<string, string>) => ({
  id: 'info',
  type: 'Information',
  label: { en: 'Info' },
  content,
});

describe('assets shown as blocks in the text of an Information stage', () => {
  it('counts every file one text shows as used, not only the last', () => {
    const state = stateWith([
      information({
        en: '# Page\n\n![](asset:a)\n\n![](asset:b?align=start)\n\n![](asset:c?size=large)',
      }),
    ]);

    expect(new Set(Object.values(getAssetIndex(state)))).toEqual(
      new Set(['a', 'b', 'c']),
    );
    expect(getUnusedAssets(state).names).toEqual(['d.png', 'e.png']);
  });

  it('counts a file shown only in a second language as used', () => {
    const state = stateWith([
      information({
        en: '![](asset:a)\n\n![](asset:b)\n\n![](asset:c)',
        fr: '![](asset:d)',
      }),
    ]);

    expect(Object.values(getAssetIndex(state)).toSorted()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(getUnusedAssets(state).names).toEqual(['e.png']);
  });

  it('counts a file shown twice, and a file shown in two stages', () => {
    const state = stateWith([
      information({ en: '![](asset:a)\n\n![](asset:a)' }),
      { ...information({ en: '![](asset:a)' }), id: 'other' },
    ]);

    expect(new Set(Object.values(getAssetIndex(state)))).toEqual(
      new Set(['a']),
    );
    expect(getUnusedAssets(state).count).toBe(4);
  });

  it('does not count a file only named inside a code span or code block', () => {
    const state = stateWith([
      information({
        en: 'Write `![](asset:a)` to show it.\n\n```\n![](asset:b)\n```',
      }),
    ]);

    expect(Object.values(getAssetIndex(state))).toEqual([]);
    expect(getUnusedAssets(state).count).toBe(5);
  });

  it('does not count a file named in the text of a stage that is not an Information stage', () => {
    const state = stateWith([
      {
        id: 'names',
        type: 'NameGenerator',
        label: { en: 'Names' },
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: { en: '![](asset:a)' } }],
      },
    ]);

    expect(Object.values(getAssetIndex(state))).not.toContain('a');
    expect(getUnusedAssets(state).names).toContain('a.png');
  });
});
