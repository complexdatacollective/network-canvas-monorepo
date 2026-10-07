---
'@codaco/protocol-validation': minor
---

The v8 to v9 migration converts a schema 8 Family Pedigree stage into the
redesigned schema 9 stage, so a protocol that has one migrates to a valid
schema 9 protocol:

- `nodeConfig.type` becomes the stage `subject`. `nodeLabelVariable`,
  `egoVariable` and `biologicalSexVariable` become `nodeConfiguration`'s
  `nameAttribute`, `egoAttribute` and `sexAssignedAtBirthAttribute`.
- `edgeConfig`'s `relationshipTypeVariable`, `isActiveVariable` and
  `isGestationalCarrierVariable` become `edgeConfiguration`'s `kindAttribute`,
  `currentPartnerAttribute` and `gestationalCarrierAttribute`.
- `censusPrompt` becomes `prompt`, and `nodeConfig.form` becomes `form`.
- A `fixed` framing becomes its value, and `participantChoice` becomes
  `participantPreference`.
- Each nomination prompt's `variable` becomes `attribute`. A prompt whose id is
  `pedigree`, which schema 9 reserves, is given a fresh id.
- A `requireGrandparents` boundary of `required` or `recommended` becomes a
  `completeness` with the `grandparents` scope and the same enforcement. A new
  categorical `relativesNotRecorded` attribute, with the fixed options, is
  added to the person type for it.
- The sex at birth and relationship kind attributes take the schema 9 option
  labels. Their values are the same in both schemas, so recorded answers are
  unchanged.
- An `introScreen` with something to show becomes an Information stage
  inserted just before the pedigree. It takes the pedigree's skip logic, and a
  skip that jumped to the pedigree now jumps to it. Inserting a stage moves
  every later stage's position, so an interview in progress on such a protocol
  resumes one stage early after its protocol is migrated in place.
- `requireChildrenContributors`, `relationshipVariable` and
  `gameteRoleVariable` have no counterpart and are dropped. Their attributes
  stay in the codebook.

A Narrative Pedigree disease's `variable` becomes `attribute`. The migration
notes describe the conversion to researchers.
