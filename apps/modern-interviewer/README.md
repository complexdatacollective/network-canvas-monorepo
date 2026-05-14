# @codaco/modern-interviewer

A modern Network Canvas Interviewer app, built on React 19 + Vite + TypeScript.
Targets three runtimes from one codebase:

- **Web** — `pnpm dev` / `pnpm build` (standard Vite)
- **Desktop** — Electron via `electron-vite` + packaged with `electron-builder`
- **Tablet** — iPadOS and Android via Capacitor

The app provides:

1. A **dashboard** for managing protocols (import, browse, delete) and
   interviews (resume, review, delete), backed by IndexedDB (Dexie).
2. A **runner page** that hosts `<Shell />` from `@codaco/interview` to
   drive a participant through an interview.
3. An **export page** that drives `@codaco/network-exporters` against
   Dexie-backed repositories and saves a ZIP archive via the platform's
   preferred file-save mechanism.

See `SPECIFICATION.md` for the full design.

## Development

```bash
pnpm install
pnpm --filter @codaco/modern-interviewer dev          # web dev server
pnpm --filter @codaco/modern-interviewer build        # static web build → dist/
pnpm --filter @codaco/modern-interviewer typecheck
pnpm --filter @codaco/modern-interviewer test
```

## Desktop

```bash
pnpm --filter @codaco/modern-interviewer electron:dev        # opens Electron
pnpm --filter @codaco/modern-interviewer electron:build      # produce out/
pnpm --filter @codaco/modern-interviewer electron:dist:mac   # mac dmg + zip
pnpm --filter @codaco/modern-interviewer electron:dist:win   # win nsis
pnpm --filter @codaco/modern-interviewer electron:dist:linux # AppImage, deb, rpm
```

## Tablet (Capacitor)

```bash
pnpm --filter @codaco/modern-interviewer build
pnpm --filter @codaco/modern-interviewer capacitor:sync
pnpm --filter @codaco/modern-interviewer capacitor:open:ios     # opens Xcode
pnpm --filter @codaco/modern-interviewer capacitor:open:android # opens Android Studio
```

The iOS and Android native projects are not committed; run
`pnpm exec cap add ios` / `pnpm exec cap add android` once to scaffold
them. Capacitor wraps `dist/` (the regular Vite output), so a fresh build
must be produced before each `cap sync`.
