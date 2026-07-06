import { defineConfig } from '@vite-pwa/assets-generator/config';

// The source icon is full-bleed (dark brand gradient baked in, mark already
// inside the maskable safe zone — see src/assets/interviewer-icon.svg), so
// every variant renders at padding 0. The generator's defaults would instead
// letterbox the apple/maskable icons onto a white 30%-padded tile, which is
// exactly the washed-out dock icon this replaces.
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
  images: ['public/interviewer-icon.png'],
});
