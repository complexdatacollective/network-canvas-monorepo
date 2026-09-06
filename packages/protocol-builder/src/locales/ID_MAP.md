# `protocolBuilder.*` message ids

Every researcher-facing string in this package is a `defineMessages` descriptor
under one id in this namespace. This file is the register of those ids: read it
before converting a module, and add to it in the same pull request that adds
the ids.

It exists because the conversion is spread across many branches. `extractMessages`
throws when one id is declared in two files, and a renamed id is a translation
silently orphaned — two branches independently choosing
`protocolBuilder.prompts.add` and `protocolBuilder.promptsSection.add` for the
same string only collide at merge. Agreeing the segment names up front is what
prevents that.

## Shape

```
protocolBuilder.<area>.<roleKey>
```

- **`protocolBuilder.`** — fixed. `src/locales/__tests__/catalogs.test.ts`
  refuses any id outside it, so no host's namespace can be declared here.
- **`<area>`** — one segment from the closed list below, naming the module or
  the section the copy belongs to, camelCased. Exactly one segment: nothing
  nests deeper.
- **`<roleKey>`** — what the message DOES, camelCased.

## Naming the key

**A key names the message's role, never its text.** `outlineColorHint`, not
`chooseTheColorUsedToOutline`. A key derived from the first words of the
message changes the moment the copy is edited, which is the one thing a stable
id exists to prevent: renaming it orphans the Spanish, and not renaming it
leaves a key that describes a message the package no longer has.

Both failure modes are silent in different places. The extraction guard catches
the renamed id (`committed entry no longer in source`) but the translation is
already gone; the stale key is caught by nothing at all.

Practical rules:

- Name the role: `title`, `submit`, `emptyState`, `placeholder`, `hint`,
  `retry`, `unreadable`, `noOptions`.
- Where one area carries the same role for several subjects, qualify the
  subject first: `nodeAttributeLabel` / `edgeAttributeLabel`, not
  `labelForNode`.
- A message keyed by a schema token — an operator, a failure reason, a problem
  code — takes that token as its key, camelCased: `greaterThanOrEqual`,
  `tooLarge`, `duplicateId`. Those keys are stable by construction, and a
  record of descriptors keyed on the token keeps its exhaustiveness test.
- Never disambiguate with a numeric or hash suffix. Two messages that need one
  are two roles, and the roles are what to name.

## Generic verbs come from `common.*`

Import `commonMessages` from `@codaco/app-i18n/common` for Cancel, Save, Close,
Delete, Confirm, Continue, Back, Done, Try again, Loading…, Search, and
Something went wrong. The guard test fails when a `common.*` id is declared —
or translated — in this package.

## The areas

One segment per module or section. **Closed list**: a conversion that needs a
name not here adds it here first, in the same pull request.

### Converted

| `<area>`          | Owns the copy in                                      | Landed by |
| ----------------- | ----------------------------------------------------- | --------- |
| `interface`       | `interfaces/interfaceNames.ts`                        | #1702     |
| `stageTypeImage`  | `interfaces/StageTypeImage.tsx`                       | #1702     |
| `stageName`       | `sections/StageNameSection.tsx`                       | #1702     |
| `operators`       | `rules/operators.ts`                                  | i18n-1a   |
| `ruleEditor`      | `rules/RuleEditorDialog.tsx`, `rules/ruleMessages.ts` | i18n-1a   |
| `ruleSet`         | `rules/ruleSet.ts`, `rules/RuleSetField.tsx`          | i18n-1a   |
| `ruleValue`       | `rules/RuleValueField.tsx`                            | i18n-1a   |
| `ruleList`        | `rules/RuleList.tsx`                                  | i18n-1a   |
| `rulePreview`     | `rules/RulePreview.tsx`                               | i18n-1a   |
| `ruleDescription` | `rules/ruleDescription.ts`, `rules/ruleMessages.ts`   | i18n-1a   |
| `ruleCodebook`    | `rules/ruleCodebook.ts`                               | i18n-1a   |

`rules/ruleMessages.ts` is the home for rule copy that more than one module
renders — `extractMessages` throws when the same id is declared twice, so a
shared string has to have exactly one home. It holds the date-resolution noun
phrases (`ruleDescription.ts` and `RuleEditorDialog.tsx`), the rule-sentence
subjects (`ruleDescription.ts` and `RulePreview.tsx`), and `ruleEditor.required`
(`RuleEditorDialog.tsx` and `RuleValueField.tsx`). The `resourceFailure` and
`compoundEdit` rows below name the same kind of home for the same reason.

