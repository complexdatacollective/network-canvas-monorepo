---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The interview runtime's optional analytics no longer use the interview session id as the per-event `distinct_id`. In Fresco that id is the participant's unauthenticated access link, so it must not leave the deployment. Events are now grouped under a random per-session pseudonym generated in the browser, held in memory for the life of the session alongside the existing entity-id pseudonyms. Analytics still group one session's events together; a page reload starts a new pseudonym.
