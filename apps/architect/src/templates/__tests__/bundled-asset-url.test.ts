import { describe, expect, it } from 'vitest';

import { getBundledAssetUrl } from '../bundled-asset-url';

// AssetCard previews an asset from its bundled copy when the library holds no
// Blob for it. The Development protocol's copies resolve through its dev-only
// module (vitest runs with `import.meta.env.DEV`), the Sample protocol's and
// the templates' from the eager glob that production keeps.
describe('getBundledAssetUrl', () => {
  it('resolves a Sample protocol asset', async () => {
    await expect(
      getBundledAssetUrl('0a85f140-32e2-11eb-8503-3b4fa95b8bc6.png'),
    ).resolves.toMatch(/0a85f140-32e2-11eb-8503-3b4fa95b8bc6\.png/);
  });

  it('resolves a template asset', async () => {
    await expect(
      getBundledAssetUrl('world-countries.geojson'),
    ).resolves.toMatch(/world-countries\.geojson/);
  });

  it('resolves a Development protocol asset in development', async () => {
    expect(import.meta.env.DEV).toBe(true);
    await expect(getBundledAssetUrl('rubberduck.jpg')).resolves.toMatch(
      /rubberduck\.jpg/,
    );
  });

  it('returns null for an unknown or missing source', async () => {
    await expect(getBundledAssetUrl('not-bundled.png')).resolves.toBeNull();
    await expect(getBundledAssetUrl(undefined)).resolves.toBeNull();
  });
});
