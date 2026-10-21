import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import developmentProtocolJson from '@codaco/protocols/development';

// The Development Protocol, vendored in `@codaco/protocols`, so the dev-mode
// template opens from the bundled app rather than a remote URL. It exercises
// every stage type and is only surfaced in development builds. Import this
// module only dynamically and behind `import.meta.env.DEV`: a static import, or
// an unguarded `import()`, puts the protocol and its media (a ~24 MB video
// among them) into the production build, which scripts/assert-pwa-build.mjs
// refuses.
export const developmentProtocol =
  developmentProtocolJson as unknown as CurrentProtocol;

// Vite emits each bundled asset file and gives us its URL. The file name matches
// the `source` of the corresponding `assetManifest` entry in the protocol.
const assetUrlByPath = import.meta.glob<string>(
  '../../../../packages/protocols/development/assets/*',
  { query: '?url', import: 'default', eager: true },
);

const urlBySource = new Map(
  Object.entries(assetUrlByPath).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1),
    url,
  ]),
);

// The bundled URL of one of the Development protocol's assets, for AssetCard's
// preview fallback (see bundled-asset-url.ts).
export const getDevelopmentAssetUrl = (source: string): string | null =>
  urlBySource.get(source) ?? null;

type ManifestEntry = { id: string; name: string; source?: string };

// Fetches each bundled asset into a Blob keyed by its `assetManifest` id, so the
// Development protocol instantiates into the library with its media intact.
// Called lazily, only when the Development template is actually opened.
export const loadDevelopmentAssets = async (): Promise<ExtractedAsset[]> => {
  const entries = (
    Object.entries(developmentProtocol.assetManifest ?? {}) as Array<
      [string, ManifestEntry]
    >
  ).map(([id, entry]) => ({ ...entry, id }));

  return Promise.all(
    entries
      .filter((entry): entry is Required<ManifestEntry> =>
        Boolean(entry.source),
      )
      .map(async (entry) => {
        const url = urlBySource.get(entry.source);
        if (!url) {
          throw new Error(`Missing bundled Development asset: ${entry.source}`);
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch bundled Development asset ${entry.source}: ${response.status}`,
          );
        }
        const data = await response.blob();
        return { id: entry.id, name: entry.name, data };
      }),
  );
};
