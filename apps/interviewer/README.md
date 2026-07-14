# Network Canvas Interviewer

Network Canvas Interviewer is a single-user, offline-first research-data-collection app. It hosts the `@codaco/interview` engine and pairs it with a dashboard for managing protocols, managing collected sessions, and exporting data for analysis. It ships as one thing: an installable, offline-capable web app (a PWA), deployed continuously to Netlify. See [`SPEC.md`](./SPEC.md) for the full product specification and [`CLAUDE.md`](./CLAUDE.md) for the source-surface index.

## Stack

- **Web PWA**: Vite 8 + `vite-plugin-pwa` (`generateSW`), installable and offline-capable
- **UI runtime**: React 19, wouter routing, `@codaco/fresco-ui`, `@base-ui/react`, `motion`, `@codaco/art` (animated blob background)
- **Data**: Dexie 4 (IndexedDB)
- **Encryption at rest**: an in-app Web Crypto vault — PIN, passphrase, WebAuthn biometric (with mandatory recovery passphrase), or no security. See [CLAUDE.md](./CLAUDE.md#vault--auth) for the full model.
- **Export pipeline**: Effect 3 + `@codaco/network-exporters`, JSZip
- **Validation/migration**: `@codaco/protocol-validation`
- **Analytics**: PostHog, off by default, via a Cloudflare Worker relay

## Getting started

```bash
pnpm install          # from the repo root
pnpm --filter @codaco/interviewer dev
```

The dev server runs at `http://localhost:5180`.

## Commands

All commands run from this directory unless noted. The monorepo root `pnpm typecheck` and `pnpm lint` cover this app too.

```bash
pnpm dev              # Vite dev server
pnpm build            # production build + PWA integrity check (what CI deploys)
pnpm preview           # preview the production build locally
pnpm typecheck
pnpm test              # vitest, unit project
pnpm test:watch
pnpm storybook          # Storybook on :6006
```

Lint and format with the monorepo root `pnpm lint` / `pnpm lint:fix` (oxlint + oxfmt — 2-space indentation, single quotes).

## Architecture

```text
+--------------------------------------------------------------+
|                        Browser tab                            |
|  React 19 + wouter + fresco-ui + base-ui + motion + art       |
|                                                                |
|  AppErrorBoundary > AppProviders > AuthGate                   |
|    > Routes (Welcome / Home [Protocols `/` + Data `/data`]    |
|       / Interview)                                            |
|                                                                |
|  src/lib/db/api.ts      Dexie facade (protocols/sessions/     |
|                          assets/settings)                     |
|  src/lib/vault/          Web Crypto vault (DEK wrap/unwrap,   |
|                          WebAuthn PRF, AES-GCM field codec)   |
|  src/lib/auth/           enrol/unlock/verify/revoke + idle     |
|                          timer + step-up re-auth              |
|  src/lib/protocol/       .netcanvas import pipeline           |
|  src/lib/export/         Effect export pipeline               |
+--------------------------------------------------------------+
        |
        v
  IndexedDB (Dexie, DB name "interviewer")
  Sensitive fields (session network/stageMetadata, protocol
  protocol/codebook, asset data) stored as AES-GCM ciphertext
  when a secured vault mode is enrolled; index fields (caseId,
  protocolName, timestamps, status) stay plaintext for querying.
```

There's no server and no native shell: everything above runs in the tab, and all data lives in IndexedDB in the browser profile. A service worker (`vite-plugin-pwa`, `generateSW`) precaches the app shell so it boots offline once installed; a pending update applies automatically on a fresh load when no interview is in progress, and is otherwise surfaced as an "update available" control on the version indicator with the release changelog (never mid-interview).

## Vault & auth model

The app is gated by one of four mutually exclusive modes, chosen during first-run setup:

| Mode         | What it does                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pin`        | 8-digit PIN, PBKDF2 (600k iterations) derives a key that wraps a random AES-GCM data key.                                                                                                                                                                                                                                                                                                                          |
| `passphrase` | ≥ 12 characters, ≥ 3 character classes, same PBKDF2 envelope as PIN.                                                                                                                                                                                                                                                                                                                                               |
| `biometric`  | WebAuthn platform authenticator (Touch ID, Windows Hello, etc.) via the PRF extension, **plus** a mandatory recovery passphrase enrolled in the same step — losing the authenticator doesn't mean losing the data. Not offered in macOS Chromium installed-PWA windows, where the browser can't reach the iCloud Keychain authenticator (crbug.com/364926914); unlock there falls back to the recovery passphrase. |
| `none`       | No app-layer protection; data is stored unencrypted.                                                                                                                                                                                                                                                                                                                                                               |

Unlocking derives a data-encryption key (DEK) that lives only in memory for the life of the tab — reloading the page, locking, an idle timeout, or losing focus for ~30 seconds all drop it and re-lock the app. See [CLAUDE.md](./CLAUDE.md#vault--auth) for the cryptographic detail.

## Offline behaviour

The app is designed to be used with no network connection at all. Protocol import, interviews, and export all work entirely offline. The one exception is a protocol containing a Geospatial stage (it renders an online map) — starting one offline shows a warning, and the stage itself degrades gracefully with a persistent offline indicator if connectivity drops mid-interview. Analytics, when opted in, is the only other network traffic the app makes.

## Deploying

Netlify's Git integration builds a preview for every pull request. Production deploys are versioned and occur when the generated Release apps & documentation PR is merged. See [`RELEASING.md`](./RELEASING.md) for the full pipeline, the one-time Netlify setup, and how service-worker updates propagate to already-open tabs.
