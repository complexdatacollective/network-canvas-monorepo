# Modern Interviewer App – Specification

This document describes the design of `@codaco/modern-interviewer`, a new ground-up
React 19 + Vite + TypeScript application that replaces the legacy
`apps/interviewer` Electron/Cordova app with a modern, cross-platform build.

## Goals

1. Provide a **dashboard / backend area** for managing protocols and interviews.
2. Provide a **runner page** that hosts the `<Shell />` component from
   `@codaco/interview` to drive a participant through an interview.
3. Support **three deployment targets** from one Vite codebase:
   - Web (browser, used for development and on-line embedding).
   - Desktop (Electron, packaged via electron-builder).
   - Tablet (Capacitor, packaged for iPadOS and Android).
4. Use the shared **`@codaco/tailwind-config` Fresco theme** and components
   from `@codaco/fresco-ui`.

## Tech stack

| Concern                | Choice                                                  |
| ---------------------- | ------------------------------------------------------- |
| Bundler                | Vite 8 + `@vitejs/plugin-react`                         |
| UI                     | React 19, JSX automatic runtime                         |
| Routing                | `wouter` (mirrors `architect-web`)                      |
| Styling                | Tailwind v4 via `@tailwindcss/vite`, `fresco` theme     |
| State                  | Local Zustand + Redux (carried by `Shell` internally)   |
| Storage                | Dexie (IndexedDB) – primary persistence on all targets  |
| Protocol parsing       | `@codaco/protocol-validation`                           |
| Interview engine       | `@codaco/interview`                                     |
| Export pipeline        | `@codaco/network-exporters` + Effect-TS + `fflate`      |
| Desktop runtime        | Electron + `electron-vite` + `electron-builder`         |
| Mobile runtime         | `@capacitor/core` + `@capacitor/ios` + `@capacitor/android` |
| Lint / format          | Biome (monorepo config)                                 |
| Tests                  | Vitest with `jsdom`                                     |

## Directory layout

```
apps/modern-interviewer/
├── README.md
├── SPECIFICATION.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── capacitor.config.ts
├── electron.vite.config.ts
├── electron-builder.config.cjs
├── electron/
│   ├── main.ts                 # Electron main process entry
│   └── preload.ts              # Context-bridge preload script
├── public/                     # Static assets (icons, etc.)
└── src/
    ├── main.tsx                # React DOM root
    ├── App.tsx                 # Top-level providers + router
    ├── env.ts                  # Runtime environment detection (web/desktop/tablet)
    ├── analytics.ts            # PostHog client bootstrap (optional)
    ├── styles/
    │   └── tailwind.css        # Imports @codaco/tailwind-config/fresco.css
    ├── lib/
    │   ├── db.ts               # Dexie database
    │   ├── installation-id.ts  # Persistent installation ID (LocalStorage)
    │   ├── ids.ts              # uuid helpers
    │   └── format.ts           # Display helpers (dates, sizes, etc.)
    ├── platform/
    │   ├── index.ts            # Platform abstraction (web / desktop / tablet)
    │   ├── web.ts              # Web file/save implementations
    │   ├── desktop.ts          # Desktop file/save (delegates to preload IPC)
    │   └── tablet.ts           # Capacitor Filesystem-based implementations
    ├── protocols/
    │   ├── import-protocol.ts  # extract + migrate + validate + hash + persist
    │   ├── asset-resolution.ts # Map ExtractedAsset → ResolvedAsset (incl. object URLs)
    │   └── derive-asset-type.ts
    ├── interviews/
    │   ├── create-interview.ts
    │   ├── load-interview.ts
    │   ├── sync-interview.ts   # SyncHandler implementation (writes to Dexie)
    │   └── finish-interview.ts
    ├── exports/
    │   ├── run-export.ts       # Top-level exportPipeline wrapper
    │   ├── repositories.ts     # Dexie-backed Effect Layers for the exporter
    │   └── browser-zip.ts      # Browser-friendly ZipOutput sink (Blob)
    ├── components/
    │   ├── AppShell.tsx        # Dashboard frame (sidebar + main)
    │   ├── PageHeader.tsx
    │   ├── FileDropTarget.tsx  # Reusable drag-and-drop file zone
    │   ├── EmptyState.tsx
    │   ├── ProgressDialog.tsx
    │   └── ConfirmDialog.tsx
    └── pages/
        ├── DashboardPage.tsx     # Default landing: stats + recent items
        ├── ProtocolsPage.tsx     # List + import + delete protocols
        ├── ProtocolDetailPage.tsx
        ├── InterviewsPage.tsx    # List + filter interviews
        ├── InterviewRunnerPage.tsx # <Shell /> host
        ├── ExportPage.tsx        # Select interviews + run export
        └── SettingsPage.tsx
```

