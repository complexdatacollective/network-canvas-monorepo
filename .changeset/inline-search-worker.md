---
'@codaco/fresco-ui': patch
---

Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.
