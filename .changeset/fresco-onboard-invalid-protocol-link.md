---
'fresco': patch
---

An onboarding link whose protocol no longer exists now sends the participant to a page explaining that the link is no longer valid, rather than the generic "something went wrong" page. The protocol id comes from the URL, so this is what a participant sees whenever a study's protocol has been deleted or a link was mistyped — an ordinary outcome that deserves an answer they can act on.

Such a link is also no longer reported as an application error. Every one of these visits previously raised a database exception carrying internal schema detail, so the error reports that reach a deployment now describe faults worth investigating instead of routine dead links.

Interview creation now reports why it failed using a fixed set of outcomes rather than passing the underlying database error message back to its caller.
