# Releasing documentation

Documentation releases are gated through the generated **Release apps & documentation** pull request.

1. Create a changeset for `@codaco/documentation`. Its patch, minor, or major level determines the next documentation version and changelog heading.
2. After the changeset reaches `main`, CI updates the shared release PR with the version and changelog entry.
3. Merge that release PR to deploy the documentation site to Netlify production. CI tags the deployed version as `@codaco/documentation@<version>`.

Netlify's Git integration builds pull-request previews and reports the
`netlify/nc-documentation/deploy-preview` status on each head commit. The
`docs-preview-checks` CI job waits for that status, then runs the dead-link and
redirect checks against its preview URL. Production deploys use the
`NETLIFY_DOCUMENTATION_SITE_ID` GitHub Actions secret and never run for ordinary
pushes to `main`.
