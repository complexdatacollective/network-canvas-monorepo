import { defineConfig } from '@vite-pwa/assets-generator/config';

// The source icon is full-bleed (grid background baked in), so every variant
// renders at padding 0. The minimal2023Preset defaults would instead letterbox
// the apple icon onto a white 30%-padded tile, which is the white-bordered dock
// icon this replaces.
//
// No maskable variant is generated here, because it needs different artwork
// from the rest. Measured from the generated .icns of both installed apps on
// macOS: Safari's "Add to Dock" picks the maskable manifest entry and renders
// it 1:1 into the icon shape, while Chrome uses the `any` entry and magnifies
// it ~1.057x. Identical pixels therefore come out ~1.057x larger in Chrome.
//
// So the maskable artwork is pre-scaled to 1.057x this source and committed at
// public/maskable-icon-512x512.png, which cancels the difference;
// apps/architect/vite.config.ts lists it in the manifest. It stays within the
// maskable safe zone (the compass reaches 34% of the tile, against the 40%
// limit), so a platform that does crop to the safe zone still won't clip it.
// Matches apps/interviewer/pwa-assets.config.ts.
export default defineConfig({
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    // Empty rather than absent: the Preset type requires the key.
    maskable: {
      sizes: [],
      padding: 0,
    },
    apple: {
      sizes: [180],
      padding: 0,
    },
  },
  images: ['public/architect-icon.png'],
});
