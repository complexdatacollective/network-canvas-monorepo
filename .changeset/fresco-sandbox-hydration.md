---
'fresco': patch
---

The Fresco sandbox's sign-in page and dashboard no longer lose their
interactive behaviour.

The Netlify badge and the sign-in page's sandbox-credentials notice each decided
whether to render by reading the `SANDBOX_MODE` environment variable from the
browser, where it does not exist. The server rendered both and the browser
rendered neither, a disagreement React resolves by discarding the page it was
handed: on the sandbox, every element below the failure stopped responding and
the notice carrying the demo sign-in credentials disappeared as the page
finished loading.

Both are now rendered by the server only when the deployment is a sandbox, so
the decision is made where the variable exists.
