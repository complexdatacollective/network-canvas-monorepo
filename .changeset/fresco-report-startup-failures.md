---
'fresco': patch
---

Fresco now reports the failures that stop it starting in a participant's browser.

A browser that failed to start the application showed its error page but had no way to send the report. Deciding whether a deployment collects analytics needs a database read, so the answer was applied by a component inside the page — and when the page failed to start, that component failed with it. A deployment could be broken for every participant with nothing recorded anywhere.

The answer now reaches the browser independently of the page rendering, so these failures are reported like any other. Deployments with analytics disabled still make no requests at all.
