// Builds this app as a build that bundles Architect 8 would be built, and
// serves it with `vite preview` until it is told to stop. Started by the
// `bundledLegacyArchitect` worker fixture (e2e/fixtures/legacy-architect.ts);
// not meant to be run by hand.
//
// Every way of handing a protocol to Architect 8 is offered only when the
// `__ARCHITECT_V8__` define says the build bundled it. A real bundle needs a
// pinned, released Architect 8 tarball, and the build the rest of the suite
// runs against may have none, so this build sets the define itself and bundles
// nothing: the fixture puts a stub page at /v8/ instead, which the app's own
// preview middleware (vite.config.ts) serves exactly as it would serve a real
// Architect 8 there. Everything else is the app's real production build and
// config.
//
//   node preview-with-legacy-architect.mjs --out-dir <dir> --port <port>
//
// Prints `ready <url>` once the server is listening.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { build, preview } from 'vite';

const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const { values } = parseArgs({
  options: {
    'out-dir': { type: 'string' },
    'port': { type: 'string' },
  },
});
const outDir = values['out-dir'];
const port = Number(values.port);
if (!outDir || !Number.isInteger(port)) {
  throw new Error('usage: --out-dir <dir> --port <port>');
}

await build({
  root: appRoot,
  // Chunk-size and directive notices are the main build's to report.
  logLevel: 'error',
  build: { outDir, emptyOutDir: true },
  // Merged over vite.config.ts's own define, so it wins.
  define: {
    __ARCHITECT_V8__: JSON.stringify({ version: '8.5.0', path: '/v8/' }),
  },
});

const server = await preview({
  root: appRoot,
  logLevel: 'warn',
  build: { outDir },
  preview: { port, strictPort: true },
});
const [url] = server.resolvedUrls?.local ?? [];
process.stdout.write(`ready ${url ?? `http://localhost:${port}/`}\n`);

const stop = () => {
  void server.close().finally(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
