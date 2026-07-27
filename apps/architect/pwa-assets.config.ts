import { defineConfig } from '@vite-pwa/assets-generator/config';

// The source icon is full-bleed (grid background baked in, compass mark already
// inside the maskable safe zone), so every variant renders at padding 0. The
// minimal2023Preset defaults would instead letterbox the apple/maskable icons
// onto a white 30%-padded tile, which is exactly the white-bordered dock icon
// this replaces. Matches apps/interviewer/pwa-assets.config.ts.
export default defineConfig({
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    maskable: {
      sizes: [512],
      padding: 0,
    },
    apple: {
      sizes: [180],
      padding: 0,
    },
  },
  images: ['public/architect-icon.png'],
});
