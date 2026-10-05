---
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Distinguish the two topologies one Studio artifact serves. `STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`, unset ⇒ `self-hosted`) selects which URL paths a deployment has, from a classification shared by both deployables: the managed-only marketing, pricing, sign-up and billing paths are refused with a real HTTP 404 on a self-hosted instance, and first-run `/setup` is refused on the managed service, so no tenant reaches instance configuration. The refusal still returns the app shell, so the client renders its branded not-found state behind an honest status line, and `Cache-Control: no-store` keeps nothing caching it. `/` is served in both, because a self-hoster's origin root is the URL they hand their researchers. The `status` procedure now reports the mode, and the static-asset wiring moves out of the server entrypoint into `mountClient`.
