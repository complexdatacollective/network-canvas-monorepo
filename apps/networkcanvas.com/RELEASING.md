# Releasing networkcanvas.com

Website releases are gated through the generated **Release Website** pull
request, independently of Architect, Interviewer, and Documentation.

1. Create a changeset containing only `networkcanvas.com`. Its patch, minor, or
   major level determines the next website version and changelog heading.
2. After the changeset reaches `main`, CI updates the Website release PR with
   the version and changelog entry.
3. Merge that PR to deploy only networkcanvas.com to Netlify production. After
   the deploy succeeds, CI tags the version as `networkcanvas.com@<version>`.

Netlify's Git integration continues to build pull-request previews. Production
deploys authenticate with `NETLIFY_AUTH_TOKEN`, target the site in
`NETLIFY_SITE_ID_WEBSITE`, and run only when the Website release PR changes the
site's stable version on `main`.

## The protocol gallery subdomain

`protocolgallery.networkcanvas.com` is a Netlify **domain alias** of this site,
not a separate site or release lane: one build serves both hosts from the same
publish directory. The gallery's exported routes stay at
`/{locale}/protocol-gallery/…`, and `netlify/edge-functions/locale.ts` inserts
that prefix after the locale segment for requests arriving on the gallery host,
so a visitor sees `/{locale}/{slug}/`. The prefix insertion also covers the
per-directory RSC payloads the client router fetches, which is why it runs ahead
of the extension check in `shouldBypass`. A request for the exported route on
the gallery host is sent to the short form with a 301, so each page has one URL
per host.

The locale cookie is host-scoped, so navigation links that cross between the
two hosts carry the current locale in their path rather than relying on the
other host to negotiate it again.

The short URL shape is production-only. `NEXT_PUBLIC_PROTOCOL_GALLERY_URL` is
set by `next.config.ts` when `CONTEXT` is `production`; without it — locally and
in every deploy preview, which serve a single host — the gallery stays a route
of this site, keeps its `/protocol-gallery` links, and canonicalises to
`networkcanvas.com`. Nothing in CI exercises the gallery host, so verify client
navigation, the language selector, and the downloads on the live subdomain after
a cutover.

Standing up or moving the alias is manual:

1. Add the domain alias to the site in `NETLIFY_SITE_ID_WEBSITE` so Netlify can
   issue its certificate and match the domain-scoped redirects in
   `netlify.toml`.
2. Repoint the Cloudflare record at Netlify, matching the proxy setting of the
   other subdomains. Lower its TTL first — this is the cutover.
3. The forced 301s from `networkcanvas.com/{locale}/protocol-gallery/*` and the
   legacy `/protocol/<author-list-slug>` redirects in the edge function are what
   keep a single canonical host; neither is optional cleanup.

## Analytics gating

`instrumentation-client.ts` initialises PostHog only when the page is served
from `networkcanvas.com` (`lib/analytics/isProductionHost.ts`). The site is a
static export, so one bundle serves production, every deploy preview, and local
development, and any `next build` sets `NODE_ENV` to production — a build-time
flag would record preview traffic as if it were real. Add a hostname to that
list when the site gains a domain; nothing else gates analytics.

Source maps upload on the same terms as the other products: only the production
release job sets `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`, and their
presence is what switches upload on. Because the website release deploys with
`netlify-cli --build`, those credentials are scoped to that single build step
rather than the whole job.
