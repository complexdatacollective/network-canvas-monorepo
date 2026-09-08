# `app/` — the App Router tree, and the boundary that runs through it

Fresco's URLs are split by who may reach them, so that an institution can put
every researcher surface behind its own network boundary at a reverse proxy
with a single rule. The contract:

- **Public** (participants and platform callbacks; reachable from anywhere):
  everything under `/interview/`, `/onboard/` and `/api/public/`, plus the
  static assets Next.js serves under `/_next/`.
- **Researcher-only** (everything else): the site root, `/signin`, `/setup`,
  `/reset`, `/expired`, `/dashboard/…`, and every `/api/` path outside
  `/api/public/`, including the bearer-token Interview Data API under
  `/api/v1/`.

`../__tests__/routeVisibility.test.ts` walks this directory and fails when a
page or route handler is added outside both lists, when a researcher-only
handler under `/api/` does not call `requireApiAuth` or `requireApiTokenAuth`,
or when a public one does. When you add a route, put it under the prefix that
matches who may reach it; if it needs a new prefix, add it to that test and to
`../SECURITY.md` in the same change. Nothing the participant surface renders
may reference a URL outside the public prefixes — root files under `public/`
included; import them instead, so they are served from `/_next/static/`.

The rationale and the deployer-facing guidance live in `../SECURITY.md` and in
the documentation's FAQ for IT departments.
