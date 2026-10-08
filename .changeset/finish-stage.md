---
'@codaco/protocol-validation': minor
'@codaco/interview': major
'@codaco/protocol-utilities': minor
'@codaco/network-exporters': major
'@codaco/network-query': minor
'@codaco/shared-consts': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The screen that ends an interview is now part of the protocol. Researchers can
write its heading and text, translate them like the rest of the protocol, and
choose how an interview that ends there is recorded: completed, ineligible, or
ended early. That outcome is saved with each interview and exported.

**Protocols (`@codaco/protocol-validation`)**

- Schema 9 adds the `FinishSession` stage type, with a stage name, a heading
  (`title`), text (`content`) and an `outcome` of `completed`, `ineligible` or
  `terminated`. It has no skip logic.
- Every schema 9 protocol must end with a finish stage, and has exactly one.
  Validation refuses a protocol with no stages, one whose last stage is not a
  finish stage, any stage after a finish stage, and a second finish stage.
  `findTimelineStructureProblems` reports the same problems for a list of
  stages without validating the stages themselves.
- The v8 to v9 migration appends a finish stage, with id `finish` (or the
  next free `finish-2`, `finish-3`, …), outcome `completed`, and the text the
  interview has always shown there, in English under the protocol's default
  language. Its notes say so. A recorded interview that was on the old
  finish screen resumes on the new finish stage.
- A finish stage's name, heading and text may have no translation at all
  while a protocol is being written, so a protocol in a language Network
  Canvas has no closing text for starts without any. `validateProtocol` still
  refuses a protocol whose finish stage has no heading or text in its default
  language, with the issue code `finish_stage_text_missing`
  (`FINISH_STAGE_TEXT_MISSING`) naming what is missing. An editor passes
  `{ draft: true }` to allow it while the protocol is written.
  `findFinishStageTextProblems` reports the same problem without validating.
- `createDefaultFinishSessionStage`, `defaultFinishSessionText`,
  `defaultFinishSessionFields`, `hasDefaultFinishSessionText` and
  `withDefaultFinishSessionTranslation` supply that text in English, German,
  Spanish, French, Hungarian, Italian, Dutch, Brazilian Portuguese, and
  Simplified and Traditional Chinese.

**Interview runtime (`@codaco/interview`)**

- The finish stage shows the protocol's heading and text. Finishing records
  which finish stage the interview ended at and its outcome.
- **Breaking:** `onFinish` is now called as
  `onFinish(interviewId, { stageId, outcome }, signal)`. Hosts store both
  values and pass `finishStageId` back in `SessionPayload` when they reopen the
  interview.
- A finished interview opens in its completed state: the finish stage's
  heading and text and a notice that the answers can no longer be changed,
  with no way back into the interview. A host can add its own actions to it with
  the new `completedActions` prop. Review mode stops before the finish stage,
  and the stages menu no longer lists finish stages.
- A finished interview is shown in the language of whoever opens it, but
  never reports a language change: `onProtocolLocaleChange` is not called once
  the interview is finished, so the language it was taken in, which exports
  read, is kept.
- A finish stage with no heading or text, which only an Architect preview of a
  protocol still being written can have, shows the Finish button alone, and
  its completed state puts focus on the finished notice.
- `generateNetwork` leaves a completed synthetic interview on its finish
  stage, rather than one step past the last stage.
- Skip logic that skips to the finish goes to the first finish stage after the
  stage that owns the rule.

**Exports (`@codaco/network-exporters`, `@codaco/shared-consts`)**

- Each interview's outcome is exported: CSV ego files have a
  `networkCanvasFinishOutcome` column after `networkCanvasInterviewLocale`, and
  GraphML graphs an `nc:finishOutcome` attribute. **Breaking:**
  `InterviewExportInput` requires `finishOutcome`; pass `null` for an interview with no recorded
  outcome, whose CSV cell is then empty and whose GraphML attribute is left
  out. A variable exported under the column's name is renamed
  `networkCanvasFinishOutcome_2`, with a `'column-renamed'` warning.

**Architect**

- A new protocol starts with a finish stage, in each of its languages that
  Network Canvas has text for. The Finish Screen has its own editor, for its
  heading, text and outcome.
- A protocol whose finish stage has no heading or text in its default
  language — a new protocol in a language Network Canvas has no text for, or
  text a researcher cleared — can be edited, saved and reopened, but not
  downloaded. The stage list says so, with a link to the finish stage's
  editor, and every download is refused with the same explanation.
- The finish stage can't be deleted or moved, and the timeline won't place a
  stage after it. New stages are added before it, and a protocol never gains a
  second one.
- Adding a language fills in the finish stage's text in that language while
  its heading and text are still the text Network Canvas supplied.
- Finishing a preview shows the interview's completed state, with a button to
  start the preview again. The protocol summary prints the finish stage.

**Interviewer**

- A finished interview shows its completed state, with an **Exit** button. The
  outcome and finish stage are saved with the session (encrypted when the
  vault is on) and exported.

**Fresco**

- The `/interview/finished` page is gone: a finished interview's link shows
  its completed state, including to a participant who returns to it.
- Each interview's finish stage and outcome are stored and exported, and
  included in the interview API. Interviews finished before this upgrade have
  no outcome.
- The finish request must name a finish stage of the interview's protocol and
  its outcome.
- The cookie that limits a participant to one interview per protocol now holds
  the finished interview's id, and the browser no longer lets scripts read it.
- The dashboard's progress counts the finish stage as a stage.
