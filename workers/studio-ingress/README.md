# Managed Studio ingress

This Cloudflare Worker is routing-layer plumbing for the managed Studio single
origin. It owns no product handler, authentication decision, database access,
WebSocket message, durable state, or scheduled work. The persistent Studio
server on Fly remains the origin for `/api`, `/rpc`, `/storage`, `/ws`, and the
operational endpoints. Netlify remains the origin for the SPA and its static
assets.

A Worker is necessary for this split on the selected plan. Cloudflare Origin
Rules are available on every plan, but changing the Host header, SNI, or DNS
origin is Enterprise-only. Those overrides are required to select two external
TLS origins. A whole-host Worker Custom Domain can select the origin and also
ensure cookies, authorization, CSRF headers, and referrers never reach the
Netlify origin. Cloudflare supports proxied WebSockets and Workers subrequests
with `Upgrade: websocket`; this Worker passes the accepted `/ws` response
through without handling messages.

## Boundary

- Only the approved public origins `https://networkcanvas.studio` and
  `https://studio.networkcanvas.dev` are accepted.
- Each deployed environment names one exact `*.netlify.app` static origin and
  one exact `*.fly.dev` backend origin. Placeholder, HTTP, credential-bearing,
  port-bearing, or path-bearing origins make every request fail with 503.
- Static requests allow only GET and HEAD and receive a small public header
  allowlist. Their query strings stay in the browser URL but are not sent to
  Netlify: the production build uses hashed asset paths, and the only current
  client route queries carry sign-in errors or invitation IDs that the static
  origin does not need. Static responses cannot set cookies or redirect to a
  foreign host.
- Server surfaces preserve cookie, authorization, Origin, `Sec-Fetch-Site`, and
  WebSocket handshake headers. Untrusted forwarding headers are replaced with
  the approved public host and HTTPS scheme. The Node server still performs its
  existing cookie principal, CSRF, and WebSocket-Origin checks.
- Every non-WebSocket backend response receives browser and CDN `no-store`
  directives. A missing API route remains the backend problem response; it can
  never fall through to Netlify's SPA fallback.
- Origin connection/header waits are bounded. Responses remain streamed, so
  large static assets and long-lived WebSockets are not buffered or cut off by
  that header timeout.

This is pure ingress despite running in a Worker: it classifies a fixed path
table, sanitizes the static boundary, and streams one of two upstream responses.
It does not move Studio request handling or coordination to edge compute.

## IaC inputs and offline checks

`wrangler.example.jsonc` records the two authorized Custom Domains and the
non-secret inputs required for each environment:

| Input            | Production example                                | Requirement                                      |
| ---------------- | ------------------------------------------------- | ------------------------------------------------ |
| `PUBLIC_ORIGIN`  | `https://networkcanvas.studio`                    | One of the two compiled approved browser origins |
| `STATIC_ORIGIN`  | `https://networkcanvas-studio.netlify.app`        | Exact reviewed Netlify site origin               |
| `BACKEND_ORIGIN` | `https://networkcanvas-studio-production.fly.dev` | Exact reviewed Fly app origin                    |

The checked-in template deliberately contains invalid `replace-with-*`
upstreams and is not Wrangler's default config filename. Copy the relevant
environment to an operator-owned `wrangler.production.jsonc` or
`wrangler.staging.jsonc`, replace both upstreams with inventory-qualified exact
values, and review the Custom Domain before any deployment. Those local config
filenames are ignored. The package exposes only a dry-run bundle check; it has
no deploy script.

Run the offline controls with:

```sh
pnpm --filter studio-managed-ingress-worker test
pnpm --filter studio-managed-ingress-worker check:bundle
```

Deployment remains pending the managed-estate qualification workflow. Before a
domain change, verify the Netlify deploy receipt and Fly image/Machine receipt,
set the Fly server's `PUBLIC_URL` to the matching public origin, configure only
reviewed Cloudflare proxy CIDRs in `TRUSTED_PROXIES`, enable Cloudflare
WebSockets, and test HTTP, authentication mutation, and a real `/ws` reconnect.
The same release artifact and server configuration contract serve managed and
self-hosted installations.

The account's actual Workers tier, request allowance, CPU billing, limits, and
WebSocket accounting are unresolved. Measure and quote them for the expected
request mix, then include them in the existing primary-ingress budget category
or add reviewed request/CPU categories. The current zero per-GB ingress
placeholder does not price this Worker and cannot establish that it is free or
within the $100 cap.

Official capability references:

- [Cloudflare Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/)
- [Cloudflare Workers WebSocket forwarding](https://developers.cloudflare.com/workers/examples/websockets/)
- [Cloudflare Origin Rules availability](https://developers.cloudflare.com/rules/origin-rules/)
- [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
