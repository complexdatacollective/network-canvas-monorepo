import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import sampleProtocolJson from '@codaco/sample-protocol';

// The Sample Protocol, vendored as `@codaco/sample-protocol` (migrated to the
// current schema version), so it opens from the bundled app rather than a
// remote URL.
export const sampleProtocol = sampleProtocolJson as unknown as CurrentProtocol;

// Vite emits each bundled asset file and gives us its URL. The file name matches
// the `source` of the corresponding `assetManifest` entry in the protocol.
const assetUrlByPath = import.meta.glob<string>(
  '../../../../packages/sample-protocol/assets/*',
  { query: '?url', import: 'default', eager: true },
);

const urlBySource = new Map(
  Object.entries(assetUrlByPath).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1),
    url,
  ]),
);

type ManifestEntry = { id: string; name: string; source?: string };

// Fetches each bundled asset into a Blob keyed by its `assetManifest` id, so the
// Sample protocol instantiates into the library with its media intact. Called
// lazily, only when the Sample template is actually opened.
export const loadSampleAssets = async (): Promise<ExtractedAsset[]> => {
  const entries = Object.values(
    sampleProtocol.assetManifest ?? {},
  ) as ManifestEntry[];

  return Promise.all(
    entries
      .filter((entry): entry is Required<ManifestEntry> =>
        Boolean(entry.source),
      )
      .map(async (entry) => {
        const url = urlBySource.get(entry.source);
        if (!url) {
          throw new Error(`Missing bundled Sample asset: ${entry.source}`);
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch bundled Sample asset ${entry.source}: ${response.status}`,
          );
        }
        const data = await response.blob();
        return { id: entry.id, name: entry.name, data };
      }),
  );
};
