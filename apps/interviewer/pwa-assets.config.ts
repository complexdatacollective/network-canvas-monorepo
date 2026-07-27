import { defineConfig } from '@vite-pwa/assets-generator/config';

// The source icon is full-bleed (dark brand gradient baked in — see
// src/assets/interviewer-icon.svg), so every variant renders at padding 0. The
// generator's defaults would instead letterbox the apple icon onto a white
// 30%-padded tile, which is the washed-out dock icon this replaces.
//
// No maskable variant is generated here. Safari renders the apple-touch-icon at
// ~0.90 of the tile while Chrome renders a maskable icon at ~1.06, so identical
// pixels come out ~1.18x larger in Chrome. The maskable icon therefore needs its
// own artwork, pre-scaled to 0.85 (see src/assets/interviewer-icon-maskable.svg)
// and committed at public/maskable-icon-512x512.png; vite.config.ts lists it in
// the manifest.
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
  images: ['public/interviewer-icon.png'],
});
