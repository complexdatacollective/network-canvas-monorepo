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
| `resourceKinds`             | `resources/components/resourceKinds.ts`                                                                                                                                          | i18n-1b   |
| `resourcePicker`            | `resources/components/ResourcePickerControl.tsx`                                                                                                                                 | i18n-1b   |
| `resourceBrowser`           | `resources/components/ResourceBrowserDialog.tsx`                                                                                                                                 | i18n-1b   |
| `resourceUpload`            | `resources/components/ResourceUploadControl.tsx`                                                                                                                                 | i18n-1b   |
| `resourceSecret`            | `resources/components/ResourceSecretControl.tsx`                                                                                                                                 | i18n-1b   |
| `resourcePreview`           | `resources/components/ResourcePreview.tsx`                                                                                                                                       | i18n-1b   |
| `resourceSummary`           | `resources/components/ResourceSummary.tsx`                                                                                                                                       | i18n-1b   |
| `resourceFailure`           | `resources/resourceMessages.ts` (declared), produced by `resources/gateway*.ts`, `lifecycle.ts`, `references.ts`, `InMemoryResourceGateway.ts`                                   | i18n-1b   |
| `session`                   | `session.ts`                                                                                                                                                                     | i18n-1b   |
| `protocolContext`           | `protocol-context.ts`                                                                                                                                                            | i18n-1b   |
| `compoundEdit`              | `compound-edit/InMemoryCompoundHost.ts`, `compound-edit/compoundRequestMessages.ts`                                                                                              | i18n-1b   |
| `codebookEntity`            | `codebook/components/CodebookSurface.tsx`, `codebook/components/CodebookEntityEditor.tsx`                                                                                        | i18n-2a   |
| `codebookVariable`          | `codebook/components/VariableEditor.tsx`, `codebook/variableRoles.ts`, `codebook/variableOptions.ts`, `codebook/components/VariableBooleanAnswerFields.tsx`                      | i18n-2a   |
| `variableValidation`        | `codebook/variableValidation.ts`, `codebook/validation/VariableValidationEditor.tsx`, `codebook/validation/CodebookVariableValidationEditor.tsx`, `codebook/codebookMessages.ts` | i18n-2a   |
| `codebookEditing`           | `codebook/editing.ts`, `codebook/codebookMessages.ts`, `codebook/useCodebookVariableEdits.ts`                                                                                    | i18n-2a   |
| `shell`                     | `form/StageEditorShell.tsx`, `editors/saveStageAction.tsx`                                                                                                                       | i18n-2b   |
| `outline`                   | `form/SectionOutline.tsx`                                                                                                                                                        | i18n-2b   |
| `dialogForm`                | `form/DialogForm.tsx`, `form/discardDraftGuard.ts`                                                                                                                               | i18n-2b   |
| `protocolField`             | `form/ProtocolField.tsx`                                                                                                                                                         | i18n-2b   |
| `arrayField`                | `form/arrayFields/DialogArrayField.tsx`, `rowValidators.ts`, `arrayWriteRefusal.ts`, `useConfirmRowRemoval.ts`, `arrayFields/arrayMessages.ts`, `RowEditorBoundary.tsx`          | i18n-2b   |
| `assignAttributes`          | `form/arrayFields/AssignAttributes.tsx`, `form/arrayFields/Attribute.tsx`                                                                                                        | i18n-2b   |
| `multiSelect`               | `form/arrayFields/MultiSelect.tsx`                                                                                                                                               | i18n-2b   |
| `option`                    | `form/arrayFields/Option.tsx`, `form/arrayFields/Options.tsx`                                                                                                                    | i18n-2b   |
| `entitySelect`              | `fields/EntitySelectField.tsx`                                                                                                                                                   | i18n-2b   |
| `variablePicker`            | `fields/VariablePicker.tsx`, `sections/CreatableVariablePicker.tsx`                                                                                                              | i18n-2b   |
| `skipLogicDestination`      | `fields/skipLogicDestination.ts`                                                                                                                                                 | i18n-2b   |
| `networkFilter`             | `sections/NetworkFilterSection.tsx`                                                                                                                                              | i18n-2b   |
| `skipLogic`                 | `sections/SkipLogicSection.tsx`                                                                                                                                                  | i18n-2b   |
| `interviewerGuidance`       | `sections/InterviewerGuidanceSection.tsx`                                                                                                                                        | i18n-2b   |
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

