---
'@codaco/protocol-validation': major
'@codaco/protocol-utilities': major
'@codaco/shared-consts': patch
'@codaco/interview': minor
'@codaco/development-protocol': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The Family Pedigree is redesigned, and schema 9 carries the new stage. Schema 8
keeps the Family Pedigree stage that has already been released, unchanged.

**In the interview**, participants build their family on a pan-and-zoom canvas.
Selecting a person opens a side panel for their details. Hovering a person, or
focusing them from the keyboard, offers to add a parent, partner, sibling or
child. The participant is shown as "You" and is never asked their name. People
the participant leaves unnamed are shown by a kinship word in the stage's
wording: gendered (mother, brother), gamete-based (egg parent, sperm parent),
or the participant's own choice. When gender identity is asked, those words
follow each person's gender identity; otherwise they follow sex assigned at
birth.

- Names the participant types follow the name attribute's validation in the
  codebook. Encrypted name attributes work, using the usual passphrase prompt.
- When the participant leaves the stage, each unnamed person is given a
  distinct label as their name, so later stages can tell people apart, for
  example "Sister (partner of Tom)". The stage records who holds a generated
  label in its stage metadata as a fingerprint, not as text. On a return visit
  the labels follow the family as it changes, and a name typed on a later
  stage is kept. The `@codaco/shared-consts` stage metadata schema accepts this
  `generatedLabels` record and no longer requires a `framing`.
- The stage draws only the participant's family: the participant and everyone
  connected to them through the stage's relationships. People of the same
  type added by other stages are never drawn, labelled, counted towards
  completeness or offered to nomination prompts. Removing someone also
  removes anyone connected to the participant only through them, after
  naming those people. A connection that is someone's only link to the family
  can't be removed.
- Completeness settings can require, or recommend, that a minimum part of the
  family is recorded, along with every required detail about each person,
  before the participant continues.
- Nomination prompts ask the participant to select the relatives a question
  applies to, and can leave out people recorded with one sex assigned at
  birth.
- The layout keeps couples side by side when partnerships form chains,
  draws every child below each of its parents (including when a parent is
  one of the child's own descendants), and joins a step-parent to a child
  with a dashed line.

**The Narrative Pedigree** reads the redesigned Family Pedigree. It draws the
same family on the same canvas, labels people as the Family Pedigree does,
and can be operated from the keyboard: arrow keys move between people, Enter
or Space focuses on someone, and + and − zoom. Sex-linked inheritance reads sex
assigned at birth. An intersex person is treated as uncertain, and a parent
whose sex isn't known is placed by the gamete their co-parent's sex implies.
Arrow keys no longer start a drag of either pedigree's canvas.

**The schema 9 Family Pedigree stage** names its people by its `subject` and
has:

- `prompt`, the translatable task instructions.
- `nodeConfiguration`: `nameAttribute` (text), `sexAssignedAtBirthAttribute`
  (categorical, with the fixed `PEDIGREE_SEX_ASSIGNED_AT_BIRTH` options),
  `egoAttribute` (boolean), and optionally `genderIdentity`
  (`{ attribute, terms }`). Its `terms` give the kinship words
  (`PEDIGREE_GENDER_WORDS`) that each gender identity option takes. The
  options of a gender identity attribute that a pedigree binds can be edited
  only from that stage, though any stage may still record answers to it.
- `edgeConfiguration`: the family edge type, with `kindAttribute`
  (categorical, with the fixed `PEDIGREE_RELATIONSHIP_KINDS` options), and
  `gestationalCarrierAttribute` and `currentPartnerAttribute` (both boolean).
- `framing` (optional): `gendered`, `gamete` or `participantPreference`.
- `completeness` (optional): `scope`, `enforcement`, and the categorical
  `relativesNotRecordedAttribute` with the fixed
  `PEDIGREE_RELATIVES_NOT_RECORDED` options.
- `form` (optional): extra person fields, asked after the interface's own.
- `nominationPrompts` (optional): each has a translatable `text`, a boolean
  `attribute`, and optionally `onlyForSexAssignedAtBirth`. The id `pedigree` is
  reserved.

The labels of the fixed option sets are translatable, and fixed options are
validated by their values only. A Narrative Pedigree disease names its
boolean person attribute as `attribute` (it was `variable`).
`NarrativeDiseaseEntry` in `@codaco/protocol-utilities` takes `attribute`, and
`SyntheticInterview` writes Family Pedigree stages in the new shape.

**The v8 to v9 migration** converts a schema 8 Family Pedigree. The old
attributes map to their new places, `censusPrompt` becomes `prompt`, and the
framing carries over. A `requireGrandparents` boundary becomes a `completeness`
setting, with a new `relativesNotRecorded` attribute. An `introScreen` becomes
an Information stage inserted just before the pedigree. That stage takes the
pedigree's skip logic, and skips that jumped to the pedigree now jump to it.
Interviews recorded against a migrated protocol are migrated with it: each
stage's metadata and the resume position follow their stage, so an interview
in progress resumes where its participant left it. A schema 8 pedigree's
stage metadata becomes the new shape, keeping the participant's framing and
"no children" answer, and writing to the network any people and relationships
that were only held in it. `requireChildrenContributors`, `relationshipVariable` and
`gameteRoleVariable` are dropped; their attributes stay in the codebook. The
migration notes describe all of this to researchers.

**In Architect**, the stage editor configures the new stage. It has a
setting that gives person symbols a shape for each sex assigned at birth or
gender identity, and edits a gender identity attribute's options together
with their kinship words. Architect offers and summarises the Narrative
Pedigree again, and won't let a Family Pedigree's person type change while a
Narrative Pedigree reads it. The Colored Eco-Genetic Relationship Map template
marks the people named in "People in your life" with a `non_kin` attribute,
instead of treating anyone without a gender identity as non-kin.
