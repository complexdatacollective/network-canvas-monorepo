import { readFileSync } from 'node:fs';

// Read the app version from package.json at module load. The relative depth
// is the same in both runtimes — src/*.ts in development and dist/index.js in
// production are each one level below the package root — so one URL works for
// both.
// Typed at the parse site: `@total-typescript/ts-reset` types `JSON.parse` as
// `unknown` rather than `any`, so the shape has to be stated before use.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const STUDIO_VERSION = pkg.version;
