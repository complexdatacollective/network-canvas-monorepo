---
'@codaco/studio-api': minor
'@codaco/studio-web': patch
'@codaco/studio-contract': patch
---

Studio's packages take their final names. The server is `@codaco/studio-api`
in `apps/studio/api`, the web app is `@codaco/studio-web` in
`apps/studio/web`, and the schemas the two halves shared through the old
internal RPC package now come from `@codaco/studio-contract`, which that
package's version history continues under. The image targets (`studio-api`,
`studio-web`), the published image names and the compose service names are
unchanged.

The API no longer carries Hono or zod. A path no route serves is answered by
the router's own 404 as problem JSON, which is what the machine surfaces
(`/api`, `/rpc`, `/storage`) already answered; a path outside them, which the
ingress never routes here, now gets the same problem JSON rather than a plain
text 404. The audit event schemas and the invitation email check are Effect
`Schema` declarations that accept exactly what the zod ones did.
