---
'@codaco/interview': minor
---

Interview forms and interfaces now communicate unanswered, loading, error, and completion states more accurately.

- Required yes/no questions start unselected, required scales no longer announce a value before one is chosen, and blocked submission focuses the first unanswered question.
- Optional blanks no longer produce unrelated validation errors, comparisons use participant-facing question text, and each unanswered field reports a single useful message.
- Name Generator rosters and external panels distinguish loading, empty, exhausted, and no-match states. Quick-add controls expose valid accessible names and descriptions.
- Location search restores focus after selection, announces results and failures, and ignores stale responses.
- Family Pedigree person editing no longer crashes or discards work, and completeness checks reject missing or duplicate ego records.
- Dialogs and history toolbars retain keyboard focus, including confirmations presented by an interview host.
