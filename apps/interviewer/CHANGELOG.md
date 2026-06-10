# network-canvas-interviewer

## 6.6.0

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

- de16a62: # Network Canvas Interviewer 6.6.0

  This is a maintenance release of Network Canvas Interviewer. **We recommend that all existing
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

## 6.5.10

### Patch Changes

- Updated dependencies [ae81956]
  - @codaco/network-exporters@1.0.2

## 6.5.9

### Patch Changes

- Updated dependencies
  - @codaco/network-query@1.0.1

## 6.5.8

### Patch Changes

- Updated dependencies [23efeeb]
  - @codaco/network-exporters@1.0.1

## 6.5.7

### Patch Changes

- Updated dependencies [4335dee]
- Updated dependencies [fe48a62]
- Updated dependencies [e31e28d]
  - @codaco/network-exporters@1.0.0
  - @codaco/network-query@1.0.0

## 6.5.6

### Patch Changes

- @codaco/network-exporters@0.1.2
- @codaco/network-query@0.1.2

## 6.5.5

### Patch Changes

- @codaco/network-exporters@0.1.1
- @codaco/network-query@0.1.1
