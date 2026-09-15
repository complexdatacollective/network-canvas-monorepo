---
'@codaco/studio-server': patch
---

The self-host stack is tested. `apps/studio/stack-test` stands the reference
deployment up from the compose file a self-hoster downloads, drives the whole
of it — the routing table, the WebSocket upgrade, first-run setup with the
token `migrate` prints, an asset written and read back, the maintenance page
while the API is stopped — and then does the same for each documented swap with
the swapped element replaced by a stub on a network of its own: a managed
database, a managed bucket, and an institution's own reverse proxy. Every
variant is held to the same contract, so a swap is proved by the same
assertions passing rather than by a shorter list. CI runs it as the
`studio-stack` job whenever the images, the compose files, the environment
template, the scripts or the self-host guide change.

The ingress variant reads its nginx configuration out of the guide at run time
rather than from a copy, which found three things wrong with what the guide
asks an institution to do.

An instance behind that proxy was dead after every upgrade. Replacing the API
container gives it a new address, and nginx looked the name up once when it
loaded its configuration, so it went on addressing a container that was gone
and answered 502 until somebody reloaded it — which nothing told anyone to do.
The upgrade sequence now says to, at the step that causes it, and the ingress
swap says why.

The maintenance page could also arrive far too late or not at all. A stopped
API container takes its address with it, so the proxy's connection attempt goes
unanswered rather than being refused — between 3 and 30 seconds, against an
nginx default of 60 — and once that attempt is bounded it ends as a 504, which
the example did not answer as the page. It now bounds the connect and answers
504 as 503 alongside 502.

Finally, the guide told operators to list only proxies that overwrite
`X-Forwarded-For` while showing an example that appends. The example is right:
Studio reads the chain from the right and stops at the first address that is
not a listed proxy, so a client's own entry is never reached. The rule now says
what actually keeps it safe, which is listing every proxy a request passes
through and nothing else.
