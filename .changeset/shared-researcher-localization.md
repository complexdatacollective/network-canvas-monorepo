---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/network-exporters': minor
---

Provide optional localized researcher guidance with complete Spanish catalogs:
protocol import failures, migration approval notes and validation conflicts, synthetic generation
refusals, and export progress. Applications can present this guidance in the
active language while keeping existing technical diagnostics, event identifiers,
and generated interview data unchanged.

Synthetic generation guidance covers both `generateNetwork` and the public
`SyntheticInterview` builder, including fixed-value conflicts and unsupported
participant uniqueness rules.

Protocol validation also exports `parseAcceptLanguage` for HTTP hosts to parse
canonical, quality-ordered browser preferences through the shared locale
negotiation flow.
