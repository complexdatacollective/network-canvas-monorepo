# Network Canvas Interviewer — Specification

## Overview

Network Canvas Interviewer is the next-generation release, superseding Network Canvas Interviewer Classic. It is a research-data-collection application for administering Network Canvas protocols and collecting personal network data from participants. It hosts the Network Canvas interview engine and pairs it with a dashboard for managing protocols, managing collected sessions, and exporting data for analysis. Its goal is to be a self-contained, offline-first tool a single researcher can install, configure, and operate without external infrastructure.

The app is **single-user on all platforms** — one researcher per installation, with no account system, no shared workspaces, and no multi-user data partitioning.

## Supported platforms

The app is a single web-only, offline-first Progressive Web App (PWA), installable from any modern browser on desktop or tablet. There is no separate desktop or tablet build — one deployment serves both, and feature parity is complete across devices. The app requests durable (non-evictable) storage from the operating system; installing it (rather than using it as a plain browser tab) gives the most reliable offline behaviour and storage persistence for fieldwork.

## Dashboard and management

A persistent app shell provides navigation between Home, Protocols, Interviews, and Settings.

### Home (start screen)

The start screen is implemented from a Claude Design handoff bundle. Use the following implementation prompt verbatim:

> Fetch this design file, read its readme, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/5XRFRSA6LAdVRW3tGSXlSQ?open_file=Variation+F+-+Minimal+Stage.html
>
> Implement: `Variation F - Minimal Stage.html`

### Protocols

- List of installed protocols showing name, schema version, import date, and interview count.
- Import a new protocol from a `.netcanvas` file.
- Start a new interview from any listed protocol.
- Delete a protocol; if interviews exist against it, the researcher is warned and must confirm cascade-deletion.

### Interviews

- List of all collected sessions with case ID, protocol name, start time, and status (in progress, finished, exported).
- Multi-select with bulk export and bulk delete.
- Resume an in-progress interview or review a finished one.

### Settings

Central place for user-configurable behaviour and diagnostics (see Settings below).

## Protocol handling

- Researchers import protocols by selecting a `.netcanvas` file from local storage.
- Each imported protocol is validated against the current protocol schema.
- Protocols authored against older schemas are **automatically migrated** to the current schema on import, with a notification telling the researcher migration occurred.
- Failed imports surface a clear error rather than corrupting storage.
- Protocol metadata and associated assets (images, video, audio, network data, geo data, API keys) are stored on-device for offline use.

## Interview experience

- Starting an interview prompts for a case ID, then launches the Network Canvas interview engine fullscreen.
- Interview progress (network data, current stage, stage metadata) is persisted continuously, so a participant can pause and resume mid-interview and the researcher can exit to the dashboard and pick up later without data loss.
- An always-visible exit control returns the researcher to the dashboard without finishing the interview.
- Finishing the interview marks the session as complete and returns to the interviews list.

## Data export

- Researchers select one or more sessions from the interviews list and trigger export.
- Output formats are user-configurable in Settings:
  - **GraphML** — for graph-analysis tools.
  - **CSV** — attribute and edge lists for spreadsheets, R, Python.
- Node positions can optionally be exported as **screen-coordinate pixels** at a researcher-defined resolution, instead of the default normalised (0–1) coordinates.
- Progress is reported per-stage and per-session.
- Selected sessions are packaged into a single `.zip` archive and downloaded. Successfully exported sessions are flagged as exported in the list.

## Storage

- All protocols, assets, sessions, and settings are stored **on-device only**, in the browser's IndexedDB. There is no cloud sync and no server component.
- Storage is persistent across app launches. The app requests durable (non-evictable) storage from the operating system.
- **The sensitive parts of the storage layer are encrypted at rest** whenever a secured auth mode is enrolled (see Security). A per-device data-encryption key, generated at setup, is unlocked by the researcher's credential and held in memory only for the current session — it never touches disk unencrypted and is dropped on lock, idle timeout, or reload. Without a successful unlock, that data is unreadable. Index fields used for search/sort/filter (case ID, protocol name, timestamps, status) are kept in plaintext so the dashboard can query them without decrypting every row.
- Under "no security" (see Security), storage relies entirely on the browser's own sandboxing; nothing app-level is encrypted.
- Settings displays a **storage-usage indicator** (used / available, percentage) and warns when usage is high, suggesting the researcher export and delete old interviews.

