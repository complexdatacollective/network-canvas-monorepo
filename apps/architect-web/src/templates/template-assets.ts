import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

// Vite emits each bundled template asset file and gives us its URL. A file's
// name matches the `source` of the corresponding `assetManifest` entry in the
// template's canonical protocol, so template asset filenames are kept globally
// unique (e.g. `<template-id>-hero.svg`).
const assetUrlByFilename = new Map(
  Object.entries(
    import.meta.glob<string>('../../../../templates/*/assets/*', {
      query: '?url',
      import: 'default',
      eager: true,
    }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

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
