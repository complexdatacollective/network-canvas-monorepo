import { describe, expect, it } from 'vitest';

import { getDocSearchConfig } from '../docSearchConfig';

describe('getDocSearchConfig', () => {
  it.each([
    {},
    { appId: '', indexName: 'index', apiKey: 'key' },
    { appId: 'app', indexName: ' ', apiKey: 'key' },
    { appId: 'app', indexName: 'index', apiKey: undefined },
  ])('rejects incomplete browser configuration', (candidate) => {
    expect(getDocSearchConfig(candidate)).toBeNull();
  });

  it('normalizes complete browser configuration', () => {
    expect(
      getDocSearchConfig({
        appId: ' app ',
        indexName: ' index ',
        apiKey: ' key ',
      }),
    ).toEqual({ appId: 'app', indexName: 'index', apiKey: 'key' });
  });
});
