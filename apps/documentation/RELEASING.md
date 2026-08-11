# Releasing documentation

Documentation releases are gated through the generated **Release Documentation**
pull request, independently of Architect, Interviewer, and Website.

1. Create a changeset containing only `@codaco/documentation`. Its patch, minor,
   or major level determines the next documentation version and changelog heading.
2. After the changeset reaches `main`, CI updates the Documentation release PR
   with the version and changelog entry.
3. Merge that PR to deploy only the documentation site to Netlify production. CI
   tags the deployed version as `@codaco/documentation@<version>`.

Netlify's Git integration builds pull-request previews and reports the
`netlify/documentation-dev/deploy-preview` status on each head commit. The
`docs-preview-checks` CI job waits for that status, then runs the dead-link and
redirect checks against its preview URL. Production deploys use the
`NETLIFY_DOCUMENTATION_SITE_ID` GitHub Actions secret and never run for ordinary
pushes to `main`.

## PostHog source maps

Only the production release job sets `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` (repository secrets shared with Architect and Interviewer;
the personal API key needs the _error tracking: write_ and _organization: read_
scopes). Their presence is what switches source-map upload on: `withPostHogConfig`
in `next.config.ts` turns on browser source maps, and its post-compile hook
uploads them and deletes them before the static export writes `out/` — so the
exceptions `posthog-js` reports symbolicate to real source while the deploy still
ships no maps. Every other build — local, PR, Netlify preview, the `-dev` site —
has no credentials and emits no maps at all.

A failed upload fails the build rather than deploying unsymbolicated, and both
variables are part of the Turbo cache key for the documentation `build` task, so
a production build can never replay a cached artefact whose maps were never
uploaded.

## Analytics gating

`instrumentation-client.ts` initialises PostHog only when the page is served
from `documentation.networkcanvas.com` (`lib/analytics/isProductionHost.ts`).
The site is a static export, so one bundle serves production, every deploy
preview, and local development — and any `next build` sets `NODE_ENV` to
production, so the build-time `NEXT_PUBLIC_IS_PRODUCTION` flag this replaced was
true on deploy previews too, which sent preview traffic into the production
project. Add a hostname to that list when the site gains a domain; nothing else
gates analytics.
