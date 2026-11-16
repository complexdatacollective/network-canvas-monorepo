// The QuickJS build ships one file for Node and the browser. Its Node branch
// never runs in a browser, but Turbopack resolves `import("module")` and
// `new URL("./", import.meta.url)` statically and fails the build on both.
// This loader rewrites them into forms with the same behaviour in Node that a
// bundler does not try to resolve. A host built with Turbopack from this
// package's source applies it to the QuickJS module; the published build
// carries the worker already bundled and does not need it.
const REWRITES = [
  ['await import("module")', 'process.getBuiltinModule("module")'],
  [
    'new URL("./",import.meta.url)',
    'new URL(import.meta.url.replace(/[^/]*$/,""))',
  ],
] as const;

function quickjsNextLoader(code: string): string {
  return REWRITES.reduce((current, [from, to]) => {
    if (!current.includes(from)) {
      throw new Error(
        `quickjs-next-loader: expected ${from} in the QuickJS module; the loader needs updating for this version`,
      );
    }
    return current.replaceAll(from, to);
  }, code);
}

export default quickjsNextLoader;
