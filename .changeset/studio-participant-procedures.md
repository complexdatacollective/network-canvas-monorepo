---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-sync': minor
---

Studio now serves the four calls a participant's browser makes during an interview: redeeming a link, reading the session, saving answers as they are given, and finishing. No participant page uses them yet.

Redeeming a link refuses one that is revoked or expired, a study that is draft, paused or closed, and a wave that has not opened or has closed, each with its own reason. A managed participant always returns to their one session in the wave, and redeeming their link again replaces the session's address; an anonymous link starts a new session each time. Redeeming the link of a finished interview says so. Redemption is rate-limited per address, and a participant's own link is also limited on its own; an anonymous study's shared link is not, so a whole study can start at once.

The session read returns the protocol the session is pinned to, including its API keys, and the network collected so far, and takes the session over for the page that asks. Session reads are rate-limited per session. Answers are saved as rows: each save replaces the session's nodes and edges with what the browser holds, a replayed save changes nothing, and a page that has been taken over is refused. While a study is paused, interviews already under way can continue for the study's grace period before they are stopped.

Finishing marks the session complete and stores its immutable snapshot in the same transaction, after which the interview can no longer be changed. A finish from a browser holding answers the server has not yet saved is refused as out of date, so the browser can save them and finish again rather than leave them out of the snapshot. A completion job is queued for the webhooks still to come. Team activity records "Interview started" and "Interview completed" for each participant.
