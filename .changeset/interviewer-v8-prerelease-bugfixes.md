---
'@codaco/interviewer-v8': patch
---

Fix a batch of pre-release bugs found by a full-app audit (issues #751–#764):

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
