import { readFileSync } from 'node:fs';

import { Schema } from 'effect';

// Read the app version from package.json at module load. The relative depth
// is the same in both runtimes — src/*.ts in development and dist/index.js in
// production are each one level below the package root — so one URL works for
// both.
// `@total-typescript/ts-reset` types `JSON.parse` as `unknown` rather than
// `any`, so the shape is decoded before use.
const pkg = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))(
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')),
);

export const STUDIO_VERSION = pkg.version;
