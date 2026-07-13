// Regenerate interviewer-e2e.netcanvas from protocol.json.
// A .netcanvas is a plain zip with protocol.json at the archive root.
// Uses jszip (already an apps/interviewer dep). Run:
//   node apps/interviewer/e2e/scripts/build-e2e-protocol.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(
  here,
  '../../../../packages/protocols/e2e/interviewer-e2e',
);
const json = readFileSync(resolve(srcDir, 'protocol.json'), 'utf8');

const zip = new JSZip();
zip.file('protocol.json', json);
const buffer = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(resolve(srcDir, 'interviewer-e2e.netcanvas'), buffer);
console.log('Wrote interviewer-e2e.netcanvas');
