---
'@codaco/documentation': patch
---

The Advanced Deployment page no longer breaks when it loads.

The example `.env` on that page listed a contact address for Let's Encrypt as
`you@example.com`. The site is served through a CDN that rewrites anything
looking like an email address before the page reaches the browser, replacing it
with a protected placeholder. That left the page the browser received disagreeing
with the page the site expected to build, so the browser threw the whole thing
away and rebuilt it — a visible flash of broken or missing content for roughly a
third of the people who opened it.

The example now uses the same `CHANGE_ME` placeholder as the password and
database settings beside it, which reads more clearly as a value to replace and
leaves nothing for the rewriter to find. The variable's meaning is already
documented in the table above the example.
