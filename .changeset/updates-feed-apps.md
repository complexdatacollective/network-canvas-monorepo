---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Release notes in the update dialogs now come from the Updates page on
networkcanvas.com rather than the GitHub release, and after an update the
dialog lists every change since the version you last opened, not only the
newest. Fresco's settings page shows the same notes for the versions between
the one it runs and the newest. When the Updates page has no entry for a
version, the GitHub release text is shown as before.

`@codaco/fresco-ui/appUpdate/releaseNotes` is now exported, with
`fetchFeedNotes` and `selectFeedNotes` for reading the feed and
`compareVersions` for ordering app versions. `fetchLatestReleaseNotes` takes the
running version, and `fetchReleaseNotesForVersion` takes the version opened
before the update; the GitHub-only lookups are `fetchLatestGitHubNotes` and
`fetchGitHubNotesForVersion`.

Update: Release notes in Architect, Interviewer and Fresco are now written for researchers, and after updating you see every change since the version you last used.
