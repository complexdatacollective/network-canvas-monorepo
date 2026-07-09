import { describe, expect, it } from 'vitest';

import { createTemplateAssetUrlMap } from '../template-assets';

describe('template asset lookup', () => {
  it('keys duplicate asset filenames by template id', () => {
    const lookup = createTemplateAssetUrlMap({
      '../../../../packages/protocols/templates/one/assets/shared.csv':
        '/assets/one-shared.csv',
      '../../../../packages/protocols/templates/two/assets/shared.csv':
        '/assets/two-shared.csv',
    });

    expect(lookup.get('one/shared.csv')).toBe('/assets/one-shared.csv');
    expect(lookup.get('two/shared.csv')).toBe('/assets/two-shared.csv');
  });

  it('rejects unexpected Vite glob paths', () => {
    expect(() =>
      createTemplateAssetUrlMap({
        '../../../../packages/protocols/sample/assets/shared.csv':
          '/assets/shared.csv',
      }),
    ).toThrow('Unexpected bundled template asset path');
  });
});
