# network-canvas-architect

## 6.6.1

### Patch Changes

- c10169f: Fix Architect preview mode. The preview window now renders the Interviewer from
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

- de16a62: # Network Canvas Architect 6.6.0

  This is a maintenance release of Network Canvas Architect. **We recommend that all existing
  users update.**

  There are no new features or changes to how the app works — everything behaves exactly as it
  did before.

  ## What's changed
  - **Updated core dependencies.** The technology the app is built on has been brought up to
    date, which improves stability and performance and lays the groundwork for future
    improvements.
  - **Compatibility with upcoming macOS versions.** This release ensures the app continues to
    run smoothly on the latest and upcoming versions of macOS.
  - **Improved security.** We've adopted current security best practices for building and
    distributing the app — including properly signed and notarized macOS builds — so you can be
    confident the software you download is genuine and safe to run.
