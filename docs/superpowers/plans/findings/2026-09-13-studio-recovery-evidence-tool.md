# Offline recovery evidence review

PR #1746's review identified an incomplete operator contract: the image required
canonical signed evidence without shipping the full format or a preparation
path. The `recovery:evidence` command now exports the runtime schema, prepares
canonical bytes, signs them using a separately held Ed25519 key, and verifies
against an independently supplied trust anchor. The retained recovery guide
contains the complete shape, relationship constraints, exact serialization,
fingerprint preimages, and an offline image invocation.

The existing private-file read implementation is shared by the offline tool and
all restored-state readers. Restored-state readers retain a mandatory
independently pinned SHA-256; the new raw reader is used only before offline
preparation and for the separately held key/receipt. The one runtime Zod schema
continues to validate copied and signature-verified evidence and also produces
the machine-readable schema. Preparation reuses the existing bounded,
duplicate-key-rejecting JSON parser used by template archives and datasets;
those consumers retain their existing imports and behavior.

Validation passed 21 recovery/evidence/production-entrypoint tests, Studio
server types, scoped lint, changeset isolation, and Knip with only the two
existing configuration hints. A freshness mutation made the expiry test fail
because the command incorrectly accepted expired input; restoring the guard
returned all seven new tool tests to green. The production build and actual
bundled prepare/sign/verify round trip pass without Studio environment values.
The command requires no database, network, or restored authority access.

This delta changes offline server tooling, one private package export, tests,
and operator documentation. It does not change rendered application pixels;
no visual baseline regeneration is required. The classifier's broad candidates
come from the inherited stack, whose Registry-only rendered surface is outside
the three app snapshot suites. Live disaster recovery and production hosting
qualification remain outstanding; tool tests are not deployment evidence.
