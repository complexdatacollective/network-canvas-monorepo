# @codaco/interviewer

## 8.0.0-beta.7

### Minor Changes

- Let researchers choose where an interview continues when a stage is skipped:
  the next available stage, a specific later stage, or the interview finish
  screen.
  Architect now shows these routes in the timeline and protocol summary and
  protects referenced destinations from invalid deletion or reordering.
  Preview only applies its one-stage skip override when routing could actually
  make the selected stage unavailable.
  The bundled Mental Health Networks and Transnational Networks templates now
  collect explicit consent and route declined consent to the finish screen.

  Interviewer follows the live route as answers change, keeps unavailable screens
  from flashing during recovery, and allows a skipped or bypassed screen to be
  opened once after confirmation.

### Patch Changes

- Fix roster name generator stages failing to load roster data in Interviewer.
- Load the newest app shell on fresh online launches while preserving the precached offline startup path and keeping in-progress interviews on the active offline-safe shell.
- End-to-end test suite and the fixes it surfaced:

  - Settings → Synthetic data now re-queries protocols when the tab is selected, so a protocol imported moments before Settings was opened becomes selectable without closing and reopening the dialog.
  - The Security tab no longer shows the step-up "require unlock" toggles and auto-lock timeout before a vault is configured — those controls were inert (and discarded on enrolment) without a secured, unlocked vault.
  - The authenticator/device-reset UI now treats an unconfigured device the same as an explicitly unsecured one: it reads "Device lock" / "Reset device" rather than "Authenticator" / "Revoke device lock" when there is no lock to revoke.
  - Added `data-testid` hooks to app chrome (protocol deck import, DataView toolbar/resume, settings trigger, synthetic controls, new-session form, interview-complete, lock/unlock forms, ambient background) to support the new end-to-end suite.

- Use responsive shared dialogs throughout Architect while preserving Interviewer's purpose-built home modal sizing.

## 8.0.0-beta.6

### Patch Changes

- Improved the animated background on Interviewer screens so lights drift in and wrap smoothly without leaving long empty gaps.
- Improve the Interviewer start screen on narrow displays by compacting the header
  brand and footer status indicators.
- Interviewer now lets users view and copy protocol validation errors when an import fails, making it easier to request support with the relevant details.
- Fix protocol import in Safari installed apps by moving Interviewer's import card onto a mounted `react-dropzone` file input, matching Architect's working file-picker pattern. The import card still supports click, keyboard activation, and drag-and-drop, but no longer relies on an ephemeral input created only when the card is clicked.

## 8.0.0-beta.5

### Minor Changes

- Saving an export no longer asks you to confirm that the file downloaded. On desktop Chrome and Edge, "Save export" now opens the standard Save-As dialog and the app knows the file was written; on iOS, Android, and Safari the share sheet is used as before; other browsers download the archive directly. Interviews are marked as exported automatically from the save outcome.
- Refine the start and data screens on tablet, especially in portrait:
  - Harmonise the top-bar view switcher, settings and lock buttons, and the protocol deck's navigation into one consistent translucent "glass" style.
  - Fix the "resume last interview" pill overlapping the view switcher and the protocol cards in portrait.
  - Reduce the page margins on smaller tablets in portrait so content has more room.
  - Widen the settings dialog and let its sections reflow responsively; the settings navigation now uses a tabbed layout.
  - Stop the data table's rubber-band overscroll, and give the data search field and status filter the same glass treatment.
  - Fix a Chrome-only issue where the import-protocol card's background blur did not render.

### Patch Changes

- Protocol cards on the start screen no longer condense or clip the study name when a card is selected. The name now always renders in full, and the description shrinks (or hides entirely) when the card is short on space — previously it was the other way around, so selecting a card could squeeze a long study name into a single clipped line. Card text also no longer scales below a legible minimum size on small windows. On small windows the "enter a case ID" step now scrolls inside the card instead of pushing the Start interview button out of view.
- Switching to another tab or app and back no longer locks the app on its own. Locking is now governed solely by the "Auto-lock after" inactivity timer in Security settings: the app locks only once it has been left unattended for the period you configure. Time spent with the app in the background still counts toward that timer, so an idle session locks on schedule even if it was hidden the whole time.
- Fix data export failing with "Permission denied" on desktop Chrome. When the browser reports that file sharing is available but the system share sheet then refuses the file, the export now falls back to a normal file download instead of failing.
- Fix the band of empty background around the screen edges when Interviewer is installed to the home screen (as a PWA) on iPad. In standalone display mode the app was sizing to an area that stopped short of the screen (leaving the backdrop showing below the interface) and reserved the top safe area app-wide (leaving a band above the interview navigation). The app now fills the full visible viewport and renders edge-to-edge, so backgrounds reach every edge while on-screen controls stay clear of the status bar and home indicator.
- Fixed protocol import on Safari: selecting a `.netcanvas` file from the file picker now imports correctly, including when Interviewer is installed as an app (Add to Dock). Previously the picker could silently fail because Safari discards a file input that isn't part of the page while the picker is open.
- Improved the storage-durability indicator for Safari. The app now re-requests persistent storage on your first interaction — Safari grants the request silently based on interaction history, so asking only at startup was routinely denied — and the indicator updates immediately when a grant lands. When running as an installed app, an ungranted request now shows as a calm "Storage best effort" note instead of a warning: installed-app data is kept separate from browsing data and is not subject to the browser's routine cleanup, and there is no further install action to take.
- Replace the encryption and storage status hints on the start screen with proper tooltips, so they're reachable with the keyboard and readable by screen readers, not just on mouse hover.

## 8.0.0-beta.4

### Minor Changes

- Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.

### Patch Changes

- Close data-loss and setup gaps surfaced by the pre-release audit follow-up:
  - **Export marking:** on browsers that can't report whether a file download completed (the object-URL fallback), the app now confirms the archive was saved before marking sessions as exported — a cancelled or blocked Save-As can no longer falsely mark a session "exported" (which fed the filter-to-exported → bulk-delete data-loss path).
  - **Setup wizard:** a failed same-method re-enrolment (e.g. cancelling the biometric prompt after the old vault was revoked) can no longer finish the wizard claiming a lock mode the vault doesn't actually hold.
  - **Lock screen:** a destructive "reset app data" confirmation opened while locked is now dismissed when the app unlocks, so it can't survive the lock boundary and fire over Home.

- Fixed an issue where double-clicking multiple .netcanvas files at once (with the installed app set as the file handler) could silently drop every file if even one of them had been moved or deleted since being opened. Readable files are now imported as normal, and a notification now appears if any of the files couldn't be read.

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
