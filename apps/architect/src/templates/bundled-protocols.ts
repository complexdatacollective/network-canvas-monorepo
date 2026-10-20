import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

import { getBundledAssetUrl } from './bundled-asset-url';
import { BUNDLED_TEMPLATES, type BundledTemplate } from './index';
import { loadSampleAssets, sampleProtocol } from './sample-protocol';
import { warmBundledTemplateAssets } from './warmBundledAssets';

export type BundledProtocols = {
  // Research-grounded starter templates, shown in the Templates tab.
  templates: BundledTemplate[];
  sample: {
    protocol: CurrentProtocol;
    loadAssets: () => Promise<ExtractedAsset[]>;
  };
  // The bundled copy of a media file a template or the Sample protocol
  // references, by its `source` filename.
  getAssetUrl: (source?: string | null) => string | null;
  // Fills the offline cache with every template and Sample asset.
  warmAssets: () => Promise<void>;
};

// Every protocol Architect ships for researchers to start from, and the media
// they carry. The app reaches them only through this module so that a build
// can leave them out in one place: a sub-path build (Architect 8 inside
// Architect 9's deploy) ships the editor alone, and vite.config.ts replaces
// this module there with `export const bundledProtocols = null;`, so none of
// the protocols or their media enter that bundle. Consumers treat null as "this
// build has no starting points". (The dev-only Development protocol is loaded
// separately, behind `import.meta.env.DEV`.)
export const bundledProtocols: BundledProtocols | null = {
  templates: BUNDLED_TEMPLATES,
  sample: { protocol: sampleProtocol, loadAssets: loadSampleAssets },
  getAssetUrl: getBundledAssetUrl,
  warmAssets: warmBundledTemplateAssets,
};
