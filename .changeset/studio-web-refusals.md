---
'@codaco/studio-web': minor
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
---

Studio now tells researchers when it is down for maintenance. While the server
answers `503`, a notice above every screen of the app says so, and the screens
behind it keep asking again at the interval the server's `Retry-After` names,
for as long as the window lasts, instead of giving up after three tries. A
screen that could not load at all for the same reason says so rather than
reporting a generic failure.

A maintenance window no longer signs anyone out. The session check used to
read every `503` from `/api/auth` as "this server has no sign-in", so a
researcher whose tab revalidated during a window was sent to the sign-in page
and their editor session was closed. Now only the server's own "not
configured" answer signs them out. Any other `503` keeps them where they are,
shows the notice (on the sign-in page too), and asks again after
`Retry-After`. The API marks both answers with a problem `type`:
`urn:networkcanvas:studio:problem:maintenance` for the maintenance gate and
`urn:networkcanvas:studio:problem:auth-not-configured` when sign-in is not
configured.

A request the server refuses with `401` now signs the researcher out and
returns them to sign-in, the same way an expired session already did. A read
refused as forbidden, not found or signed out is no longer retried.

An address that names a malformed study or team id, such as
`/study/not-a-study/editor`, now shows the "Page not available" screen without
asking the server anything, rather than failing inside the screen.

The protocol editor now loads on its own route. The bundle loaded for every
other screen is 803 kB gzipped, down from 1,977 kB, and only the British
English protocol-editor messages Studio uses are bundled, not every language
the editor ships.

`/rpc` no longer provides the unused `ClientSessionMiddleware`, the client no
longer sends `x-studio-client-session` on `/rpc` requests (the tab is still
named on the editor's socket), and
`@codaco/studio-contract` no longer exports `./middleware/client-session`.
`StudioStreams` is no longer re-exported from `./rpc/studio`; import it from
`./sync/protocol-builder`.
