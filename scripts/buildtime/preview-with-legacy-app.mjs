// Builds an app as a build that bundles its older major would be built, and
// serves it with `vite preview` until it is told to stop. Started by an app's
// e2e worker fixture (apps/<app>/e2e/fixtures/legacy-<app>.ts); not meant to
// be run by hand.
//
// Every way of handing something to the older major is offered only when the
// app's `__<APP>_V8__` define says the build bundled it. A real bundle needs a
// pinned, released tarball, and the build the rest of the suite runs against
// may have none, so this build sets the define itself and bundles nothing: the
// fixture puts a stub page at /v8/ instead, which the app's own preview
// middleware (legacy-app-preview-plugin.ts) serves exactly as it would serve a
// real bundled build there. Everything else is the app's real production build
// and config.
//
//   node preview-with-legacy-app.mjs --app <app> --out-dir <dir> --port <port>
//
// Prints `ready <url>` once the server is listening.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { build, preview } from 'vite';

import { legacyApp } from './legacy-app.ts';

const { values } = parseArgs({
  options: {
    'app': { type: 'string' },
    'out-dir': { type: 'string' },
    'port': { type: 'string' },
  },
});
const outDir = values['out-dir'];
const port = Number(values.port);
if (!values.app || !outDir || !Number.isInteger(port)) {
  throw new Error('usage: --app <app> --out-dir <dir> --port <port>');
}
// Throws for an app with no older major to stand in for.
const app = legacyApp(values.app);
const appRoot = join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'apps',
  app.name,
);

await build({
  root: appRoot,
  // Chunk-size and directive notices are the main build's to report.
  logLevel: 'error',
  build: { outDir, emptyOutDir: true },
  // Merged over the app's own define, so it wins.
  define: {
    [app.defineName]: JSON.stringify({ version: '8.5.0', path: '/v8/' }),
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
