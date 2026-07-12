import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({ root: appRoot });
// The assertion reads the completed dist output, so load it only after Vite.
await import('./assert-pwa-build.mjs');