## Security

During first-run setup, the researcher enrols exactly one of four mutually exclusive auth modes, each gating both app access and (except "No security") the data-encryption key:

1. **PIN** — an 8-digit code.
2. **Passphrase** — a free-form phrase of at least 12 characters mixing at least 3 character classes.
3. **Biometric** — a WebAuthn platform authenticator (Touch ID, Windows Hello, or equivalent), using the PRF extension to derive the encryption key from the authenticator itself, with no separate secret for the researcher to remember day to day. Enrolling biometric **requires** setting a recovery passphrase in the same step, kept as an independent way to unlock if the authenticator is ever unavailable. Enrolment only completes on authenticators that support the PRF extension; where the browser can't reach one — notably macOS Chromium installed-PWA windows (crbug.com/364926914) — biometric is not offered, and an already-enrolled vault unlocks with the recovery passphrase there instead.
4. **No security** — the researcher explicitly declines protection; the app is unlocked at all times and nothing is encrypted at the app layer.

For PIN, passphrase, and biometric, unlocking derives (or, for biometric, releases) the key that decrypts the sensitive parts of on-device storage — the app does not implement a separate "app gate" distinct from the storage key. Losing that credential means the data it protects cannot be decrypted; there is no backdoor.

The lock screen reveals **nothing** about stored data — no protocol names, no session counts, no researcher identity.

### Auto-lock

- **Idle auto-lock** with a user-configurable timeout: 1, 5, 15, 30, or 60 minutes (default 15). Not applied under "No security", since there is nothing to lock.
- **Re-lock on extended focus loss** (losing focus for roughly 30 seconds) and whenever the tab reloads.
- A "Lock now" action is always available in Settings.

### Recovery

- **PIN and passphrase have no recovery.** Forgetting either means the data they protect is permanently inaccessible on that device — there is no reset, bypass, or backdoor. Setup requires explicit acknowledgement of this before enrolling either mode.
- **Biometric has one recovery path**: the passphrase set alongside it at enrolment. Losing both the authenticator and the recovery passphrase means the same permanent loss as PIN/passphrase.
- Settings reminds the researcher to export regularly regardless of mode, since none of them offer a way to recover lost credentials.

## Settings

User-configurable options:

- **Data export** — toggle GraphML, toggle CSV, toggle screen-coordinate output, set screen layout width and height.
- **Idle timeout** — choose re-lock interval.
- **Manage authenticator** — view the enrolled mode; re-enrol a replacement PIN or passphrase (requires proving the current one, and preserves access to existing data); or revoke, which destroys the encrypted store and returns to first-run setup. Biometric has no re-enrol path — changing it requires revoking first.
- **Lock now** — immediate manual lock.
- **Reset to defaults** for export settings.

Settings also reports storage usage and storage persistence state for support and diagnostics.

## Empty-state behaviour

- With no protocols installed, Home and the Protocols list both prompt the researcher to import a `.netcanvas` file as the obvious next action.
- With no sessions, the resume card and Interviews list explain that interviews will appear there once started.

## Out of scope

Explicit non-goals:

- **No cloud sync** and no remote backup.
- **No cross-device migration** of interviews or protocols.
- **No protocol authoring** — protocols are authored in the Architect app and imported here.
- **No credential recovery for PIN or passphrase** — losing either means data loss by design; biometric's only recovery path is the passphrase set at enrolment.
- **No multi-user support** — the app is single-user; no account system, no shared workspaces.
- **No native desktop or tablet build** — the app is web-only.
