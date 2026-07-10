const bundledAssetModules = import.meta.glob<string>(
  [
    '../../../../packages/protocols/sample/assets/*',
    '../../../../packages/protocols/development/assets/*',
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
