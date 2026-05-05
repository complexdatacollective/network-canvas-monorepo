---
"@codaco/interview": prerelease
---

Inline the Sociogram force-simulation Web Workers via `?worker&inline` so the published bundle no longer emits absolute `/assets/<hash>.js` worker URLs paired with `/* @vite-ignore */`. The previous emission only resolved under a Vite host runtime; Turbopack (Next.js 16's default bundler) treats the leading `/` as a server-relative import and fails the build with "server relative imports are not implemented yet". Workers are now embedded as Blob URLs at build time, which is bundler-agnostic. Trade-off: the d3-force worker code (~36 kB unminified, ~8 kB gzipped) ships in the main chunk instead of a separate request.
