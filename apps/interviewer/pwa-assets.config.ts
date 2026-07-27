import { defineConfig } from '@vite-pwa/assets-generator/config';

// The source icon is full-bleed (dark brand gradient baked in — see
// src/assets/interviewer-icon.svg), so every variant renders at padding 0. The
// generator's defaults would instead letterbox the apple icon onto a white
// 30%-padded tile, which is the washed-out dock icon this replaces.
//
// No maskable variant is generated here, because it needs different artwork
// from the rest. Measured from the generated .icns of both installed apps on
// macOS: Safari's "Add to Dock" picks the maskable manifest entry and renders
// it 1:1 into the icon shape, while Chrome uses the `any` entry and magnifies
// it ~1.057x. Identical pixels therefore come out ~1.057x larger in Chrome.
//
// So the maskable artwork carries the mark at 1.057x this source's scale (see
// src/assets/interviewer-icon-maskable.svg) and is committed at
// public/maskable-icon-512x512.png, which cancels the difference;
// vite.config.ts lists it in the manifest.
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
