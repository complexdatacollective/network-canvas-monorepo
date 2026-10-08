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
  before the participant continues. From the parents, siblings and children
  scope upwards, each of the participant's biological children needs their
  other biological parent; an unnamed parent counts, and that parent's own
  family is not required.
- Which gamete each genetic parent gave is never asked. One shared rule
  derives it from sex assigned at birth (by elimination where one parent is
  neither female nor male), and the kinship words and the genetics engine
  both read it.
- No addition gives anyone more than two genetic parents, or two of one sex
  assigned at birth: a placeholder parent is biological only while a genetic
  place is open, and "also parent of" links carry the anchor link's kind and
  carrier. Full siblings need the same parents.
- A stage can record each person's relationship to the participant (parent,
  half sibling, cousin and so on) so later stages can filter on it. It is
  worked out from the family drawn every time the participant leaves the
  stage, given to everyone connected to the participant but never the
  participant, and cleared from anyone no longer connected.
- The stage is not left forwards until the participant has chosen its
  wording, when the stage lets them choose.
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
  only from that stage, though any stage may still record answers to it, and
  only one stage may manage them: two stages binding the same gender identity
  attribute are refused. `relationshipToParticipantAttribute` (optional) is a
  categorical attribute with the fixed `PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT`
  values, which only the pedigree may write.
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
framing carries over. Every converted stage gets a `completeness` setting,
since schema 8 always required both of the participant's parents: the
parents scope, required, or the grandparents scope at the `requireGrandparents`
boundary's enforcement. A recommended grandparents boundary therefore makes
the parents a recommendation too, and the migration notes say so. Each
person type a converted stage uses gets a new `relativesNotRecorded`
attribute, whose name ends in a number when the type already uses that name.
An `introScreen` becomes an Information stage titled "Introduction", the
heading schema 8 showed above it, inserted just before the pedigree. That
stage takes the pedigree's skip logic, and skips that jumped to the pedigree
now jump to it. Interviews recorded against a migrated protocol are migrated
with it: each stage's metadata and the resume position follow their stage, so
an interview in progress resumes where its participant left it. A schema 8
pedigree's stage metadata becomes the new shape, keeping the participant's
framing and "no children" answer, and writing to the network any people and
relationships that were only held in it. Parent relationships lose the
`isActive` flag schema 8 wrote on them, which schema 9 reads as "current
partner", and carry the gestational carrier flag as true or false, as the
redesigned stage writes them. A person with no sex at birth recorded who gave
an egg or a sperm, by schema 8's gamete role, is recorded as female or male.
`requireChildrenContributors`, `relationshipVariable` and
`gameteRoleVariable` are dropped; their attributes stay in the codebook. The
old relationship attribute held English text, so a converted stage records no
relationship to the participant until a categorical attribute is chosen for
it. Node
form fields collecting the name or sex at birth attribute are left out, since
the stage asks both itself. A pedigree whose answers share an attribute (two
nomination prompts, a nomination prompt and a node form field, or the name
and another answer) is not converted: the migrated protocol fails validation,
naming the attribute. The migration notes describe all of this to researchers.

**In Architect**, the stage editor configures the new stage. It has a
setting that gives person symbols a shape for each sex assigned at birth or
gender identity, and edits a gender identity attribute's options together
with their kinship words. The gender identity picker rules out an attribute
whose options another stage manages. Recording each person's relationship to
the participant is switched on in the person attributes, which creates an
attribute with the fixed values labelled in the researcher's language, and
the protocol summary lists it. Architect offers and summarises the Narrative
Pedigree again, and won't let a Family Pedigree's person type change while a
Narrative Pedigree reads it. The Colored Eco-Genetic Relationship Map template
marks the people named in "People in your life" with a `non_kin` attribute,
instead of treating anyone without a gender identity as non-kin.
