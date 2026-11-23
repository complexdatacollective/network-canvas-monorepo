---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

Every object in a schema 9 protocol that is edited, reordered or pointed at on
its own now has an `id` that is a UUID, and no two objects in one protocol may
share an id. That covers stages, prompts, panels, form fields (including a
Network Composer's node and connection forms), filter rules, sort rules, a
prompt's additional attributes, a Name Generator Roster's card and sortable
properties, Narrative presets with their edge and highlight rows, Narrative
Pedigree diseases and Network Composer edge configurations.

Upgrading a protocol from schema 8 gives every one of these objects a new,
random UUID, including any that already had one. Skip logic destinations and
Narrative Pedigree source stages follow the stages they point at; where two
stages shared an id, they follow the first. The stage and prompt ids stored in
an interview's nodes are not changed. Upgrading the same protocol twice gives
different ids. The stages an upgrade adds no longer have readable ids such as
`finish`, so find a Finish Screen stage by its type.

The ids that node types, edge types and variables are stored under in a
schema 9 codebook must be UUIDs too. Readable ids such as `person`, `knows` or
`age` are refused. No two variables in the codebook may share an id, and no
two node types or two edge types may share one. Upgrading a protocol from
schema 8 gives every node type, edge type and variable a new, random UUID,
including any whose id was already a UUID, and updates everything in the
protocol that refers to them: stage subjects, edges that stages create or
show, filter, skip logic and sort rules, form fields, prompt and layout
variables, Narrative Pedigree attributes and piped text values. Names do not
change, so exported data keeps the same column names, and a roster column still
matches the variable that has the same name. A roster column whose heading is
a variable's old id, rather than its name, no longer matches it. Interviews
already collected are not changed.

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
- `VariableIdSchema`, `isVariableId` and `createVariableId` describe and make
  variable ids, and `EntityTypeIdSchema`, `isEntityTypeId` and
  `createEntityTypeId` do the same for node and edge type ids.
  `deterministicVariableId(namespace)(label)` and
  `deterministicEntityTypeId(namespace)(label)` make repeatable ids for
  generated protocols and fixtures. `renameCodebookIds(document, renames)`
  gives a schema 9 document's types and variables new ids and updates every
  reference to them, with the types `CodebookIdRenames` and `VariableOwner`.
- `findDuplicateId`, `duplicateIdRefinement`, `uniqueFormFieldIds`,
  `uniqueFormFields` and `MAX_STAGE_ID_LENGTH` are removed, and
  `createDefaultFinishSessionStage` requires a `ProtocolObjectId`.
- `SyntheticInterview` gives every object it builds a UUID id that is the same
  for the same seed and build order. Its stage handles carry that id, and a
  readable row id passed to it is used as a label for the id it makes. The
  node types, edge types and variables it adds get UUID ids in the same way: a
  readable id passed to it is used as a label, a UUID passed to it is kept,
  and callers read the id from what the add call returns.
- The schema 9 sample and development protocols carry UUID ids, in their
  codebooks as well.
