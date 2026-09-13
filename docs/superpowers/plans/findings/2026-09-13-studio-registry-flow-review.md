# Studio Registry flow review corrections

The review of PR #1871 at `3b2ac2c9` found five defects in the integrated flow.
The wire client now calls `/api/v1/publisher`; its fixtures no longer reproduce
the same incorrect path. Imported template versions recover all original asset
sources from their retained completed import manifest, validating the bindings
against the team's content-addressed asset rows before reading bytes. This
preserves two aliases for identical content without renaming another version's
asset or changing numbered migrations. Completed import manifests are durable
version metadata and must remain retained.

The client classifies received publication 4xx responses (except ambiguous 408) as definitive rejections. The command records an audited quarantine and
returns failure, allowing a fresh authorized retry. Transport failures and
ambiguous server responses retain public reconciliation. Workers read each
intent's recorded Registry origin before any remote request; a changed operator
configuration causes an audited quarantine rather than cross-service provenance.

The existing templates query polls while submitted operations remain pending.
A bounded administrator-only status query reports pending, completed,
quarantined, or unavailable operations; it reveals no credentials or data from
another team. The existing accessible status region announces completion or
failure and terminal operations stop polling. The UI retains no publishing
credential for worker retries.

Validation covers 17 PostgreSQL Registry flow cases, 12 audit registry/policy
checks, 37 client wire tests, and 16 Studio UI checks. Fail-first controls
reproduced the wrong publisher path and alias loss. Mutants removing definitive
refusal classification, frozen-origin guards, and polling failed the expected
oracles; restored production code passes. Types, changed-file lint, Knip,
changeset isolation and production server/client builds are also checked.
This Studio-only UI delta changes completion states, not any Architect,
Interview, or Interviewer baseline. Live Registry/Studio deployment and epic
hosting qualification remain separate outstanding evidence.
