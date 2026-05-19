#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const SIZE = 1024;
// Android adaptive icons reserve the inner 66dp of a 108dp canvas as the
// safe zone (61%). 0.66 leaves a hair of headroom for system masks.
const SAFE_ZONE = 0.66;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const foregroundSvgPath = path.join(
  appRoot,
  'build-resources',
  'icon-foreground.svg',
);
const backgroundSvgPath = path.join(
  appRoot,
  'build-resources',
  'icon-background.svg',
);
const assetsDir = path.join(appRoot, 'assets');
const foregroundPngPath = path.join(assetsDir, 'icon-foreground.png');
const backgroundPngPath = path.join(assetsDir, 'icon-background.png');
const iconOnlyPngPath = path.join(assetsDir, 'icon-only.png');
const logoPngPath = path.join(assetsDir, 'logo.png');

await fs.mkdir(assetsDir, { recursive: true });

const safePx = Math.round(SIZE * SAFE_ZONE);

// Render the foreground SVG into the safe-zone box (preserving aspect ratio),
// then composite onto a transparent 1024² canvas. Doing it in two passes lets
// librsvg handle the source SVG verbatim instead of us splicing namespaces.
const foregroundContent = await sharp(foregroundSvgPath, { density: 384 })
  .resize(safePx, safePx, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: foregroundContent, gravity: 'centre' }])
  .png()
  .toFile(foregroundPngPath);

await sharp(backgroundSvgPath, { density: 384 })
  .resize(SIZE, SIZE, { fit: 'contain' })
  .png()
  .toFile(backgroundPngPath);

// logo.png feeds capacitor-assets' splash generation (composited onto a solid
// colour). Splashes aren't masked like Android adaptive icons, so we render
// the foreground SVG to fill the canvas — no safe-zone padding.
await sharp(foregroundSvgPath, { density: 384 })
  .resize(SIZE, SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(logoPngPath);

// `@capacitor/assets generate` requires at least one of {logo, icon, splash}
// to be present, otherwise it errors before touching adaptive icon inputs.
// Compose foreground over background to produce that single flat icon, which
// also doubles as the iOS appiconset fallback for iOS < 26.
await sharp(backgroundPngPath)
  .composite([{ input: foregroundPngPath }])
  .png()
  .toFile(iconOnlyPngPath);

console.log(`wrote ${path.relative(appRoot, foregroundPngPath)}`);
console.log(`wrote ${path.relative(appRoot, backgroundPngPath)}`);
console.log(`wrote ${path.relative(appRoot, iconOnlyPngPath)}`);
console.log(`wrote ${path.relative(appRoot, logoPngPath)}`);
