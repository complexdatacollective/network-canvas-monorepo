import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

// Vite emits each bundled template asset file and gives us its URL. We key by
// basename so an `assetManifest` entry's `source` resolves directly. Template
// asset filenames are therefore kept globally unique (e.g.
// `world-countries.geojson`); a collision is a build-time authoring error, so
// we throw rather than let one template's asset silently shadow another's.
const assetUrlByFilename = new Map<string, string>();

for (const [path, url] of Object.entries(
  import.meta.glob<string>('../../../../templates/*/assets/*', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
)) {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  if (assetUrlByFilename.has(filename)) {
    throw new Error(
      `Duplicate bundled template asset filename: ${filename}. Template asset filenames must be globally unique.`,
    );
  }
  assetUrlByFilename.set(filename, url);
}

type ManifestEntry = { id: string; name: string; source?: string };

// Fetches a template's bundled assets into Blobs keyed by their `assetManifest`
// id, so the template instantiates into the library with its media intact.
// Called lazily, only when a template that actually has assets is opened.
export const loadTemplateAssets = async (
  protocol: CurrentProtocol,
): Promise<ExtractedAsset[]> => {
  const entries = Object.values(
    protocol.assetManifest ?? {},
  ) as ManifestEntry[];

  return Promise.all(
    entries
      .filter((entry): entry is Required<ManifestEntry> =>
        Boolean(entry.source),
      )
      .map(async (entry) => {
        const url = assetUrlByFilename.get(entry.source);
        if (!url) {
          throw new Error(`Missing bundled template asset: ${entry.source}`);
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch bundled template asset ${entry.source}: ${response.status}`,
          );
        }
        const data = await response.blob();
        return { id: entry.id, name: entry.name, data };
      }),
  );
};
