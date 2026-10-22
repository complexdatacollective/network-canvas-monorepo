---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

A question on a Family Pedigree stage's person form can be worded for the
participant when it is about them: "Are you still living?" for the
participant, and "Is this person still living?" for everyone else in their
family.

**Protocols (`@codaco/protocol-validation`)**

- A dynamic value can read `node.$isParticipant`, whether the node a Family
  Pedigree person form is about is the participant. It is offered only in
  that form's questions, is never missing, and only chooses wording: its
  binding has the one case `participant: true`, and everyone else takes the
  `other` version. It can never be shown as words.
- Exports `dynamicValueParticipantPathFor`, `dynamicValueParticipantRolesAt`
  and `PARTICIPANT_CASE`.

**Interview runtime (`@codaco/interview`)**

- The Family Pedigree person form tells its questions whether the person is
  the participant, so the right version shows. `useProtocolForm` takes
  `isParticipant` for this.

**Architect**

- In a Family Pedigree person form question, the insert-a-value menu lists
  **Participant or someone else** under Contextual Attributes. It inserts
  one version of the text for the participant and one for everyone else. The
  participant marker attribute stays in the menu too.
- The CEGRM template's living-status and birth-year questions use it in
  place of the participant marker attribute.
