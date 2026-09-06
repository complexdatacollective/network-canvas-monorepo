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

| `<area>`                    | Owns the copy in                                                                                                                                                                 | Landed by |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `interface`                 | `interfaces/interfaceNames.ts`                                                                                                                                                   | #1702     |
| `stageTypeImage`            | `interfaces/StageTypeImage.tsx`                                                                                                                                                  | #1702     |
| `stageName`                 | `sections/StageNameSection.tsx`                                                                                                                                                  | #1702     |
| `operators`                 | `rules/operators.ts`                                                                                                                                                             | i18n-1a   |
| `ruleEditor`                | `rules/RuleEditorDialog.tsx`, `rules/ruleMessages.ts`                                                                                                                            | i18n-1a   |
| `ruleSet`                   | `rules/ruleSet.ts`, `rules/RuleSetField.tsx`                                                                                                                                     | i18n-1a   |
| `ruleValue`                 | `rules/RuleValueField.tsx`                                                                                                                                                       | i18n-1a   |
| `ruleList`                  | `rules/RuleList.tsx`                                                                                                                                                             | i18n-1a   |
| `rulePreview`               | `rules/RulePreview.tsx`                                                                                                                                                          | i18n-1a   |
| `ruleDescription`           | `rules/ruleDescription.ts`, `rules/ruleMessages.ts`                                                                                                                              | i18n-1a   |
| `ruleCodebook`              | `rules/ruleCodebook.ts`                                                                                                                                                          | i18n-1a   |
| `resourceKinds`             | `resources/components/resourceKinds.ts`                                                                                                                                          | i18n-1    |
| `resourcePicker`            | `resources/components/ResourcePickerControl.tsx`                                                                                                                                 | i18n-1    |
| `resourceBrowser`           | `resources/components/ResourceBrowserDialog.tsx`                                                                                                                                 | i18n-1    |
| `resourceUpload`            | `resources/components/ResourceUploadControl.tsx`                                                                                                                                 | i18n-1    |
| `resourceSecret`            | `resources/components/ResourceSecretControl.tsx`                                                                                                                                 | i18n-1    |
| `resourcePreview`           | `resources/components/ResourcePreview.tsx`                                                                                                                                       | i18n-1    |
| `resourceSummary`           | `resources/components/ResourceSummary.tsx`                                                                                                                                       | i18n-1    |
| `resourceFailure`           | `resources/resourceMessages.ts` (declared), produced by `resources/gateway*.ts`, `lifecycle.ts`, `references.ts`, `InMemoryResourceGateway.ts`                                   | i18n-1    |
| `session`                   | `session.ts`, `controller.ts`                                                                                                                                                    | i18n-1    |
| `protocolContext`           | `protocol-context.ts`                                                                                                                                                            | i18n-1    |
| `compoundEdit`              | `compound-edit/InMemoryCompoundHost.ts`, `compound-edit/compoundRequestMessages.ts`                                                                                              | i18n-1    |
| `codebookEntity`            | `codebook/components/CodebookSurface.tsx`, `codebook/components/CodebookEntityEditor.tsx`                                                                                        | i18n-2    |
| `codebookVariable`          | `codebook/components/VariableEditor.tsx`, `codebook/variableRoles.ts`, `codebook/variableOptions.ts`, `codebook/components/VariableBooleanAnswerFields.tsx`                      | i18n-2    |
| `variableValidation`        | `codebook/variableValidation.ts`, `codebook/validation/VariableValidationEditor.tsx`, `codebook/validation/CodebookVariableValidationEditor.tsx`, `codebook/codebookMessages.ts` | i18n-2    |
| `codebookEditing`           | `codebook/editing.ts`, `codebook/codebookMessages.ts`, `codebook/useCodebookVariableEdits.ts`                                                                                    | i18n-2    |
| `shell`                     | `form/StageEditorShell.tsx`                                                                                                                                                      | i18n-2    |
| `outline`                   | `form/SectionOutline.tsx`                                                                                                                                                        | i18n-2    |
| `dialogForm`                | `form/DialogForm.tsx`, `form/discardDraftGuard.ts`                                                                                                                               | i18n-2    |
| `protocolField`             | `form/ProtocolField.tsx`                                                                                                                                                         | i18n-2    |
| `arrayField`                | `form/arrayFields/DialogArrayField.tsx`, `rowValidators.ts`, `arrayWriteRefusal.ts`, `useConfirmRowRemoval.ts`, `arrayFields/arrayMessages.ts`, `RowEditorBoundary.tsx`          | i18n-2    |
| `assignAttributes`          | `form/arrayFields/AssignAttributes.tsx`, `form/arrayFields/Attribute.tsx`                                                                                                        | i18n-2    |
| `multiSelect`               | `form/arrayFields/MultiSelect.tsx`                                                                                                                                               | i18n-2    |
| `option`                    | `form/arrayFields/Option.tsx`, `form/arrayFields/Options.tsx`                                                                                                                    | i18n-2    |
| `entitySelect`              | `fields/EntitySelectField.tsx`                                                                                                                                                   | i18n-2    |
| `variablePicker`            | `fields/VariablePicker.tsx`, `sections/CreatableVariablePicker.tsx`                                                                                                              | i18n-2    |
| `skipLogicDestination`      | `fields/skipLogicDestination.ts`                                                                                                                                                 | i18n-2    |
| `networkFilter`             | `sections/NetworkFilterSection.tsx`                                                                                                                                              | i18n-2    |
| `skipLogic`                 | `sections/SkipLogicSection.tsx`                                                                                                                                                  | i18n-2    |
| `interviewerGuidance`       | `sections/InterviewerGuidanceSection.tsx`                                                                                                                                        | i18n-2    |
| `schemaProblem`             | `form/schemaProblems.ts`                                                                                                                                                         | sections  |
| `variableParameters`        | `codebook/variableParameters.ts`, `codebook/components/VariableParameterFields.tsx`                                                                                              | sections  |
| `compoundFailure`           | `codebook/compoundFailureCopy.ts`                                                                                                                                                | sections  |
| `sortOrder`                 | `fields/sortOrderOptions.ts`, `sections/prompts/SortOrderRows.tsx`                                                                                                               | sections  |
| `formFields`                | `sections/FormFieldsSection.tsx`                                                                                                                                                 | sections  |
| `attributeCodebookControls` | `sections/AttributeCodebookControls.tsx`                                                                                                                                         | sections  |
| `subjectSection`            | `sections/SubjectSection.tsx`                                                                                                                                                    | sections  |
| `introduction`              | `sections/IntroductionSection.tsx`                                                                                                                                               | sections  |
| `pageContent`               | `sections/PageContentSection.tsx`                                                                                                                                                | sections  |
| `contentBlock`              | `sections/contentBlocks/contentBlockTypes.ts`, `ContentBlockEditor.tsx`, `ContentBlockPreview.tsx`                                                                               | sections  |
| `promptsSection`            | `sections/PromptsSection.tsx`                                                                                                                                                    | sections  |
| `networkCanvas`             | `sections/network/`, `editors/network/SociogramStageEditor.tsx`                                                                                                                  | family F  |
| `pedigree`                  | `sections/pedigree/`                                                                                                                                                             | family F  |
| `narrativePedigree`         | `sections/narrativePedigree/`                                                                                                                                                    | family F  |
| `geospatial`                | `sections/geospatial/`, `fields/geospatial/`                                                                                                                                     | family F  |
| `anonymisation`             | `sections/anonymisation/`                                                                                                                                                        | family F  |

