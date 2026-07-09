import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

// Vite emits each bundled template asset file and gives us its URL. We key by
// `<template id>/<source>` so different templates can safely use the same asset
// filename without shadowing each other.
export const createTemplateAssetUrlMap = (
  assetModules: Record<string, string>,
): Map<string, string> => {
  const assetUrls = new Map<string, string>();

  for (const [path, url] of Object.entries(assetModules)) {
    const match = /\/templates\/([^/]+)\/assets\/([^/]+)$/.exec(path);
    if (!match) {
      throw new Error(`Unexpected bundled template asset path: ${path}`);
    }
    const [, templateId, source] = match;
    assetUrls.set(`${templateId}/${source}`, url);
  }

  return assetUrls;
};

const assetUrlByTemplateAndSource = createTemplateAssetUrlMap(
  import.meta.glob<string>(
    [
      '../../../../packages/protocols/templates/*/assets/*',
      '!../../../../packages/protocols/templates/*/assets/.gitkeep',
    ],
    {
      query: '?url',
      import: 'default',
      eager: true,
    },
  ),
);

// URLs of every bundled template asset, for warming the offline cache so a
// template can be installed into the library with no network.
export const templateAssetUrls: string[] = [
  ...assetUrlByTemplateAndSource.values(),
];

type ManifestEntry = { id: string; name: string; source?: string };

// Fetches a template's bundled assets into Blobs keyed by their `assetManifest`
// id, so the template instantiates into the library with its media intact.
// Called lazily, only when a template that actually has assets is opened.
export const loadTemplateAssets = async (
  templateId: string,
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
        const url = assetUrlByTemplateAndSource.get(
          `${templateId}/${entry.source}`,
        );
        if (!url) {
          throw new Error(
            `Missing bundled template asset: ${templateId}/${entry.source}`,
          );
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
