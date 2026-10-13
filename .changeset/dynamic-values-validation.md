---
'@codaco/protocol-validation': minor
---

Schema 9 stage text can show values from the interview, such as the participant's name, the person a question is about, or when the interview started. A stage's `dynamicValues` binds each short argument name its messages use (`{partnerName}`) to a value: an intrinsic (`interview.id`, `interview.startedAt`, `protocol.name`, `protocol.hash`, `stage.id`, `now`) or an attribute of the participant (`ego.<id>`), the person or relationship a form describes (`node.<id>`, `edge.<id>`), the two people a Dyad Census asks about (`dyad.source.<id>`, `dyad.target.<id>`) or a one-to-many census's focal person (`one_to_many.focal.<id>`). A categorical, ordinal or boolean value's binding can name `cases` for its options.

- Prompts, form field captions, introduction and panel text, Information screens, the anonymisation explanation and the finish screen's heading and text may show values. Stage labels, codebook text, `interfaceText` and wording Network Canvas supplies may not.
- Each site shows only what is available there: the participant and the interview everywhere, the pair on a Dyad or Tie Strength Census prompt, the focal person on a one-to-many census prompt, and on a form field the values of the form's subject that earlier fields have written. `dynamicValueContextFor`, `dynamicValueArgumentsAt` and `dynamicValueStatus` give that table, and `findDynamicValueProblems` checks a protocol against it.
- A value that can be missing (any attribute, `interview.startedAt`, `protocol.hash`) is shown only inside a version for when it has one: `{partnerName, select, missing {…} other {…{partnerName}…}}`. Versions can also follow a value's cases or, for a number, its plural category. `findDynamicValueProblem` is the one checker; `dynamicMessageParts` gives the version a message reads for given values.
- A translation must show every value the protocol's default-language text shows, in the same versions (`findMissingDynamicPlacement`). A plural category only one whole number selects may leave its number out.
- A binding to an attribute that does not exist, or one that is encrypted, is an error at every text that uses it. Bindings count as uses of their attribute in `collectEntityAttributeReferences`.
- Text cannot contain U+E000, which the interview uses to place values (`DYNAMIC_VALUE_MARKER`).
