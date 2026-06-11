# @codaco/interviewer-v7

The Interviewer (v7) app is pre-publish, so this changelog is maintained by hand
rather than generated from changesets (the app is excluded from changeset
versioning via `ignore` in `.changeset/config.json`).

## Unreleased

### Added

- Motion-native protocol deck — the protocol carousel was rewritten from Swiper
  to a motion-native implementation (velocity-aware drag snap, mouse-wheel
  stepping, keyboard navigation), with the new-session case-ID form rendered
  inline in the active deck card.
- Protocol import surfaces a pending card with live progress, and the sample
  protocol installs directly from its deck slot, morphing in place
  (sample → installing → installed).
- Setup wizard gained an explicit "no security" enrollment path.

### Changed

- Long protocol names use a stepped heading scale with a fitted whole-line clamp,
  so the card footer can never be pushed off the card.
- Swappable card regions (footer, controls row, requires-internet pill) share one
  coordinated transition.
- New onboarding / secure-data glyphs and visual refinements.

### Fixed

- Generating or deleting synthetic data in Settings now refreshes the data
  table immediately, instead of leaving it showing stale sessions.
- App error boundary now shows a non-dismissible modal with a reload action.
- Dexie remains usable after a web storage revoke.
- Privacy/analytics copy clarified; toggle thumb styling corrected.

### Removed

- `swiper` dependency.
