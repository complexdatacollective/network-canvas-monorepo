---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/protocol-utilities': minor
'@codaco/architect': minor
'fresco': minor
'@codaco/interviewer': minor
---

The interview shows a stage's dynamic values in its text. A prompt, form question, introduction, Information screen or finish screen reads the version of its message that the values choose, with each value written in the interview's language: dates in full, numbers and lists as the language writes them, a categorical value as its option's label, and a boolean as its label or yes and no. Values are read live, so a form question changes as the participant answers an earlier question on the same form (on a Family Pedigree form, also the name, gender identity and sex questions above it), and a correction made earlier shows at once. A form adding a person on a Name Generator prompt already has the attributes the prompt gives them.

- Each filled-in value has a dashed outline, so participants can tell it was filled in for them. Screen readers announce it as "Dynamic value: …", translated into every interface language. The value is isolated for bidirectional text.
- A value is only ever text. Markdown, HTML or message syntax in a participant's answer is shown as typed. It never becomes formatting, a link or an image, and it is never sent to analytics or written to the console.
- A Dyad or Tie Strength Census prompt can show the two people it asks about, and a one-to-many census prompt can show its focal person.
- `@codaco/fresco-ui`'s `RenderMarkdown` exports its default rehype plugins (`DEFAULT_MARKDOWN_REHYPE_PLUGINS`) and its default label elements (`ALLOWED_MARKDOWN_LABEL_TAGS`) so that a caller can extend them. It also exports `getMarkdownAttributeValues`, which lists the attribute values (link destinations and titles, image sources and text) a piece of markdown produces.
- `SyntheticInterview` stages can carry `dynamicValues`.
- `ProtocolField` takes a `label` to show in place of the field's authored label, as it already took a `hint`. Architect's form field preview uses it to show a question that holds values.
