---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

Every object in a schema 9 protocol that is edited, reordered or pointed at on
its own now has an `id` that is a UUID, and no two objects in one protocol may
share an id. That covers stages, prompts, panels, Information items, form
fields (including a Network Composer's node and connection forms), filter
rules, sort rules, a prompt's additional attributes, a Name Generator Roster's
card and sortable properties, Narrative presets with their edge and highlight
rows, Narrative Pedigree diseases and Network Composer edge configurations.

Upgrading a protocol from schema 8 gives every one of these objects a new,
random UUID, including any that already had one. Skip logic destinations and
Narrative Pedigree source stages follow the stages they point at; where two
stages shared an id, they follow the first. The stage and prompt ids stored in
an interview's nodes are not changed. Upgrading the same protocol twice gives
different ids. The stages an upgrade adds no longer have readable ids such as
`finish`, so find a Finish Screen stage by its type.

For developers:

- `ProtocolObjectIdSchema`, `ProtocolObjectId`, `ProtocolObjectKind`,
  `isProtocolObjectId` and `createProtocolObjectId` describe and make ids.
- `collectProtocolObjectIds` lists every id in a protocol with its path and
  kind, `findDuplicateProtocolObjectIds` lists the ids used more than once, and
  `freshenProtocolFragmentIds` gives a stage or list of stages new ids wherever
  they would collide with ids already in a destination protocol, updating stage
  references inside the fragment and returning the old-to-new id map.
- A repeated id is reported once at each place it is used, as a `custom` issue
  with `params.rule === 'duplicateObjectId'`. Each issue from `validateProtocol`
  has an optional `objectId`, the id of the nearest object it is about, and
  `enclosingProtocolObjects` finds that object for paths into any part of a
  protocol, such as a single stage. `withEnclosingObjectIds` adds the id to a
  list of issues, `collectProtocolObjectIdsFromSchema` lists the ids in one part
  of a protocol, and `deterministicProtocolObjectId` makes repeatable ids for
  generated protocols.
- `findDuplicateId`, `duplicateIdRefinement`, `uniqueFormFieldIds`,
  `uniqueFormFields` and `MAX_STAGE_ID_LENGTH` are removed, and
  `createDefaultFinishSessionStage` requires a `ProtocolObjectId`.
- `SyntheticInterview` gives every object it builds a UUID id that is the same
  for the same seed and build order. Its stage handles carry that id, and a
  readable row id passed to it is used as a label for the id it makes.
- The schema 9 sample and development protocols carry UUID ids.