The `*Messages.ts` files are the homes for copy more than one module renders —
`extractMessages` throws when the same id is declared twice, so a shared string
has to have exactly one:

- `rules/ruleMessages.ts` — the date-resolution noun phrases (`ruleDescription.ts`
  and `RuleEditorDialog.tsx`), the rule-sentence subjects (`ruleDescription.ts`
  and `RulePreview.tsx`), and `ruleEditor.required` (`RuleEditorDialog.tsx` and
  `RuleValueField.tsx`).
- `resources/resourceMessages.ts` — every `resourceFailure.*` descriptor, so a
  gateway adapter author and a translator each read one list.
- `compound-edit/compoundRequestMessages.ts` — the refusals the session writes
  before sending a compound edit and a host writes again on receiving one.
- `codebook/codebookMessages.ts` — the blocked-section and saving copy the
  entity editor and the validation editor both show, and the missing-comparison
  refusal both validation editors produce. It declares ids in two areas, which
  is allowed: an area names the copy's subject, and a file is only obliged to
  be the single home of each id.
- `form/arrayFields/arrayMessages.ts` — the generic row noun every array-field
  sentence is built around.
- `sections/network/networkCanvasMessages.ts`,
  `sections/pedigree/pedigreeMessages.ts`,
  `sections/narrativePedigree/narrativePedigreeMessages.ts`,
  `sections/geospatial/geospatialMessages.ts` and
  `sections/anonymisation/anonymisationMessages.ts` — one file per interface
  family, holding EVERYTHING that family says rather than only its shared
  strings. See "One file per family", below.

Two areas own the same sentence in two modules, and the sentence is declared
once: `form/arrayFields/crossClassPick.ts` re-exports the cross-class refusals
from `codebook/variableValidation.ts` rather than declaring
`arrayField.*ElsewhereRefusal` twins of them. The array field and the codebook
editor report the same conflict, so a translator answers once.

### Reserved — not yet converted

Named here so a later split takes the name rather than inventing a synonym.

