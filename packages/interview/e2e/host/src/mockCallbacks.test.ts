import { describe, expect, it } from 'vitest';

import { makeMockAssetRequest } from './mockCallbacks';

describe('makeMockAssetRequest', () => {
  it('resolves the URL for a known assetId', async () => {
    const assetUrls = new Map([['asset-abc', 'https://example.com/image.png']]);
    const handler = makeMockAssetRequest(assetUrls);

    await expect(handler('asset-abc')).resolves.toBe(
      'https://example.com/image.png',
    );
  });

  it('throws for an unknown assetId', async () => {
    const assetUrls = new Map<string, string>();
    const handler = makeMockAssetRequest(assetUrls);

    await expect(handler('unknown')).rejects.toThrow(/No URL registered/);
  });
});
