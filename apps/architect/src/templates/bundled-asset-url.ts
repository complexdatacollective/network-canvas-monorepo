// Previews in AssetCard fall back to the bundled copy of an asset when the
// library has no Blob for it. Only the Sample protocol's and the templates'
// media are globbed here: an eager `?url` glob emits every matched file into
// the build, so listing the Development protocol's assets here would ship them
// (a ~24 MB video among them) in production even though that protocol is only
// offered in development.
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

export const getBundledAssetUrl = async (
  source?: string | null,
): Promise<string | null> => {
  if (!source) return null;
  const url = bundledAssetUrlsBySource.get(source);
  if (url) return url;
  // The Development protocol's assets are resolved through its own module,
  // which is only reachable in development: production replaces
  // `import.meta.env.DEV` with `false`, so this import and the module's asset
  // glob are dropped from the build.
  if (import.meta.env.DEV) {
    const { getDevelopmentAssetUrl } = await import('./development-protocol');
    return getDevelopmentAssetUrl(source);
  }
  return null;
};
