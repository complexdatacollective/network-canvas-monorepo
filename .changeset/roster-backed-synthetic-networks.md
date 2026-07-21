---
'@codaco/protocol-utilities': major
'@codaco/interview': major
'@codaco/protocol-validation': minor
---

`generateNetwork` now takes a single parameter object — call
`generateNetwork({ codebook, stages, ...options })` instead of passing the
codebook and stages as positional arguments. This is a breaking change.

It can also build name generator stages from real roster data. Pass parsed
roster nodes via the new `externalData` option, keyed by stage id, and roster
and roster-panel stages draw their people from those rows — preserving each
row's primary key and attributes — instead of inventing people from the
codebook. Draws are without replacement across prompts and stages, mirroring the
runtime's global exclusion of rows already in the network. A stage with no entry
still falls back to codebook-generated people. A new `config` option exposes the
generation-tuning defaults (the roster-versus-fabricate ratio, node counts, edge
probabilities, and so on) so callers can override them. FamilyPedigree stages
now mark exactly one generated node as ego, matching the runtime convention,
instead of randomising the ego flag across every node.

`@codaco/interview` now exposes its roster-parsing pipeline from the `./contract`
entry: `collectRosterExternalData` gathers a protocol's roster nodes keyed by
stage, and `parseExternalNetworkAsset` and `filterExternalPanelNodes` parse and
filter individual roster assets. This is the exact code the interview runtime
uses, so a host reads roster assets identically to a live interview.

`@codaco/protocol-validation` now exports a `StructuralCodebook` type for
consumers that assemble or receive a codebook before schema validation.

Roster rows parsed by `@codaco/interview` are now identified as
`subjectType_contentHash` instead of a bare content hash. A roster file that
backs more than one node type (say, a shared address book used by both a
person stage and a place stage) previously produced the same primary key for
matching rows under each type, an invariant violation once both ended up in
the same network. This is a breaking change: sessions saved by earlier
versions will not re-associate their roster people after upgrading.