## Data model (Dexie)

```ts
db.protocols      // key: id (uuid)
  { id, hash, name, schemaVersion, importedAt, lastUsedAt, payload (JSON), assetIds[] }

db.assets         // key: assetId (string; from protocol manifest)
  { assetId, protocolId, name, type, blob? (Blob), value? (string for apikey) }

db.interviews     // key: id (uuid)
  { id, protocolId, protocolHash, participantIdentifier, startTime, lastUpdated,
    finishTime, exportTime, currentStep, network (NcNetwork),
    stageMetadata?, stageRequiresEncryption? }
```

## Runtime contract — Shell integration

```ts
<Shell
  payload={{ protocol, session }}
  currentStep={currentStep}
  onStepChange={setStep}
  onSync={(id, session) => writeSession(id, session)}
  onFinish={(id, signal) => markFinished(id)}
  onRequestAsset={(assetId) => objectUrlFor(assetId)}
  analytics={{ installationId, hostApp: 'ModernInterviewer', hostVersion: APP_VERSION }}
  disableAnalytics
/>
```

`onRequestAsset` returns object-URLs created from the asset Blobs stored in
Dexie. Object URLs are revoked when the interview unmounts.

## Export contract — `network-exporters` integration

The export page uses Effect to wire three Layers into `exportPipeline`:

- `InterviewRepository`: queries Dexie for selected interview IDs,
  maps records to `InterviewExportInput`.
- `ProtocolRepository`: queries Dexie for the unique protocol hashes
  encountered, maps to `ProtocolExportInput` (hash + name + codebook).
- `Output`: a browser-friendly `ZipOutput` whose sink concatenates the
  fflate stream into a single `Blob`, which is downloaded via a
  hidden anchor (web/desktop) or saved via Capacitor Filesystem (tablet).

## Deployment targets

### Web (default)

```bash
pnpm --filter @codaco/modern-interviewer dev      # vite dev server
pnpm --filter @codaco/modern-interviewer build    # produces dist/
pnpm --filter @codaco/modern-interviewer preview  # static preview
```

### Desktop (Electron)

`electron.vite.config.ts` defines three targets: `main`, `preload`,
`renderer`. The renderer reuses the regular `vite.config.ts` config.

```bash
pnpm --filter @codaco/modern-interviewer electron:dev
pnpm --filter @codaco/modern-interviewer electron:build
pnpm --filter @codaco/modern-interviewer electron:dist        # all platforms
pnpm --filter @codaco/modern-interviewer electron:dist:mac
pnpm --filter @codaco/modern-interviewer electron:dist:win
pnpm --filter @codaco/modern-interviewer electron:dist:linux
```

Electron exposes a minimal `window.modernInterviewerNative` API via
`contextBridge` (preload) so the renderer can:

- save the export ZIP to a chosen path,
- pick a `.netcanvas` file for import (instead of HTML file input).

### Tablet (Capacitor)

```bash
pnpm --filter @codaco/modern-interviewer build
pnpm --filter @codaco/modern-interviewer capacitor:sync
pnpm --filter @codaco/modern-interviewer capacitor:open:ios     # opens Xcode
pnpm --filter @codaco/modern-interviewer capacitor:open:android # opens Android Studio
```

Capacitor is configured to wrap the Vite `dist/` folder. Platform
detection (`src/platform/index.ts`) checks `Capacitor.isNativePlatform()`
at runtime and swaps to the native Filesystem implementation.

## Out of scope (initial release)

- Network sync / multi-device interview resumption (Dexie only).
- Cloud uploads (only the export ZIP is produced; user handles transfer).
- Translations / i18n (English-only).
- Built-in update checker (Electron auto-updater can be added later).
