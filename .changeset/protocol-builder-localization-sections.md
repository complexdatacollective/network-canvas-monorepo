---
'@codaco/protocol-builder': minor
---

Localize the shared stage-editor sections. The prompts, form-fields, subject,
introduction, page-content and content-block sections, the attribute codebook
controls and the creatable attribute picker, the variable parameter and
boolean-answer editors, the sort-rule options, the section outline and the
schema refusals it reports now declare their copy as message descriptors under
`protocolBuilder.*`, and `@codaco/protocol-builder/locales` carries complete
Spanish for every one of them.

**Host-facing copy overrides are gone.** `PromptsSection`,
`FormFieldsSection`, `SubjectSection`, `IntroductionSection`,
`PageContentSection` and `StageNameSection` no longer accept a `copy` prop, and
the `PromptsCopy`, `FormFieldsCopy`, `SubjectSectionCopy`, `IntroductionCopy`,
`PageContentCopy` and `StageNameCopy` types are removed. Nothing passed one,
and a string handed in that way was invisible to extraction and
untranslatable — so the seam guaranteed that the words a host cared enough to
customise were the only words that stayed English. A caller that needs
different words supplies `MessageDescriptor`s, which extraction still sees:
`SectionCapability.confirmClear` and `DialogArrayField`'s `itemLabel` take
descriptors rather than strings for that reason. `SubjectSection` also drops
`filterCopy`, which relabelled the filter section it mounts.

Three producers outside React take the reader's own formatter rather than
reaching for one, so a caller passes `intl` where it used to pass nothing:
`validateParameters`, `validateBooleanAnswers` and `compoundFailureMessage`.
`getSortOrderOptionGetter`, `orphanedSortProperties` and
`missingSortPropertyLabel` do the same, because the option a dangling sort rule
still shows carries its own explanation as its label.

`schemaProblems` is a copy re-design rather than a swap. Each refusal is now a
whole sentence with the field's own name or the resource's own id inside it,
rather than a clause glued after one — ICU cannot express the join, and a
language that puts the subject elsewhere could not reach it from a fragment.
The English rendered is unchanged. Those sentences, and the refusals a form
reports, travel to their reader as encoded descriptors through the plain-string
fields they have always used, so they are read in the reader's language
wherever they are shown; a host that writes its own sentence into one of those
fields still has it shown exactly as written.

A host that mounts no provider sees exactly the English it had.
