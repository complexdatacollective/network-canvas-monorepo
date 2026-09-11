import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { syncProtocolGallery } from '../lib/protocolGallerySync.ts';

const root = join(import.meta.dirname, '..');
const contentFile = join(root, 'content', 'protocol-gallery.csv');
const assetDirectory = join(root, 'public', 'protocols', 'protocol-gallery');

await writeFile(
  contentFile,
  await syncProtocolGallery(contentFile, assetDirectory),
);
console.log(`Updated ${contentFile}`);
