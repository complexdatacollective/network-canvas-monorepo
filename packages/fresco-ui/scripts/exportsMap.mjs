/**
 * Canonical include/exclude globs for fresco-ui's buildable source files.
 * Shared by vite.config.ts (build entry map) and the exports-map guard test
 * (src/__tests__/exportsMap.test.ts) so both agree on "which src files ship
 * in the published package".
 */
export const BUILD_GLOB_PATTERNS = [
  'src/**/*.{ts,tsx}',
  '!src/**/*.{stories,test,spec}.{ts,tsx}',
  '!src/**/*TestHelpers.{ts,tsx}',
  '!src/**/__tests__/**',
];

/**
 * Derives the dist-pointing publishConfig.exports map from the src-pointing
 * `exports` map, mirroring vite.config.ts's build output layout: every
 * `src/<rel>.ts(x)` entry becomes `dist/<rel>.js` + `dist/<rel>.d.ts`
 * (via `entryFileNames: '[name].js'` and `dts({ entryRoot: 'src' })`).
 * `./styles.css` stays a plain dist-relative string.
 *
 * @param {Record<string, string>} srcExports
 * @returns {Record<string, string | { types: string, default: string }>}
 */
export function deriveDistExports(srcExports) {
  const distExports = {};
  for (const [subpath, srcValue] of Object.entries(srcExports)) {
    if (srcValue.endsWith('.css')) {
      distExports[subpath] = srcValue.replace(/^\.\/src\//, './dist/');
      continue;
    }
    const rel = srcValue.replace(/^\.\/src\//, '').replace(/\.[jt]sx?$/, '');
    distExports[subpath] = {
      types: `./dist/${rel}.d.ts`,
      default: `./dist/${rel}.js`,
    };
  }
  return distExports;
}
