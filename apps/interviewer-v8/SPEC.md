# Network Canvas Interviewer v8 — Specification

## Overview

Network Canvas Interviewer v8 is the next-generation release of the existing Network Canvas Interviewer app. It is a research-data-collection application for administering Network Canvas protocols and collecting personal network data from participants. It hosts the Network Canvas interview engine and pairs it with a dashboard for managing protocols, managing collected sessions, and exporting data for analysis. Its goal is to be a self-contained, offline-first tool a single researcher can install, configure, and operate without external infrastructure.

The app is **single-user on all platforms** — one researcher per installation, with no account system, no shared workspaces, and no multi-user data partitioning.

## Supported platforms

The app runs on three target platforms from a single codebase:

- **Desktop** (Windows, macOS, Linux) — the primary target for researchers running interviews on a laptop.
- **Tablet** (iPadOS, Android) — for in-field, touch-driven data collection.
- **Web** — positioned for development. Storage durability is best-effort here; native installs are recommended for fieldwork.

Feature parity is intended across platforms except where the OS requires a different security posture (see Security).

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

- All protocols, assets, sessions, and settings are stored **on-device only**. There is no cloud sync and no server component.
- Storage is persistent across app launches. On desktop, storage is durable by design; on tablet and web, the app requests durable (non-evictable) storage from the operating system.
- **On desktop, the storage layer is encrypted at rest.** The encryption key is held by a Web Authentication API credential enrolled during setup; the app obtains the key only after a successful authentication. Without that credential the on-disk data is unreadable.
- On tablet and web, storage relies on the platform's own at-rest protections; Web Authentication is used to gate access to the running app rather than to derive a storage key.
- Settings displays a **storage-usage indicator** (used / available, percentage) and warns when usage is high, suggesting the researcher export and delete old interviews.

## Security

The app uses the **Web Authentication API** (WebAuthn) as its sole authentication mechanism. A platform authenticator credential is enrolled during initial setup and is bound to the device.

WebAuthn serves two purposes:

1. **Unlock the app** on all platforms — the researcher must satisfy the authenticator before the dashboard or any stored data becomes accessible.
2. **Decrypt the storage layer on desktop** — the same authentication releases the key used to decrypt on-device storage. On desktop this is mandatory; the encrypted database cannot be opened without it.

How the authenticator verifies the researcher (PIN, platform biometric, security key, etc.) is determined by the operating system and the credential type. The app does not implement, configure, or expose biometric behaviour directly — that is a property of the underlying WebAuthn credential.

The lock screen reveals **nothing** about stored data — no protocol names, no session counts, no researcher identity.

### Auto-lock

- **Idle auto-lock** with a user-configurable timeout: 1, 5, 15, 30, or 60 minutes (default 15).
- **Re-lock on app close** and on extended focus loss.
- A "Lock now" action is always available in Settings.

### Recovery

- There is **no credential recovery flow**. Losing the enrolled WebAuthn credential (e.g. wiped device, removed platform authenticator) means losing access to the data on that device — the deliberate trade-off for strong on-device confidentiality. Setup requires explicit acknowledgement of this, and Settings reminds the researcher to export regularly.

## Settings

User-configurable options:

- **Data export** — toggle GraphML, toggle CSV, toggle screen-coordinate output, set screen layout width and height.
- **Idle timeout** — choose re-lock interval.
- **Manage authenticator** — view the enrolled WebAuthn credential, re-enrol a replacement (requires a successful authentication with the current credential), or revoke it. Revoking on desktop destroys the encrypted store.
- **Lock now** — immediate manual lock.
- **Reset to defaults** for export settings.

Settings also reports the current platform, storage usage, and storage persistence state for support and diagnostics.

## Empty-state behaviour

- With no protocols installed, Home and the Protocols list both prompt the researcher to import a `.netcanvas` file as the obvious next action.
- With no sessions, the resume card and Interviews list explain that interviews will appear there once started.

## Out of scope

Explicit non-goals:

- **No cloud sync** and no remote backup.
- **No cross-device migration** of interviews or protocols.
- **No protocol authoring** — protocols are authored in the Architect app and imported here.
- **No credential recovery** — losing the enrolled WebAuthn credential means data loss by design.
- **No multi-user support** — the app is single-user on every platform; no account system, no shared workspaces.