### Reserved — not yet converted

Named here so a later split takes the name rather than inventing a synonym.

| `<area>`                    | Will own the copy in                                                                | Expected in |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| `resourceKinds`             | `resources/components/resourceKinds.ts`                                             | i18n-1b     |
| `resourcePicker`            | `resources/components/ResourcePickerControl.tsx`                                    | i18n-1b     |
| `resourceBrowser`           | `resources/components/ResourceBrowserDialog.tsx`                                    | i18n-1b     |
| `resourceUpload`            | `resources/components/ResourceUploadControl.tsx`                                    | i18n-1b     |
| `resourceSecret`            | `resources/components/ResourceSecretControl.tsx`                                    | i18n-1b     |
| `resourcePreview`           | `resources/components/ResourcePreview.tsx`                                          | i18n-1b     |
| `resourceSummary`           | `resources/components/ResourceSummary.tsx`                                          | i18n-1b     |
| `resourceFailure`           | `resources/resourceMessages.ts`, produced across `resources/`                       | i18n-1b     |
| `session`                   | `session.ts`, `controller.ts`                                                       | i18n-1b     |
| `protocolContext`           | `protocol-context.ts`                                                               | i18n-1b     |
| `compoundEdit`              | `compound-edit/InMemoryCompoundHost.ts`, `compound-edit/compoundRequestMessages.ts` | i18n-1b     |
| `codebookEntity`            | `codebook/components/CodebookEntityEditor.tsx`, `CodebookSurface.tsx`               | i18n-2      |
| `codebookVariable`          | `codebook/components/VariableEditor.tsx`                                            | i18n-2      |
| `variableParameters`        | `codebook/components/` parameter editors                                            | i18n-2      |
| `variableValidation`        | `codebook/variableValidation.ts`, `codebook/validation/`                            | i18n-2      |
| `compoundFailure`           | `codebook/compoundFailureCopy.ts`                                                   | i18n-2      |
| `codebookEditing`           | `codebook/editing.ts`                                                               | i18n-2      |
| `shell`                     | `form/StageEditorShell.tsx`                                                         | i18n-2      |
| `outline`                   | `form/SectionOutline.tsx`                                                           | i18n-2      |
| `dialogForm`                | `form/DialogForm.tsx`                                                               | i18n-2      |
| `protocolField`             | `form/ProtocolField.tsx`                                                            | i18n-2      |
| `schemaProblem`             | `form/schemaProblems.ts`                                                            | split 4     |
| `arrayField`                | `form/arrayFields/DialogArrayField.tsx`, `rowValidators.ts`                         | i18n-2      |
| `assignAttributes`          | `form/arrayFields/AssignAttributes*.tsx`                                            | i18n-2      |
| `multiSelect`               | `form/arrayFields/MultiSelect.tsx`                                                  | i18n-2      |
| `option`                    | `form/arrayFields/Option*.tsx`                                                      | i18n-2      |
| `entitySelect`              | `fields/EntitySelectField.tsx`                                                      | i18n-2      |
| `subjectSelect`             | `fields/SubjectSelectField.tsx`                                                     | i18n-2      |
| `variablePicker`            | `fields/VariablePicker.tsx`, `CreatableVariablePicker`                              | i18n-2      |
| `skipLogicDestination`      | `fields/skipLogicDestination.ts`, `SkipLogicDestinationField.tsx`                   | i18n-2      |
| `sortOrder`                 | `fields/sortOrderOptions`                                                           | i18n-2      |
| `autoName`                  | `naming/generateStageLabel.ts`, `naming/resolveStageNameParts.ts`                   | i18n-2      |
| `markdown`                  | `markdown/markdownAdapter.ts`                                                       | i18n-2      |
| `networkFilter`             | `sections/NetworkFilterSection.tsx`                                                 | i18n-2      |
| `skipLogic`                 | `sections/SkipLogicSection.tsx`                                                     | i18n-2      |
| `interviewerGuidance`       | `sections/InterviewerGuidanceSection.tsx`                                           | i18n-2      |
| `builderSection`            | `sections/BuilderSection.tsx`                                                       | i18n-2      |
| `formFields`                | `sections/FormFieldsSection`                                                        | splits 3–6  |
| `subjectSection`            | `sections/SubjectSection`                                                           | splits 3–6  |
| `introduction`              | `sections/IntroductionSection`                                                      | splits 3–6  |
| `pageContent`               | `sections/PageContentSection`                                                       | splits 3–6  |
| `contentBlock`              | `sections/contentBlocks/`                                                           | splits 3–6  |
| `promptsSection`            | `sections/PromptsSection`                                                           | splits 3–6  |
| `attributeCodebookControls` | `sections/AttributeCodebookControls`                                                | splits 3–6  |
| `nodePanels`                | `sections/NodePanelsSection`                                                        | family D    |
| `searchOptions`             | `sections/SearchOptionsSection`                                                     | family D    |
| `alterLimits`               | `sections/AlterLimitsSection`                                                       | family D    |
| `quickAdd`                  | `sections/QuickAddSection`                                                          | family D    |
| `sortOptions`               | `sections/SortOptionsSection`                                                       | family D    |
| `nameGeneratorPrompts`      | `sections/NameGeneratorPromptsSection`                                              | family D    |
| `cardDisplay`               | `sections/CardDisplaySection`                                                       | family D    |
| `externalDataSource`        | `sections/ExternalDataSourceSection`                                                | family D    |
| `censusPrompts`             | `sections/prompts/`                                                                 | family E    |
| `removeAfterConsideration`  | `sections/RemoveAfterConsiderationSection`                                          | family E    |
| `ordinalColor`              | `fields/OrdinalColorField`                                                          | family E    |
| `networkCanvas`             | `sections/network/`                                                                 | family F    |
| `pedigree`                  | `sections/pedigree/`                                                                | family F    |
| `narrativePedigree`         | `sections/narrativePedigree/`                                                       | family F    |
| `geospatial`                | `sections/geospatial/`, geospatial `fields/`                                        | family F    |
| `anonymisation`             | `sections/anonymisation/`                                                           | family F    |

