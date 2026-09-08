# Studio Registry publication and import review

Branch: `codex/studio-1243-registry-studio-flow`

This integration completes Studio's bounded side of #1284. It links a personal Registry publisher identity, publishes an immutable local template version with a credential supplied for that request, imports a verified Registry artifact, records immutable publication and origin evidence, and exposes the operations through Studio's audited RPC and UI surfaces. Gallery and search behavior remain outside this change.

## Security and consistency decisions

- `STUDIO_TEMPLATE_REGISTRY_ORIGIN` is the only Registry destination. Environment parsing accepts a pathless HTTPS origin and rejects HTTP, credentials, paths, query strings, and fragments. RPC inputs contain entry IDs rather than URLs, and the UI only displays the operator-selected origin.
- Studio verifies a Registry credential and persists only the publisher ID, name, ORCID, origin, and link timestamp. Neither Registry account nor publication tables have a credential column. Publishing requires the credential again for each request.
- Team owner/admin authorization is re-read with `FOR UPDATE` inside the audited transaction before the Registry handoff. The lock remains held across publisher verification and publication, so a concurrent role demotion waits for the command to finish. A role already demoted to member makes zero Registry requests.
- Remote publication and Studio's publication record are not atomic. The Registry's content-addressed publish returns the same entry for identical verified bytes. If the remote succeeds and the local insert/audit transaction fails, retry republishes the same content identity and then records one local publication. A later retry reads the immutable local record without another remote request.
- Import first verifies the Registry entry and bounded artifact bytes with the shared client. Unsupported protocol schema versions retain `TEMPLATE_SCHEMA_UNSUPPORTED` through the client and RPC boundary. Imported assets use `origin = 'registry_import'`; the version holds an exact machine-written `{registry_url, entry_id, source_version_hash, fetched_at}` object.
- Publication rows snapshot the publisher identity returned by the Registry and reject update/delete. Relinking the personal account therefore cannot rewrite publication history.

## Shared seam inventory

The Registry credential syntax occurs in two schemas:

1. `packages/studio-sync/src/template-registry-contract.ts` is the canonical Registry wire schema used by the service and client.
2. `packages/studio-rpc/src/schemas.ts` validates the Studio browser-to-server request. `studio-rpc` is the leaf shared by the client/server dependency diamond and cannot depend on `studio-sync`; the server passes the string to the shared client, which validates it again before constructing the Authorization header.

Production `TemplateRegistryClient` construction is confined to `apps/studio/server/src/template/registry.ts`. Existing uses under the Registry client test suites are verification call sites. There is no direct user-controlled Registry fetch path in Studio. Public entry/artifact reads remain credential-free; publisher lookup and publish require an explicit credential argument.

## Migration evidence

0010 is generated from canonical recovery migration 0009. No bytes in 0001 through 0009 were changed.

- fingerprint: `6cbf38fd1d802cc3a723c65e5d65d53ce568d0f4116d898d23ae8f305e0b439a`
- snapshot hash: `4570145c3fb7f5fb40e815e58ea004cf7c00debda93b14b73febf18616399177`
- SQL hash: `fc4998b8a4f1bedf1563d2bcebf57d65b66e68ef5003d9104384a77d3093a03f`
- sidecars hash: `004885a39c0f7f8fa2245215ab8122c2f9c279b356238b4bc5ca7f2917cedb93`

PostgreSQL 18 ran in the isolated `studio-registry-flow-pg` container on host port 55543 with `max_prepared_transactions=10`.

## Verification

- Studio migration, artifact, authoring, role bootstrap, Registry config, security, template schema, and Registry command suites: 8 files, 326 tests passed.
- Shared migration admission/evidence on PostgreSQL 18: 2 files, 23 tests passed.
- Shared migration authoring/migrator plus Registry client/artifact tests: 4 files, 84 tests passed; the two PostgreSQL files were then run separately above.
- Studio client: 22 files, 366 tests passed.
- Focused UI route, shell, and catalogue tests: 3 files, 88 tests passed.
- The actual Registry application, shared client, and PostgreSQL 18 completed a publish/read/fetch wire round trip. Studio's managed and self-hosted topology/ingress suites passed 53/53 alongside it.
- Studio client/server builds passed. Studio client/server/RPC/sync typechecks passed.
- `pnpm knip` and `pnpm check:changesets` passed.
- Targeted `oxlint` and `oxfmt --check` passed for every changed flow file.
- Repo-wide lint is rerun after each final recovery-parent synchronization; its current result is recorded in the final checkpoint rather than accepting a stale parent formatting result.

The authorization mutant removed the locked administrator recheck. The focused revocation oracle failed, receiving `REGISTRY_UNAVAILABLE` after attempting a Registry request instead of `FORBIDDEN` with zero requests. Restoring the guard returned the complete Registry command suite to 4/4.
