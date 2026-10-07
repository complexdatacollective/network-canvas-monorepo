---
'@codaco/protocol-validation': major
---

Schema 9's Family Pedigree stage is the redesigned interface; schema 8 keeps
the Family Pedigree stage that has already been released, unchanged.

A schema 9 Family Pedigree stage names its people by its `subject` (a node
type) and has:

- `prompt`, the translatable text shown while the participant draws their
  family.
- `nodeConfiguration`: the person attributes the interface writes. These are
  `nameAttribute` (text), `sexAssignedAtBirthAttribute` (categorical, with the
  fixed `PEDIGREE_SEX_ASSIGNED_AT_BIRTH` options), `egoAttribute` (boolean) and,
  optionally, `genderIdentity` (`{ attribute, terms }`). `terms` gives the
  kinship words (`PEDIGREE_GENDER_WORDS`) that each gender identity option
  takes.
- `edgeConfiguration`: the family edge type and its attributes. These are
  `kindAttribute` (categorical, with the fixed `PEDIGREE_RELATIONSHIP_KINDS`
  options), `gestationalCarrierAttribute` and `currentPartnerAttribute` (both
  boolean).
- `framing` (optional): the wording, which is one of `gendered`, `gamete` or
  `participantPreference`.
- `completeness` (optional): which relatives must or should be recorded
  (`scope`, `enforcement`), and the categorical `relativesNotRecordedAttribute`
  that holds the fixed `PEDIGREE_RELATIVES_NOT_RECORDED` options.
- `form` (optional): extra person fields, asked after the interface's own.
- `nominationPrompts` (optional): each prompt has a translatable `text`, a
  boolean `attribute`, and optionally `onlyForSexAssignedAtBirth`.

The option labels of the fixed option sets are translatable, like any other
categorical option label. A protocol validates an attribute's fixed options by
their values only, so researchers can reword or translate the labels. The old
stage's `nodeConfig`, `edgeConfig`, `boundaries`, `introScreen` and
`censusPrompt`, and its `BIOLOGICAL_SEX`, `RELATIONSHIP_TYPES` and
`GAMETE_ROLES` value sets, are not part of schema 9.

The v8 to v9 migration does not convert a schema 8 Family Pedigree stage yet,
so migrating a protocol that has one fails validation.