`shell` covers `editors/saveStageAction.tsx` as well as the shell itself,
rather than that control taking an area of its own: the fallback save button is
the shell's action slot standing in for a host that rendered none, so its words
are the shell's chrome like the refusals already declared there.

The `*Messages.ts` files are the homes for copy more than one module renders —
`extractMessages` throws when the same id is declared twice, so a shared string
has to have exactly one:

- `rules/ruleMessages.ts` — the date-resolution noun phrases (`ruleDescription.ts`
  and `RuleEditorDialog.tsx`), the rule-sentence subjects (`ruleDescription.ts`
  and `RulePreview.tsx`), and `ruleEditor.required` (`RuleEditorDialog.tsx` and
  `RuleValueField.tsx`).
- `resources/resourceMessages.ts` — every `resourceFailure.*` descriptor, so a
  gateway adapter author and a translator each read one list. The copy is
  produced by the gateway, its contract, `lifecycle.ts` and `references.ts`,
  and rendered by the pickers.
- `compound-edit/compoundRequestMessages.ts` — the refusals the session writes
  before sending a compound edit and a host writes again on receiving one,
  which is why `compoundEdit.request*` lives in neither module.
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

`controller.ts` renders no copy of its own, so the `session` area covers
`session.ts` alone until it does.

Two areas own the same sentence in two modules, and the sentence is declared
once: `form/arrayFields/crossClassPick.ts` re-exports the cross-class refusals
from `codebook/variableValidation.ts` rather than declaring
`arrayField.*ElsewhereRefusal` twins of them. The array field and the codebook
editor report the same conflict, so a translator answers once.

### Three rules the guards hold

**No component takes its words from a host.** A `copy?: Partial<…Copy>` prop of
plain strings is a hole a host drops English into: nothing extracts it, so it
never reaches `en.json`, the catalog guards or a translator, and the one place a
host bothered to customise is the one place that stays untranslated.
`src/__tests__/hostCopyOverrides.test.ts` scans the package's non-fixture source
for both shapes — a prop named `copy`/`overrides`/`words`/`labels`/`wording`
typed as a bare string or an inline bundle, and any `…Copy`/`…Confirm`/`…Words`
type holding a `string` or a `ReactNode`. A bundle a section still needs stays,
holding `MessageDescriptor`s: `SectionCapability.confirmClear` and
`ResourcePickerCopy` are what that looks like.

**Copy is never a JSX attribute string.**
`src/__tests__/copyInJsxAttributes.test.ts` scans the same source for a
copy-bearing prop (`label`, `placeholder`, `hint`, `title`, `description`,
`aria-label`, anything ending `Label`/`Message`/`Text`, …) whose value is a
string or a template literal. Nothing else in the repo can see this class:
`formatjs/no-literal-string-in-jsx` reads the words BETWEEN the tags, so a
module could be converted end to end by every other measure and still render
`label="Attribute name"` to a Spanish reader. Switching Storybook's Language
control to Español is what found 23 of them; the scan is what stops them coming
back. Template literals are included because that is the form an author reaches
for the moment a sentence needs a name in it — and the form that also loses the
sentence's word order to whatever English happens to do.

Both scans read the whole package rather than a list of converted directories,
and `src/__tests__/packageSource.ts` holds the one exclusion list they share. It
is empty: every directory this package has is inside the guards.

**A named descriptor prop is formatted with no values.** The sentences a family
hands `PromptsSection`, `FormFieldsSection`, `PageContentSection`,
`SubjectSection` and `SectionCapability.confirmClear` are `MessageDescriptor`s
the section formats with no arguments, so one carrying a placeholder renders
`{like this}` on screen. It cannot be said in the type system: `extractMessages`
only sees `defineMessages`, `defineMessages` widens `defaultMessage` to
`string`, and declaring these through a `const`-generic helper that kept the
literal would put every section sentence beyond extraction — a worse defect
than the one it guards. `sections/__tests__/namedDescriptorProps.test.tsx`
records it, and the locale sweep below fails on an unformatted placeholder
wherever one reaches the screen.

