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
