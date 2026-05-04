---
"@codaco/network-exporters": patch
---

Fix `.d.ts` output paths for the multi-entry build. Types were being emitted at `dist/src/<name>.d.ts` while `package.json` declared them at `dist/<name>.d.ts`, breaking type resolution for every subpath export. Configure `vite-plugin-dts` with `entryRoot: "src"` so types land alongside their JS counterparts.