### Reserved — not yet converted

Named here so a later split takes the name rather than inventing a synonym.

| `<area>`                   | Will own the copy in                         | Expected in |
| -------------------------- | -------------------------------------------- | ----------- |
| `<area>`                   | Will own the copy in                         | Expected in |
| `nodePanels`               | `sections/NodePanelsSection`                 | family D    |
| `searchOptions`            | `sections/SearchOptionsSection`              | family D    |
| `alterLimits`              | `sections/AlterLimitsSection`                | family D    |
| `quickAdd`                 | `sections/QuickAddSection`                   | family D    |
| `sortOptions`              | `sections/SortOptionsSection`                | family D    |
| `nameGeneratorPrompts`     | `sections/NameGeneratorPromptsSection`       | family D    |
| `cardDisplay`              | `sections/CardDisplaySection`                | family D    |
| `externalDataSource`       | `sections/ExternalDataSourceSection`         | family D    |
| `censusPrompts`            | `sections/prompts/`                          | family E    |
| `removeAfterConsideration` | `sections/RemoveAfterConsiderationSection`   | family E    |
| `ordinalColor`             | `fields/OrdinalColorField`                   | family E    |
| `networkCanvas`            | `sections/network/`                          | family F    |
| `pedigree`                 | `sections/pedigree/`                         | family F    |
| `narrativePedigree`        | `sections/narrativePedigree/`                | family F    |
| `geospatial`               | `sections/geospatial/`, geospatial `fields/` | family F    |
| `anonymisation`            | `sections/anonymisation/`                    | family F    |

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
is the scan that keeps it that way, and it now covers these five directories:
its `NOT_CONVERTED_YET` exclusion named them while the conversion was in
flight and no longer does, so a section reintroducing a `copy?:` prop or a
string-bearing `…Copy` type fails there. `resources/` was the only other
exclusion; i18n-1b converted it too, so `NOT_CONVERTED_YET` now excludes
nothing.

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

## Negative tests: what a Spanish reader actually gets

Every locale test in this package used to be POSITIVE — name a Spanish sentence
and find it. A positive test says nothing about the words beside it, which is
how `'Cancel'` and `'Select an attribute…'` sat inside otherwise translated
dialogs: each was somebody else's file, and nobody's test named it.

`src/__tests__/localeSweep.test.tsx` asks the opposite question of a whole
rendered surface — three stages at rest, and the add, edit and remove dialogs.
`src/testing/localeSweep.ts` walks the document under `es` and reports four
things: an English `defaultMessage` whose Spanish differs, a run of fixed
English from INSIDE a message that also carries an ICU argument (the pattern is
never what a reader sees, so `Node color {index, number}` rebuilt by hand as
`` `Node color ${index + 1}` `` matches no whole message and was reported by
nothing), the raw `@codaco/app-i18n/error/v1:` prefix of an encoded message
nobody decoded, and an ICU argument nothing filled in.

One module, several callers. The same sweep is what
`src/form/__tests__/formLocale.test.tsx`,
`src/fields/__tests__/fieldsLocale.test.tsx`,
`src/codebook/__tests__/codebookLocale.test.tsx` and
`src/sections/__tests__/sectionsLocale.test.tsx` assert with, so every surface
in the package is read by one reading rather than four. What the researcher
wrote is built with `protocolStrings(…)`, which takes the documents the test
mounted — a harness's protocol snapshot, seeded fields and host codebook, or a
codebook editor's section document — rather than a harness, so a caller that
mounts no harness feeds it the same way.

Two things it deliberately does not report. **Protocol content**: a researcher's
own words are stored in the protocol and rendered to the participant verbatim,
and some of them read exactly like copy this package owns (a stage called
"Sociogram"), so the sweep reads the protocol document the harness is mounted
over and never reports a string it holds. **A string no descriptor has ever
stood behind**: the catalog is what it compares against, so a hardcoded literal
with no id is invisible to it — the JSX-attribute scan is the structural half,
and the two are meant to be read together.

The codebook editors are swept by `codebook/__tests__/codebookLocale.test.tsx`
rather than from the stage sweep: opening them from a section would report
whichever editor was open against whichever section opened it.

