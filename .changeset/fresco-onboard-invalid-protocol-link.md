---
'fresco': patch
---

An onboarding link whose protocol no longer exists now sends the participant to a page explaining that the link is no longer valid, rather than the generic "something went wrong" page. The protocol id comes from the URL, so this is what a participant sees whenever a study's protocol has been deleted or a link was mistyped — an ordinary outcome that deserves an answer they can act on.

Such a link is also no longer reported as an application error. Every one of these visits previously raised a database exception carrying internal schema detail, so the error reports that reach a deployment now describe faults worth investigating instead of routine dead links.

Interview creation now reports why it failed using a fixed set of outcomes rather than passing the underlying database error message back to its caller.

Activity that is recorded in the dashboard feed now reaches analytics again. The feed entry and the analytics report are made together, but the report was scheduled only once the entry had been saved — by which point the request that triggered it had usually finished, so the report was dropped without a trace. Only the two places that waited for the entry to save were unaffected, leaving most activity missing from analytics since Fresco moved to its current release process, and some of it never reported at all. Uninstalling a protocol is now recorded like every other activity, which matters because that is what invalidates recruitment URLs already given to participants.

Feed entries are also no longer at risk of being lost. The entry was written without anything waiting for it, so a host that stops work once a response has been sent could discard it mid-write; the write is now held open until it completes.

Reports could also be lost while handling a single request. Several reports can be queued to send once a response has gone out, and they share one connection to the analytics service; whichever finished first closed that connection, leaving the rest unsent. They now flush the connection instead of closing it, so every report is delivered whatever order they finish in.

Analytics no longer receives the feed's written description of an activity, which names the researcher who acted and, for interview activity, the participant. Only the kind of activity and any counts are reported.

Recording activity is no longer reachable from the browser. It accepts whatever description it is given and runs during interview and sign-in flows where no account is established yet, so it could not be restricted to signed-in researchers; it is now internal to the server instead, and can no longer be used to plant entries in a study's activity feed.
