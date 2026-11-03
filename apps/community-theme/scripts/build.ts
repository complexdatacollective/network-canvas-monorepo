/**
 * Builds the Discourse theme into dist/:
 *
 *   dist/network-canvas/      the theme as a folder, for `discourse_theme watch`
 *   dist/network-canvas.zip   the same files, for Admin → Themes → Install
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

import { buildTheme } from '../src/theme.ts';

const THEME_NAME = 'network-canvas';
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const themeDir = join(dist, THEME_NAME);

const files = buildTheme();

rmSync(dist, { recursive: true, force: true });
const zip = new JSZip();
for (const file of files) {
  const target = join(themeDir, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.contents);
  zip.file(`${THEME_NAME}/${file.path}`, file.contents);
}

const archive = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
});
writeFileSync(join(dist, `${THEME_NAME}.zip`), archive);

console.log(
  `Built ${files.length} files into dist/${THEME_NAME}/ and dist/${THEME_NAME}.zip`,
);
