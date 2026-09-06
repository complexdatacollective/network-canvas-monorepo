# Template registry implementation plan

Issue: [#1284](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1284).
The platform epic needs an independently deployed registry and a working
managed/self-hosted template sharing loop. The prerequisites authorized here
are the narrow metadata and frozen-version contracts from #1282/#1283; complete
template insertion workflows and gallery browsing remain separately scoped.

Current code already owns canonical Studio section hashing, protocol schema
validation, content-addressed assets and immutable template versions. This plan
reuses those boundaries and adds the missing publication protocol, publisher
identity, registry datastore, moderation, and instance integration. Each slice
is independently reviewable. Root review precedes push and PR creation.

## Bounded slices

1. **Shared format and metadata.** Add versioned authors/ORCID, keywords,
   description, publications, related links and funding vocabulary to shared
   Studio format code. Reuse/extract the existing section validator and convert
   every old consumer. Implement documented ZIP conventions: strict manifest,
   ordered section refs, canonical JSON leaf hashes, raw asset hashes and a
   registry-independent Merkle root covering metadata/license/content. Stream
   extraction with strict path/count/uncompressed/total caps; reject duplicate,
   unknown, missing and unreferenced entries, invalid hashes/schema versions,
   executable asset classes and embedded API-key assets. Verify raw file type,
   not publisher MIME claims. Cover malformed ZIPs, bombs, reordered references,
   tampered metadata/license/content and newer schemas with failing oracles.

2. **Independent service and identity.** Add `apps/template-registry` with its
   own database/migrations, immutable content-addressed blobs, startup checks,
   separate image, health/readiness and explicit runtime configuration. Claim
   publisher accounts through email verification, optional plain ORCID, with
   registry sessions and separately issued/revocable hashed credentials.
   Instance API tokens and unauthenticated publisher claims never authenticate.
   Use existing Better Auth machinery through this app's own auth boundary.
   Expose a Zod-generated normative OpenAPI3.1 contract, RFC9457 errors, stable
   problem types and cursor envelopes under `/api/v1`; CC0 specification files.

3. **Registry behavior.** Implement publish, public list/search/filters/fetch,
   reports, publisher yank, operator takedown/hard delete/suspension, and curated
   grant/revoke with actual persistent audit. No pre-publication hold. Browse
   delists yanked versions while direct hash fetch carries a yank notice. Hard
   deletion removes access to content without destroying the minimal immutable
   moderation evidence. Durable rate limits and upload/content caps enforce
   across replicas and restarts. Route tests exercise complete behavior,
   moderation races, credentials, cursors, limits and all negative boundaries.

4. **Instance loop.** Add the audited Studio account-link, publish and import
   commands/routes, with minimally sufficient user flows on both deployment
   modes. Freeze name/kind/license/metadata per immutable template version;
   preserve and explicitly migrate existing legacy seed metadata. Add
   `template_registry_publications`, immutable machine origin stamps and
   encrypted registry credential persistence. Fetch through a constrained
   configured registry origin, verify all hashes/schema before local writes,
   store imported assets as `registry_import`, and pin sections/assets safely.
   Do not introduce instance public-API token mirroring or full gallery UX.

5. **Qualification and review.** Run two isolated instances against a real
   registry database: publish from managed and self-hosted configurations,
   fetch/import into the other, reproduce the global identity, exercise yank
   and operator deletion. Test migration/restore, image entrypoints, spec
   generation/client round-trip and deliberate defects. Keep acceptance gaps
   explicit until actual routes and behavior are verified. Root conducts master
   review before pushing or opening PRs, and owns managed provisioning.

The instance slice must stack the reviewed migration, encryption and bootstrap
baseline, with the current key/AAD contract. Migration numbering follows the
then-current chain. The service has a separate image, database credentials and
persistent datastore; it is not a flag on the Studio runtime. Managed resource
measurement and provisioning remain within the approved overall $100 monthly
budget.

## Completion evidence

A format-only or route-only PR does not complete #1284. Completion requires
working publisher claims, managed/self-hosted publication and verified import,
all moderation controls and immutable evidence, reproducible public OpenAPI
and CC0 format publication, and a separately deployed service/datastore with
backup and restore evidence. Operational qualification must exercise the actual
provider identity and deployment; local database tests establish engineering
behavior and do not substitute for that evidence.
