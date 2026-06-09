---
'network-canvas-architect': patch
'network-canvas-interviewer': patch
---

# Network Canvas 6.6.0

Network Canvas Architect and Interviewer 6.6.0 — the first desktop release built and
published from the consolidated monorepo.

This release is produced automatically by the monorepo release pipeline: the app source is
mirrored to its standalone repository (`complexdatacollective/architect` /
`complexdatacollective/interviewer`) with workspace and catalog dependencies resolved to
npm-installable versions, tagged, and built into signed/notarized desktop installers for
macOS, Windows, and Linux.

## Highlights

- Rebuilt and released from the Network Canvas monorepo.
- macOS builds are signed and notarized; Windows and Linux installers are provided for all
  supported architectures.