## Copy that leaves React

Three kinds, and the rule differs.

**A module that renders its own copy** declares descriptors beside the markup
and formats them with `useAppIntl()`.

**A module that PRODUCES copy without rendering it** — a validator, a
description builder, a problem reporter — declares its descriptors in place and
takes `intl: IntlShape` as a parameter, the way `interfaceDisplayName(stageType,
intl)` does. A module-level `createAppIntl({ locale: 'en' })` used as the
renderer would make that copy permanently English.

**Copy crossing a string-only contract** — `ResourceGatewayFailure.message`, an
`Error`'s `message`, a validation issue's `message` — is encoded with
`createMessageError(descriptor, values)` from `@codaco/app-i18n/messages` and
decoded where it is rendered with `formatMessageError(text, intl) ?? text`.
The fallback is what keeps a host's own plain-string failure working unchanged,
and fresco-ui's `FieldErrors`/`FormErrors` already decode, so anything reaching
a form's error region needs only the encoding half.

The one legitimate use of a module-level English formatter is a **stored or
seeded** value rather than displayed copy. `INTERFACE_NAMES`, which seeds
protocol stage labels, is the existing case, and it is English deliberately.

## Formatting

- Placeholders are named, never positional: `{count}`, `{attributeName}`.
- A number that is formatted rather than identified takes `{n, number}`, which
  groups thousands (`2,000`). Check a test asserting a four-digit number before
  converting it.
- Plurals are `{count, plural, one {…} other {…}}`, never a ternary over two
  strings.
- `'` is ICU's escape character before `{`, `}` and `#`. A message pairing an
  apostrophe with a placeholder needs `''`. `formatjs/no-invalid-icu` is
  enabled for this package and catches it.
- Every descriptor carries a `description` saying who reads the message, what
  each placeholder holds, and anything a translator cannot see from the English
  (whether "prompt" is the participant-facing question, whether "stage" is the
  interview step). `formatjs/enforce-description` requires one.

## Catalogs

- `en.json` is generated: `pnpm --filter @codaco/protocol-builder i18n:extract`.
  Never imported at runtime; it is the translator artifact and the freshness
  oracle.
- `en-GB.json` is a sparse override — only the words that differ (colour,
  visualise, centred, organisation).
- `es.json` is **complete**. `es` is not a regional variant of the source
  language, so the guard runs `checkFullLocale` over it: an id declared without
  Spanish fails this package's own suite. Every conversion ships its Spanish in
  the same pull request.
- Spanish register: informal `tú` imperatives (`Elige…`, `Introduce…`), matching
  #1702's own catalog and Architect's. Settled terminology: stage = _etapa_,
  prompt = _pregunta_, attribute = _atributo_, node = _nodo_, edge = _vínculo_,
  ego = _ego_, alter = _álter_, network = _red_, rule = _regla_, roster =
  _lista_, resource = _recurso_, interview = _entrevista_.