Each interface family adds its own sweep of whole EDITORS beside these, reached
through that family's registry. A section sweep cannot see what only
composition produces — a shell control no section test mounts, or one section
rendering English between two that do not.

Three rules those sweeps put on everything else in the package. Each was a real
defect, and each is the sweep reading something that is not a section's copy as
though it were:

- **A fixture's own words are declared, not renamed.**
  `sections/__tests__/rowFixtures.tsx` labels its stand-in prompt field
  `Prompt text`, and an interface family may well choose those same words for a
  real label — the sweep indexes by the English SENTENCE rather than by where it
  was rendered, so the fixture's stand-in gets reported under whichever id is
  spelled the same. The dialog sweeps name those labels in `fixtureWords`, which
  says "a fixture put this here" — the same claim `packageSource.ts` makes about
  a fixture FILE. Renaming the fixture's labels was tried on two branches and
  rejected: it moves the collision rather than removing it, the next family to
  pick those words is back where it started, and every test that reads a label
  back has to move with it.
- **The harness's stand-in controls say what the real ones say.**
  `testing/renderStageEditor.tsx` wrote its fallback submit button's label as
  the literal `'Save stage'`, which is `shell.saveStage`; it now reads that
  descriptor out of the same catalog the provider was given, so the button is
  Spanish on a Spanish surface and unchanged everywhere else.
- **Every section of the protocol is content, not just the stage on screen.** A
  section can show a researcher's words from anywhere in the protocol: a skip
  logic destination is named by the researcher's label for the stage it
  continues at, and a narrative pedigree lists its source stages by theirs. Both
  of those labels are also what this package calls the interface, so a sweep
  reading only the stage the harness seeded reported a researcher's own stage
  name as a translation defect. `protocolStrings` is handed the whole
  `protocolSections` snapshot for that reason.

An English sentence this package suggests is only protocol content when the
protocol holds it. `interface.sociogram` is "Sociogram", which is also what a
researcher calls the stage — because the package suggested it. Rendered where
the protocol does NOT hold it, it is a leak, and the sweep's own tests state
both halves.

One allowance, declared at the call site and an exact list rather than a filter,
because a sweep that quietly forgave anything would be a green tick over the
defect it exists to find:

- **`fixtureWords`** subtracts a fixture's own labels, as above. It is not a
  route around a real leak: a word listed there is one nothing in this package
  declares as copy, and the sweep still reports every id that does.

There was a second, `stillEnglish` — an unconverted area's leaks in full,
asserted as an EQUALITY so that landing the conversion broke the test and made
whoever converted it delete the entry. `src/resources` was what it was for, and
i18n-1b converted it, so the allowance went with it. Its discipline survives
where it is still needed, in the empty `NOT_CONVERTED_YET` of
`src/__tests__/packageSource.ts` and the expected-failure guard over it.

## Reading a story in another language

This package's Storybook carries the shared **Language** and **Direction**
toolbar controls from `@codaco/storybook-config` — the same ones
`@codaco/fresco-ui`'s Storybook mounts, wired here in
`.storybook/i18n.ts` and mounted as the preview's only decorator. Language
offers every `ecosystemLocales` entry plus the `en-XA` pseudo-locale, and the
decorator mounts an `AppI18nProvider` over `common.*`, `frescoUi.*` and
`protocolBuilder.*` merged in that host order, so a section renders the words
an app will actually show it. **It opens on `en` and stays there until somebody
changes it**: `en` has no catalog in any of the three, so every descriptor
renders its `defaultMessage` and the stories, their play functions and the
Chromatic captures are byte-for-byte what they were before the control existed
(the choice is remembered per browser, but never under Chromatic, Playwright or
any other automated host). Switching to Español is the cheapest way to see
whether a section is converted at all: a string that stays English there has no
descriptor behind it — the provider-less English fallback in `useAppIntl()`
makes an unconverted string and an untranslated one look identical until you
switch. A story's own hardcoded host copy stays English too, which is expected;
so is a play function that asserts an English literal failing when the language
is forced, since plays are written against the source locale. The URL form is
`?id=<story>&globals=appLocale:es`, and
`src/__tests__/storybookLocaleSwitcher.test.tsx` holds the wiring in place.
