---
'@codaco/studio-api': patch
'@codaco/studio-web': patch
---

Closes the items the Effect 4 migration (#1927) carried forward without an
owning issue.

- The general `/rpc` mount reads at most the contract's unary body bound,
  as `/rpc/protocol-builder` already did. A caller with no session could
  send an unbounded body before being refused.
- A stopping server closes every open `/ws` socket with 1001 ("going away")
  rather than the 1000 that Effect 4 sends for a handler that merely
  returned; the editor reconnects on either.
- A schedule row whose stored payload no longer decodes, or that names a
  queue this build does not declare, is logged and skipped on its tick,
  instead of ending the tick and rolling back every other due schedule with
  it (#1996). The row stays due, so the occurrence runs once boot repairs it.
- The sign-in page's `invitationId` guard now holds: an id that is not a
  team invitation id is dropped before the magic link's return address is
  built, where before it reached the link verbatim.
- The asset-key re-seal is pinned to the row's own team and protocol by a
  rotation test that shares one asset id across protocols and teams.
- No `session.cookieCache` is adopted, by recorded decision: the session is
  read on every call so that revocation takes effect at once.
