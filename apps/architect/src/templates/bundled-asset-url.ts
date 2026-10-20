// The bundled copy of a media file a template or the Sample protocol
// references, by its `source` filename. The dev-only Development protocol's
// media is deliberately absent: an eager `?url` glob emits every file it
// matches, so listing it here would ship that media (a 24 MB video among it)
// in every production build. development-protocol.ts, which only a dev build
// loads, resolves it instead.
const bundledAssetModules = import.meta.glob<string>(
  [
    '../../../../packages/protocols/sample/assets/*',
    '../../../../packages/protocols/templates/*/assets/*',
    '!../../../../packages/protocols/templates/*/assets/.gitkeep',
  ],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
);

const bundledAssetUrlsBySource = new Map<string, string>();

for (const [path, url] of Object.entries(bundledAssetModules)) {
  const source = path.slice(path.lastIndexOf('/') + 1);
  if (!bundledAssetUrlsBySource.has(source)) {
    bundledAssetUrlsBySource.set(source, url);
  }
}

export const getBundledAssetUrl = (source?: string | null): string | null => {
  if (!source) return null;
  return bundledAssetUrlsBySource.get(source) ?? null;
};