| `<area>`                   | Will own the copy in                       | Expected in |
| -------------------------- | ------------------------------------------ | ----------- |
| `subjectSelect`            | `fields/SubjectSelectField.tsx`            | splits 3–6  |
| `nodePanels`               | `sections/NodePanelsSection`               | family D    |
| `searchOptions`            | `sections/SearchOptionsSection`            | family D    |
| `alterLimits`              | `sections/AlterLimitsSection`              | family D    |
| `quickAdd`                 | `sections/QuickAddSection`                 | family D    |
| `sortOptions`              | `sections/SortOptionsSection`              | family D    |
| `nameGeneratorPrompts`     | `sections/NameGeneratorPromptsSection`     | family D    |
| `cardDisplay`              | `sections/CardDisplaySection`              | family D    |
| `externalDataSource`       | `sections/ExternalDataSourceSection`       | family D    |
| `censusPrompts`            | `sections/prompts/`                        | family E    |
| `removeAfterConsideration` | `sections/RemoveAfterConsiderationSection` | family E    |
| `ordinalColor`             | `fields/OrdinalColorField`                 | family E    |

### One file per family — the five interface families

| `<area>`            | Owns the copy in                                                | Declared in                                               |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `networkCanvas`     | `sections/network/`, `editors/network/SociogramStageEditor.tsx` | `sections/network/networkCanvasMessages.ts`               |
| `pedigree`          | `sections/pedigree/`                                            | `sections/pedigree/pedigreeMessages.ts`                   |
| `narrativePedigree` | `sections/narrativePedigree/`                                   | `sections/narrativePedigree/narrativePedigreeMessages.ts` |
| `geospatial`        | `sections/geospatial/`, `fields/geospatial/`                    | `sections/geospatial/geospatialMessages.ts`               |
| `anonymisation`     | `sections/anonymisation/`                                       | `sections/anonymisation/anonymisationMessages.ts`         |

A `*Messages.ts` per family, holding every id the family declares — rather than
descriptors beside each section's markup, which is the rule everywhere else in
this package. The reason is the seam. Much of what these families say is
rendered somewhere ELSE: in `BuilderSection`'s confirmation before a capability
is switched off, in `DialogArrayField`'s row affordances and write refusals, in
the sentences `PromptsSection` and `FormFieldsSection` say for one interface.
Splitting a family's words between the file that renders them and the file that
hands them to somebody else would leave a translator answering half a question
in two places, so one file per family answers it once.

A family that needs different words from a shared section names them one at a
time as `MessageDescriptor` props — `PromptsSection`'s `description`,
`FormFieldsSection`'s `title`, `SectionCapability.confirmClear` — never as
strings and never as a `copy` bundle. `src/__tests__/hostCopyOverrides.test.ts`
is the scan that keeps it that way. Its `NOT_CONVERTED_YET` exclusion still
names these five directories, which is now stale: they hold no `copy?:` prop
and no string-bearing `…Copy` type, and the five entries go the next time that
file is edited.

Three reserved areas turned out to need no ids at all, and two name files that
do not exist yet. Recorded rather than dropped, so nobody re-reserves a name
for something else or reopens a decision that has been made:

- **`autoName`** — `naming/` produces a stage's proposed `label`, which is
  SAVED into the protocol document and then read back by `dedupeStageLabel` to
  decide uniqueness and cut to 50 characters by `truncateToWord`. A translated
  proposal would stop colliding with the same stage named in another language,
  and would be cut in a different place, so the same configuration would
  acquire a different stored name depending on who created it. It is the
  `INTERFACE_NAMES` case and stays English; the argument is written out over
  `STAGE_TYPE_NAMES`.
- **`markdown`** — `markdown/markdownAdapter.ts` transforms a document tree
  and holds no copy.
- **`builderSection`** — `sections/BuilderSection.tsx` renders only the words
  its section hands it, as `MessageDescriptor`s on `SectionCapability`, plus
  `commonMessages.cancel`.
- **`subjectSelect`** — `fields/SubjectSelectField.tsx` exists now and holds no
  copy of its own: it bridges the schema's `{entity, type}` subject to the bare
  type ids `EntitySelectField` speaks, and every word around it — the label,
  the hint, the empty state — belongs to the section that mounts it
  (`subjectSection`) or to the control it wraps (`entitySelect`). The name
  stays reserved rather than being reused for something else.
- **`attributeCodebookControls`** owns only the words on its own buttons. What
  each dialog it opens says is the codebook editor's
  (`codebookVariable`, `variableValidation`), because the researcher is looking
  at that editor by then.

`sections/StageHeading.tsx` and `sections/collectableTypes.ts` hold no copy
either: the first composes `StageNameSection` from the protocol's own stage
order, and the second is a list of schema tokens that the controls offering
them label.

The RESOURCE half of `schemaProblem` — what a researcher is told about a stored
resource entry the asset schema refuses — is declared in `form/schemaProblems.ts`
beside the stage half rather than in `resources/resourceMessages.ts`, which owns
the gateway's own refusals. They are the same vocabulary asked about two
different documents, and a translator answering "holds the wrong kind of value"
twice should see both askings side by side.

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
