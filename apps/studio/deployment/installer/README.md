# Verified Studio installer

This directory contains the host installer used by a complete Studio release
bundle. It is not a download-and-execute bootstrap script. The release publisher
must produce the signed manifest, image signatures and complete signed archive
before this entrypoint can install a release. The source tests substitute the
remote signature responses; that is not a claim that a signed release exists.

Use a Linux host with independently installed Node 24 or newer, Docker Engine,
Docker Compose, Cosign and `flock`. Obtain the selected release's manifest SHA-256
through an independent trusted channel. Do not learn the expected digest, signer
or issuer from the downloaded archive itself.

Before extracting or executing any downloaded code, use the trusted Cosign
installation to verify the **whole archive**, including every executable script:

```sh
cosign verify-blob \
  --bundle studio-installer.sigstore.json \
  --certificate-identity 'https://github.com/complexdatacollective/network-canvas-monorepo/.github/workflows/studio-release.yml@refs/heads/main' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  studio-installer.tar
```

Using trusted host tools, read `release.json` from that verified archive and
compare its SHA-256 with the independently obtained digest **before running the
installer**. Refuse a mismatch. Extract the verified archive into a new private
directory. The installer checks the exact file inventory and its manifest
binding again, verifies the manifest signature and all six controlled GHCR image
signatures, and matches each pulled platform's actual image configuration ID.
It performs these checks before starting any image.

The bundle inventories both raw deployment templates and their expected rendered
output. The offline configuration image receives those verified raw templates
through a read-only mount, then the installer compares every rendered file.
This lets a Compose-only release use its current configuration while retaining
the selected backend image identities; templates embedded in an older image
cannot silently replace the selected release's templates.

If both generations resolve to the same Studio Compose deployment, the same
Studio schema, and identical retained environment and encryption inputs, the
installer privately smokes the running service and records the new active
generation without stopping or recreating containers. The Registry image is
verified with the release, but Registry deployment remains a separate owner;
this Studio installer never marks Registry as deployed.

For a fresh installation, pass an empty mode0700 installation directory and the
public domain and ACME contact email:

```sh
node install.mjs \
  --directory /srv/studio \
  --expected-manifest-sha256 "$EXPECTED_MANIFEST_SHA256" \
  --domain studio.example.org \
  --email operator@example.org
```

The successful first invocation prints the setup token once. Complete `/setup`
to create the owner. The token remains in the private deployment configuration
until setup completes; a failed command or an exact-release retry does not print
it again. Never paste the configuration or token into logs or support messages.

For an update, provide a mode0600 JSON file containing an existing owner's
`email` and `password` for the private authenticated smoke check. Supply separate
backup and historical-key custody directories, both outside the installation
directory and outside each other:

```sh
node install.mjs \
  --directory /srv/studio \
  --expected-manifest-sha256 "$EXPECTED_MANIFEST_SHA256" \
  --credentials-file /secure/operator/studio-smoke.json \
  --backup-directory /independent-backups/studio \
  --key-custody-directory /separate-encrypted-custody/studio
```

The installer closes public admission, stops web and worker processes, and
captures a quiesced backup before starting migration. Historical roots stay in
the separate custody file. Its digest is recorded in the data backup; the data
archive does not include those roots. Keep custody on operator-controlled
encrypted storage, inaccessible to the credentials that download data backups.

Migration, key verification, the restricted backup verifier, retained client
asset installation, readiness and authentication all run with public admission
closed. Only the final successful operation reopens the proxy. Unsupported
upgrade hops and PostgreSQL majors refuse before changing the database. A
release must name each supported source manifest in its qualified upgrade list;
the first PostgreSQL 18 release can admit fresh installations only.

One kernel lock covers the complete operation. Protected mode0600 state records
the highest accepted release before image pulls and survives failed updates.
Keep `/srv/studio/control` and the release-generation directories across retries
or recovery; removing them loses local replay protection. An exact-release
retry resumes its durable progress. After migration begins, complete that
release before selecting a different update. A historical manifest cannot lower
the highest accepted release. The separate explicit recovery caller is not
implemented in this checkpoint; do not manually rewrite protected state to
simulate a downgrade.

The source qualification exercises these commands against real local Compose
services, including a post-migration interruption, quiesced backup, retry and
authenticated smoke. It uses two manifests of the same retained backend image;
actual adjacent/oldest-supported image compatibility and GitHub OIDC signature
qualification remain separate release requirements. The optional Registry
deployment and its recovery are also a separate integration boundary.

## Building the authenticated archive

The release publisher stages every installer module, the raw templates, generated
configuration, `release.json`, and its Sigstore bundle in a dedicated directory.
Run `node scripts/studio-installer-archive.mjs <bundle-directory> <source-commit>
<output.tar>` from the repository to generate a deterministic USTAR archive and
its SHA-256/source/manifest metadata. The command validates the same complete
inventory as the installed loader, writes through a private temporary file, and
creates the final artifact atomically without replacing an existing file. The
publisher must reconcile an existing immutable artifact before retrying.

Archive inspection does not authenticate its signer. The independently installed
trusted Cosign bootstrap must still verify the exact archive and its expected
manifest binding before extraction or execution, as described above.
