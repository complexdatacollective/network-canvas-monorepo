import { readFileSync } from 'node:fs';

// Read the app version from package.json at module load. The relative depth is
// the same in both runtimes — server/src/*.ts in development and
// dist/server/index.js in production are each two levels below apps/studio —
// so one URL works for both.
// Typed at the parse site: `@total-typescript/ts-reset` types `JSON.parse` as
// `unknown` rather than `any`, so the shape has to be stated before use.
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const STUDIO_VERSION = pkg.version;
