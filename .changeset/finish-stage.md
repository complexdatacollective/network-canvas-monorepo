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
write what participants read before and after they finish, translate it like
the rest of the protocol, and choose how an interview that ends there is
recorded: completed, ineligible, or ended early. That outcome is saved with each
interview and exported. A finish stage either waits for participants to confirm
or finishes the interview as soon as they reach it, and a protocol can end with
several, such as a separate ending for participants who are not eligible.

**Protocols (`@codaco/protocol-validation`)**

- Schema 9 adds the `FinishSession` stage type, with a stage name, a `mode`
  of `confirmation` or `automatic`, the closing screen's Markdown (`content`,
  heading included, shown only in `confirmation` mode), the finished screen's
  Markdown (`finishedContent`), the Finish button label, confirmation question
  and failure message, and an `outcome` of `completed`, `ineligible` or
  `terminated`. It has no skip logic.
- Every schema 9 protocol must end with a finish stage, and may end with
  several. Validation refuses a protocol with no stages, one whose last stage
  is not a finish stage, and any other stage after the first finish stage.
  `findTimelineStructureProblems` reports the same problems for a list of
  stages without validating the stages themselves.
- The v8 to v9 migration appends a finish stage in `confirmation` mode, with
  id `finish` (or the next free `finish-2`, `finish-3`, …), outcome
  `completed`, and the text the interview has always shown there, in English under the protocol's default
  language. Its notes say so. A recorded interview that was on the old
  finish screen resumes on the new finish stage. Run again over a document
  already in schema 9 form, as Fresco's deploy normalization does, it keeps a
  finish stage the document already ends at, and gives one that has none the
  supplied text in the document's own languages.
- A finish stage's name and text may have no translation at all while a
  protocol is being written, so a protocol in a language Network Canvas has no
  closing text for starts without any. `validateProtocol` still refuses a
  protocol whose finish stage has no finished text, or no closing text in
  `confirmation` mode, in its default language, with the issue code `finish_stage_text_missing`
  (`FINISH_STAGE_TEXT_MISSING`) naming what is missing. An editor passes
  `{ draft: true }` to allow it while the protocol is written.
  `findFinishStageTextProblems` reports the same problem without validating.
  Text made only of spaces or invisible characters counts as missing, and a
  translation of a finish stage's name or text that is given at all
  must not be blank, in any language and in a draft too.
- `createDefaultFinishSessionStage`, `defaultFinishSessionText`,
  `defaultFinishSessionFields`, `hasDefaultFinishSessionText` and
  `withDefaultFinishSessionTranslation` supply that text in English, German,
  Spanish, French, Hungarian, Italian, Dutch, Brazilian Portuguese, and
  Simplified and Traditional Chinese.

**Interview runtime (`@codaco/interview`)**

- In `confirmation` mode the finish stage shows its closing text and a Finish
  button, which asks participants to confirm; once the interview is finished
  it shows the finished text. If finishing fails, the closing text comes back
  with an error toast. Participants can go back until they finish.
- In `automatic` mode the interview finishes as soon as the stage is shown,
  and participants then see the finished text. They can't go back. If
  finishing fails they see the error with a button to try again.
- No finish stage lets participants move forward. Finishing records which
  finish stage the interview ended at and its outcome.
- **Breaking:** `onFinish` is now called as
  `onFinish(interviewId, { stageId, outcome }, signal)`. Hosts store both
  values and pass `finishStageId` back in `SessionPayload` when they reopen the
  interview.
- A finished interview opens in its completed state: the finished text of
  the finish stage it ended at, with no way back into the interview. A host can add its own actions to it with
  the new `completedActions` prop. Review mode stops before the finish stage,
  and the stages menu no longer lists finish stages. A review of a protocol
  with nothing before its finish stage shows that stage's text read-only,
  with an **Exit review** button when the host passes `onExit`.
- A host that lets a finished interview be changed passes the new
  `openFinishedAsActive` Shell prop. The interview then opens at its stages
  rather than in its completed state.
- A finish stage with no text, which only an Architect preview of a protocol
  still being written can have, shows the Finish button alone.
- `generateNetwork` leaves a completed synthetic interview on its finish
  stage, rather than one step past the last stage.
- Skip logic that skips to the finish goes to the first finish stage after the
  stage that owns the rule. Skip logic can also name a later finish stage.

**Exports (`@codaco/network-exporters`, `@codaco/shared-consts`)**

- Each interview's outcome is exported: CSV ego files have a
  `networkCanvasFinishOutcome` column after `COMMIT_HASH`, and
  GraphML graphs an `nc:finishOutcome` attribute. **Breaking:**
  `InterviewExportInput` requires `finishOutcome`; pass `null` for an interview with no recorded
  outcome, whose CSV cell is then empty and whose GraphML attribute is left
  out. A variable exported under the column's name is renamed
  `networkCanvasFinishOutcome_2`, with a `'column-renamed'` warning.

**Architect**

- A new protocol starts with a finish stage, in each of its languages that
  Network Canvas has text for. The Finish Screen has its own editor, for its
  mode, closing and finished text, and outcome. More Finish Screens can be
  added from the New Stage chooser, and a skip rule can end the interview at
  any of them.
- A protocol whose finish stage is missing text in its default
  language — a new protocol in a language Network Canvas has no text for, or
  text a researcher cleared — can be edited, saved and reopened, but not
  downloaded. The stage list says so, with a link to the finish stage's
  editor, and every download is refused with the same explanation.
- Finish stages stay together at the end of the timeline: they can be
  reordered among themselves, but dragging one above the first finish stage,
  or another stage below it, stops at that point. A protocol's only finish
  stage can't be deleted. New stages are added before the finish stages.
- Adding a language fills in the finish stage's text in that language while
  it is still the text Network Canvas supplied.
- Finishing a preview shows the interview's completed state, with a button to
  start the preview again. The protocol summary prints the finish stage.

**Interviewer**

- A finished interview shows its completed state, with an **Exit** button. The
  outcome and finish stage are saved with the session (encrypted when the
  vault is on) and exported.

**Fresco**

- The `/interview/finished` page is gone: a finished interview's link shows
  its completed state, including to a participant who returns to it. That
  page is sent without the interview's answers or the protocol's resources,
  and nothing on it is saved back to the interview.
- With **Freeze Completed Interviews** off, a researcher who opens a finished
  interview can still change it, as before. With it on, they see the completed
  state.
- Each interview's finish stage and outcome are stored and exported, and
  included in the interview API. Interviews finished before this upgrade have
  no outcome.
- The finish request must name a finish stage of the interview's protocol and
  its outcome.
- The cookie that limits a participant to one interview per protocol now holds
  the finished interview's id. The browser no longer lets scripts read it, and
  it is sent only over HTTPS when the session cookie is (in production, unless
  `COOKIE_SECURE` says otherwise).
- The dashboard's progress counts the finish stage as a stage.
- Deploy normalization leaves a protocol in place, with a logged reason,
  when the normalized protocol would not be accepted on import, such as one
  given a finish stage with no text in its default language.
