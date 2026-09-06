# Studio release eligibility

Studio publication has three separate checks: release consent, available
dependency publications, and distribution ancestry. Build and promotion callers
must run all three against the exact committed candidate. A cached earlier
verdict does not authorize a later publication or production change.

## Source consent and merge freshness

The Studio lane contains `@codaco/studio-client`, `@codaco/studio-server`,
`@codaco/studio-rpc`, `@codaco/studio-sync` and the independently deployed
`@codaco/template-registry`. The existing Studio version command records
`.github/studio-source-baseline.json` before bumping versions and removing
changesets. It requires a clean committed tree. The baseline names the source
commit, each resulting version, and each package's source hash. A changed
package needs its own release entry; the first baseline needs entries for all
five packages.

The merge-queue freshness job checks both the normal Version Packages PR and
the Studio release PR. It uses ancestry of each open PR head, including batches
containing both release PRs. Surviving Studio changesets refuse a stale Studio
release PR. Missing or uncertain GitHub ancestry fails the check.

`studioReleaseEligibility` independently reads Git objects, rather than the
working checkout. Pruning ignored changesets cannot conceal them. It refuses
pending changesets anywhere in the complete Studio lane and in every other
lane reached by Studio's workspace dependency graph. Thus both release orders
remain blocked until the last required lane completes. A source change without
another Studio release cannot ride a normal dependency-triggered build under
an existing Studio version.

Tests, stories and release notes do not participate in package source hashes;
imported Markdown, public assets, migration artifacts, styles and build
configuration do. Dockerfiles and deployment files participate in distribution
identity separately and do not require fabricated package version bumps.

## Published dependency evidence

For every consumed publishable workspace, eligibility requires an immutable
`<package>@<version>` Git tag ancestral to the candidate, matching package source
at that tag, and an available npm tarball bound to that exact source by verified
SLSA provenance. Our pnpm publications do not populate npm's optional `gitHead`.

The verifier authenticates the Sigstore bundle, certificate transparency and
signature transparency evidence, with the exact GitHub Actions issuer and
`.github/workflows/ci-and-release.yml@refs/heads/main` signing identity. It then
checks the statement's package identity, source repository, workflow, commit
and SHA-512 subject digest against downloaded tarball bytes. Redirects outside
the official npm registry, unavailable metadata or bytes, missing provenance,
incorrect signatures and mismatched source all defer release. See the
[Sigstore JavaScript verification API](https://github.com/sigstore/sigstore-js/tree/main/packages/client)
and [npm provenance documentation](https://docs.npmjs.com/generating-provenance-statements/).

Removing a changeset is insufficient while npm publication is pending or has
failed. The release workflow must reevaluate eligibility after publication or
on retry; successful publication unblocks the same candidate without another
source or version change.

## Artifact and component identity

Component identity includes the complete selected workspace graph and frozen
pnpm dependency resolutions, including bundled development dependencies,
optional dependencies, peer variants and source patches. Registry-only package
or lockfile changes preserve Studio's identities. Shared RPC/sync changes select
every actual consumer. Managed client-only publication can preserve its backend;
self-hosting deliberately updates the composite client/server image and uses
the documented admission drain, WebSocket close and reconnect procedure.

Distribution identity additionally includes Dockerfiles, Compose, installer and
release scripts, embedded operator documentation, base-image pins and root
release-tool dependencies. Unconsumed lockfile records do not trigger an
artifact. Publication uses a full source commit identity, not the server's
package semver alone.

## Combined distribution ordering

`distributionAncestry` runs after fetching tags while holding the non-cancelling
combined distribution publication/promotion lock. Each
`studio-distribution-<full-source-commit>` tag reserves that source, even during
an incomplete publication. Every later candidate must contain every reserved
source. The exact same source may retry to finish an incomplete release.

Installer-only and Compose-only publications receive the same check even when
every application image remains unchanged. Reversed dispatch order therefore
cannot publish an older combined manifest last. A generation derived from the
source's Git ancestor count and the signed list of preceding distributions
provide the installer with monotonic ordering evidence. Timestamps and server
semver do not establish ordering.

These helpers are prerequisites for the signing/install/promotion workflow.
This checkpoint does not claim to publish images, install deployments or
qualify an upgrade. Those callers must perform the checks immediately before
their respective side effects, verify the signed installer and its exact bound
manifest before execution, require an independently obtained expected manifest
digest for fresh installation, and preserve protected highest-accepted release
state across failed updates and explicit historical recovery.
