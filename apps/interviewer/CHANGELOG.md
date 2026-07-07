# @codaco/interviewer

## 8.0.0-beta.3

### Patch Changes

- On the home screen, clicking a protocol or sample card no longer starts an interview or installs the sample by itself — those actions now require the card's own button. Clicking a card still brings it to the centre of the deck.
- Importing a protocol is quicker: drop a `.netcanvas` file straight onto the import card on the home screen, or click the card to choose a file. The card now carries the note about authoring protocols in Architect, and the separate import dialog it used to open has been removed.

## 8.0.0-beta.2

### Major Changes

- Renamed the app from "Network Canvas Interviewer 8" to **Network Canvas Interviewer** (package `@codaco/interviewer`).

  **This update resets the app's local data.** The internal storage identity changed, so an existing installation starts fresh after updating: previously imported protocols and collected sessions are not carried over, the encrypted vault must be set up again, and any biometric unlock must be re-enrolled. **Export any sessions you need before you update.**

### Patch Changes

- Stopped animating the decorative background during an interview. The interview screen already covers it completely, so the animation was running unseen — pausing it while a session is open reduces battery use on long interviews.

## 8.0.0-beta.1

### Patch Changes

- Fix a batch of pre-release bugs found by a full-app audit (issues #751–#764):
  - **Analytics no longer contacts the PostHog relay when opted out** (#751). The client is constructed only once analytics is enabled; opting out keeps the app fully offline. Opting in at runtime still lazily initialises without a reload.
  - **Sessions are marked exported only after the archive is actually saved** (#752). Previously `exportedAt` was set when the archive was built in memory, so a cancelled/abandoned share left sessions falsely marked exported — a data-loss risk when later pruning "exported" records. The table now refreshes on a confirmed save.
  - **Date-range filters are computed in local time** (#753), so "today" and deep-linked `started*` ranges select the right sessions in every timezone (previously off by the UTC offset west of UTC).
  - **A finished interview can no longer be silently un-finished** (#754, #756). `finishedAt` is written only by `markSessionFinished`, and `updateSession`/`markSessionFinished`/`markSessionsExported` now serialise per session id, so a trailing autosave can't revert a completion/export marker or drop concurrently-written network data.
  - **React render-error reporting actually reaches PostHog** (#755): the reporting error boundary is now mounted inside `AnalyticsProvider` (with a bare outer boundary for provider-construction crashes).
  - **Two protocols that share a name but differ in content each keep their own card** (#757) and stay independently startable and deletable; the just-installed card stays centred.
  - **Re-importing a protocol with changed assets no longer serves stale asset bytes** (#758): the asset cache key changes on re-import and superseded object URLs are revoked.
  - **The setup wizard can't finish with the wrong lock method** (#759): changing the method after configuring one re-runs enrolment for the newly chosen method.
  - **Exporting an in-progress session no longer reclassifies it as complete** (#764): completion status is derived from `finishedAt`, independent of export status, so its Resume affordance and counts stay correct.
  - **A corrupt or newer-version vault record no longer routes to fresh setup** (#762), which would overwrite the only wrapped copy of the encryption key. A dedicated recovery screen offers a reload (a newer app version may read it) or an explicit, confirmed reset.
  - **An in-flight unlock can't install a stale key after a cross-tab revoke/re-enrol** (#763): the vault is re-checked after the key is derived (relevant to biometric unlock, whose OS prompt can stay open for a while).
  - **Open dialogs no longer survive an app lock** (#760): a destructive confirm (delete protocol, reset device) or a pending step-up is dismissed when the app locks, so it can't be actioned on unlock with stale context.
  - **Back from Home no longer re-enters a just-exited interview** (#761): the interview's history guard consumes its pinned entry on exit and reuses it across lock/unlock rather than stacking duplicates.

## 8.0.0-beta.0

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
