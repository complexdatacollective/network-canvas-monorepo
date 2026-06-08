---
'network-canvas-architect': patch
'network-canvas-interviewer': patch
---

Fix Architect preview mode. The preview window now renders the Interviewer from
the `network-canvas-interviewer` workspace package instead of a removed git
submodule (`network-canvas/`), whose absence left every preview load pointing at
a path that no longer existed.

- **Development** loads the Interviewer's Vite dev server for live reload, waiting
  for it to accept connections before loading so the window never lands on
  Chromium's error page. The Interviewer runs headless in this mode
  (`NC_PREVIEW_HOST`) — Architect owns the window and hosts the preview IPC.
- **Packaged builds** bundle the Interviewer's built renderer and preload into
  resources via `electron-builder` `extraResources`, replacing the dead
  `copy-interviewer-dist` prebuild step.
