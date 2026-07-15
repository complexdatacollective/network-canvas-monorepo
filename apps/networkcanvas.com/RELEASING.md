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
