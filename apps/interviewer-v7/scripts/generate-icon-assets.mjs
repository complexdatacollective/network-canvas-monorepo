#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const SIZE = 1024;
// Android adaptive icons reserve the inner 66dp of a 108dp canvas as the
// safe zone (61%). 0.66 leaves a hair of headroom for system masks.
const SAFE_ZONE = 0.66;
// Standard Windows ICO entries; 256 is required for modern Explorer, smaller
// sizes get rasterised purpose-built so taskbar/tray stay crisp.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const buildResourcesDir = path.join(appRoot, 'build-resources');
const foregroundSvgPath = path.join(buildResourcesDir, 'icon-foreground.svg');
const backgroundSvgPath = path.join(buildResourcesDir, 'icon-background.svg');
const electronIconPngPath = path.join(buildResourcesDir, 'icon.png');
const electronIconIcoPath = path.join(buildResourcesDir, 'icon.ico');
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
// also doubles as the iOS appiconset fallback for iOS < 26 and the source
// for the Electron Windows/Linux icons below.
const flatIconBuffer = await sharp(backgroundPngPath)
  .composite([{ input: foregroundPngPath }])
  .png()
  .toBuffer();
await fs.writeFile(iconOnlyPngPath, flatIconBuffer);

// Linux: electron-builder auto-detects build-resources/icon.png (>=512px).
await fs.writeFile(electronIconPngPath, flatIconBuffer);

// Windows: a multi-resolution ICO so Explorer/taskbar/tray pick the right
// rasterisation instead of downsampling a single 256px entry.
const icoSourceBuffers = await Promise.all(
  ICO_SIZES.map((size) =>
    sharp(flatIconBuffer)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer(),
  ),
);
await fs.writeFile(electronIconIcoPath, await pngToIco(icoSourceBuffers));

console.log(`wrote ${path.relative(appRoot, foregroundPngPath)}`);
console.log(`wrote ${path.relative(appRoot, backgroundPngPath)}`);
console.log(`wrote ${path.relative(appRoot, iconOnlyPngPath)}`);
console.log(`wrote ${path.relative(appRoot, logoPngPath)}`);
console.log(`wrote ${path.relative(appRoot, electronIconPngPath)}`);
console.log(`wrote ${path.relative(appRoot, electronIconIcoPath)}`);
