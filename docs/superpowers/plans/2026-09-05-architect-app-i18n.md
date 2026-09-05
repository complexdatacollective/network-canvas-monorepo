# Architect application localization execution plan

Issue: #1616. Branch: `feat/architect-app-i18n`. Base at start:
`4c4789f59`. Shared prerequisites are owned by the orchestration branch and
must merge first; this PR owns Architect and its normal-lane app changeset.

The accepted 2026-09-04 app UI design and 2026-08-27 protocol localization
design govern the work. The user's amendment adds complete neutral Spanish
(`es`) alongside source English (`en`) and sparse British English (`en-GB`).
The existing app-i18n APIs, Studio implementation and PR #1651 were inspected.

## Acceptance matrix and surface inventory

This table records the current implementation status; the dated checkpoints
below preserve earlier results without promoting them to final evidence.

| Surface / acceptance area                                 | Implementation and evidence                                                                                                        | Status                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Device preference, browser best fit, English fallback     | Synchronous preference resolver; browser es-MX, persisted es/en-GB, automatic, cross-tab and rejected-storage tests                | Implemented; unit and production browser evidence pass                                                                                      |
| Accessible language setting                               | Shared LocaleSelect; automatic/autonyms; neutral save feedback is distinct from actual failed writes                               | First Codex finding corrected; cross-tab, pseudo-locale and genuine storage-failure regressions pass                                        |
| Root provider and document metadata                       | Main and preview shell providers, pre-restoration document lang/dir and boot status                                                | Implemented; startup-before-React and provider regression tests pass                                                                        |
| Research-data and participant-preview boundary            | Full preview plus inline ProtocolField use fixed English; inline popup container also belongs to English DOM                       | Authored prompt/label/response and parent sentinel preserved; actual scale-popup, provider and nested-form mutation evidence below          |
| Home, templates, open/import/download                     | Explicit researcher descriptors; authored sample content retained                                                                  | Implemented, including reactive migration-note caller; its shared presenter export awaits approved prerequisite integration                 |
| Navigation, history, updates, storage and locking         | Explicit app descriptors; queued copy resolves when rendered                                                                       | Implemented; native workflow and queued-dialog tests pass                                                                                   |
| Stage chooser, editors, forms, validation                 | Localized metadata and whole actionable guidance; stable schemas and failed submissions preserved                                  | Implemented; five exact shared repair-copy assertions await the later shared checkpoint                                                     |
| Codebook and resources                                    | Localized labels, counts, constraints and file guidance; filenames/IDs remain raw                                                  | Implemented; source census, upload and data-preservation evidence pass                                                                      |
| Printable summary and codebook                            | Localized labels, dates and quantities; map coordinates retain four decimals; loaded network attributes use locale list formatting | Earlier 11 PNGs reviewed; new list conjunctions and collation require a fresh integrated canonical run                                      |
| Errors, dialogs, tooltips, accessible names, non-JSX copy | useAppIntl/AppMessage/AppErrorMessage; bounded SPA bridge for four imperative consumers                                            | Implemented; current-state and mutation evidence below                                                                                      |
| Catalogs and ecosystem locale subset                      | 1,827 architect IDs, complete es, 28 sparse en-GB; explicit en/en-GB/es registry and shared catalogs                               | Extracted, independently AI-reviewed; freshness/ICU/parity guards pass                                                                      |
| Development pseudo-locale                                 | Development-only registry option; never persisted as a production preference                                                       | Implemented; production registry and invalid-preference tests pass                                                                          |
| Types, lint, Knip, units, Storybook, native/build         | Current correction: 2,496 units pass, six known dependency failures, three existing todo; focused 21/21                            | Shared integration still blocks final types/build/native/canonical/Storybook gates; earlier runnable checkpoints remain historical evidence |
| Visual baselines                                          | Prior linux/amd64 captures adopted 11 reviewed PNGs; other 17 PNGs and all 19 JSONs retained                                       | Prior repeated 47-file captures do not cover the new printed-list/collation correction; rerun after integration                             |
| Changeset, commit, PR and clean current-head review       | User-attributed 86aecd19299517386de51b372e6eded6f85e10c9 pushed; ready PR #1705 targets the shared branch                          | First current-head Codex review completed with two confirmed P2 findings; coherent fixes await lead review, push and a new review           |

## Deliberate scope boundaries

- Protocol-authored labels, variable names, participant content and bundled
  sample protocol data retain their authored text. Locale changes never write
  protocol content, research data, enum values, paths or identifiers.
- Participant runtime chrome is #1313. The Architect preview inherits its own
  English runtime boundary until protocol-locale delivery lands; the popup's
  preparation/failure/finished screens remain Architect chrome.
- Developer diagnostics, source-editor JSON, URLs, product/brand names and
  file extensions remain literal where they identify technical data.
- The PWA manifest is static browser installation metadata; the running app
  and its complete locale catalogs are precached in its JS assets.

## Evidence and next action

- Read root CLAUDE.md and applicable UI/refactor/oracle/Architect E2E skills.
- Installed isolated locked dependencies with `pnpm install --frozen-lockfile
--ignore-scripts`; no cross-worktree source symlinks.
- First census: 489 non-test/non-story production TS/TSX source modules.
- Initial executable action was the whole-app source conversion. Current next
  actions and remaining integration gates are recorded at the end of this plan.

No implementation or verification item is marked complete without concrete
evidence below. Translation provenance and review findings will be recorded
before delivery.

### Implementation checkpoint — source audit and Spanish first pass

- Integrated shared prerequisite `847d42ce1` by normal fast-forward merge.
  `pnpm install --ignore-scripts --no-frozen-lockfile` (with `CI=true`)
  refreshed isolated dependencies; the lockfile change is only the Architect
  `@codaco/app-i18n` importer entry (three added lines).
- Root main and preview providers negotiate synchronously and expose a shared
  `LocaleSelect` settings dialog with automatic mode. The participant preview
  has an explicit English provider with `manageDocument={false}`; the outer
  application provider owns the document language and direction.
- Formatting metadata is explicit descriptor data consumed with an injected
  `IntlShape` via app-only `formatConfig`. React consumers subscribe to
  `useAppIntl`; translated memoized lists depend on `intl`. Validation labels
  no longer use a locale-insensitive module cache. The date-resolution options
  now derive from formatted metadata at render rather than interpolating a
  descriptor object at module initialization.
- `i18n:extract` produced 1,417 app messages at the first Spanish checkpoint.
  Every entry was translated into neutral Spanish (1,245 distinct messages).
  `checkFullLocale(en, es)` returned `[]`, proving complete keys and matching
  ICU arguments/tags at this checkpoint. This proves catalog parity, not
  complete source coverage or linguistic review. Source audit continues.
- Translation provenance: manually authored first-pass Spanish in this task;
  independent review requested from the orchestrator against fixed snapshots
  `/private/tmp/architect-translation-source-en.json` and
  `/private/tmp/architect-es-review-snapshot.json`. Glossary: atributo, nodo,
  vínculo, diccionario de datos, protocolo, etapa; alter/alteri retain the
  established research terms. Translation changes from review will be recorded.
- A refreshed non-JSX census identified 369 remaining candidates across 114
  files, including intentional technical tokens. Concrete next action: finish
  utility announcements, lock/import error descriptors, summary table metadata,
  source literal and grammar checks, then run the complete verification gates.
- No tests, production build, browser workflows, baseline adoption, changeset,
  commit, or shipping gate is claimed complete at this checkpoint.

### Integration checkpoint — 2026-09-05, shared `fd9b7de4f`

- Merged all shared prerequisites normally through `fd9b7de4f`; no shared source
  is edited by this app branch. The isolated lockfile remains an additive app
  importer update. Source-first links stay within this worktree.
- The second frozen linguistic checkpoint contains 1,793 app IDs with complete
  Spanish, plus 28 reviewed en-GB spelling overrides. The initial Spanish was
  manually authored; an independent AI review by the orchestrator and the
  Interviewer agent covered all first-pass distinct messages. The latest delta
  is under a separate review. Corrections include tú voice with contextual
  third-person exceptions, álter/álteres, whole count plurals, inclusive maximum
  guidance, and whole field-preview badges with translated type/control names.
- Actual optimized PWA build passed (`VITE_DISABLE_ANALYTICS=true
VITE_DISABLE_ANIMATIONS=true pnpm --config.verify-deps-before-run=false
--filter @codaco/architect build`), including offline integrity/lease/cache
  validation and 99 precache entries. Later source changes require a final build.
- Initial full unit suite: 2,353 passed, 117 failed, 3 todo in 278 files. Failures
  are being repaired, not accepted as baselines. The focused catalog/provider/
  rule-preview/content-draft group subsequently passed 72 tests in 5 files.
- Real regressions caught and repaired: the rule preview's presence sentence
  lost its no-wrap group, and accessible attribute type labels changed case.
- The independent queued-dialog test repair covers 135 passing tests in 11
  files. Assertions render actual ReactNode content rather than inspecting
  descriptor shape. Temporarily replacing its render helper with empty output
  failed seven positive guidance/guard assertions, then the helper was restored.
  Final targeted results are recorded in `/private/tmp/architect-queued-tests-first.log`,
  `/private/tmp/architect-queued-render-mutation-red.log`, and
  `/private/tmp/architect-queued-api-key-green.log`.
- Synchronous startup and Redux-only formatting use the app's bounded
  `i18n/imperative.ts` bridge, initialized with device/browser negotiation. Only
  the researcher provider installs the current formatter. Queued copy uses
  AppMessage; participant preview never installs a formatter. Current bridge
  consumers: `ducks/restoreActiveProtocol.ts`, `ducks/modules/userActions/` and
  `ducks/modules/protocol/assetManifest.ts`. Exact final call-site census and
  startup-before-mount / post-switch-thunk regression proofs remain required.
- Stored form-result errors are being migrated to shared createMessageError;
  shared FormErrors/FieldErrors/DialogProvider resolve their descriptor at
  display time. This preserves the failed state while the locale changes.
- Technical data exceptions from the census: code paths and statuses, URLs,
  brand names, mathematical symbols, authored protocol/sample content,
  the participant preview's English boundary, and exact icon-library identifier
  names. These are not locale-dependent researcher prose.
- Next executable action: finish stored-error/call-site audit and remaining
  unit contract corrections; run current extraction/ICU checks, types/lint/Knip,
  build, Spanish workflow and regression tests, native E2E and canonical visual
  checks. No visual baseline has been adopted, and no commit/PR is claimed yet.

### Final source and seam census — 2026-09-05

The final AST pass inspected 495 production TS/TSX modules (tests, stories,
compiled catalogs and bundled authored templates excluded). Unlike the first
pass, it visits string-valued object properties, JSX props/text, templates and
single-word capitalized candidates. It excludes complete defineMessages calls,
imports and types. A separate FormatJS guard covers literal JSX plus custom
label/placeholder/title/itemLabel props and the built-in ARIA/image props.
Catalog extraction does not establish source coverage by itself.

The final pass left 301 candidates, individually disposed below. Concrete
omissions repaired by the broader census: 18 array-label callers, required and
duplicate-pick error objects, framing choices, six demo subtitles, resource
metadata including the network fallback, library info columns and stored count/
date values, boot document metadata, and whole storage/gallery/content-type
messages. TypeEditor shape-mapping submit errors now use createMessageError.
Ordinary local validation remains reactive through useField's locale rerun;
submitted refusals retain descriptors and are decoded without clearing failure.

App-only imperative bridge consumers (no other production consumer):

- ducks/restoreActiveProtocol.ts: startup admission before the React root.
- ducks/modules/userActions/userActions.ts: import, migrate, restore and missing
  library entry thunks. UI results carry descriptors as well as immediate text.
- ducks/modules/protocol/assetManifest.ts: resource import and ownership refusal.
- i18n/documentMetadata.tsx: synchronous initial document language/direction,
  preview title, and accessible boot status before asynchronous restoration.

Only ArchitectI18nProvider installs the bridge formatter. Its initial formatter
uses device/browser negotiation synchronously. Preview's participant provider
never installs it. Startup-before-React and post-switch actual Redux refusal
regressions pass; the latter also checks serialized protocol identity.

formatConfig is an explicit descriptor walker used at 35 presentation sites.
Its rendering consumers subscribe to useAppIntl; memo dependencies include intl.
There is no English-source-string lookup or translated module-level getter map.
Stable interface types, variable types, categories/tags, IDs, authored labels and
protocol fields retain their original literals. interfaceDisplayName and shared
validation descriptors own package-defined labels.

The itemLabelMessage seam is app-only. Its 18 production callers are
EditableAttributesList (two), Form, FamilyPedigree NodeConfiguration,
FamilyPedigree NominationPrompts and IntroScreen, NarrativePedigree Diseases,
NarrativePresets, ContentGrid, and the CategoricalBin, OrdinalBin, Geospatial,
Sociogram, TieStrengthCensus, OneToManyDyadCensus, DyadCensus,
NameGeneratorRoster and NameGenerator prompt lists. Nouns retain their
MessageDescriptor into queued confirmations; raw itemLabel strings remain raw
data for compatible callers. Row controls resolve through their subscribed
context. The open-row removal test proves EN→ES noun/title/body/button updates,
Cancel preserves the authored row, and confirmed removal emits the empty array.
A mutation capturing the already-formatted noun fails that positive oracle.

#### Remaining source candidates and their disposition

Paths below are relative to apps/architect. Line positions refer to the audited
formatted source snapshot and can shift with later formatting.

| Source                                                                      | Candidate                                                                                                               | Disposition                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/analytics.ts:12`                                                       | ArchitectWeb                                                                                                            | Product, platform, or analytics identifier.                                                                                     |
| `src/analytics.ts:13`                                                       | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                     |
| `src/components/AppUpdate/AppUpdatePill.tsx:33`                             | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                     |
| `src/components/AppUpdate/AppUpdateProvider.tsx:27`                         | useAppUpdateContext must be used within AppUpdateProvider                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/AssetBrowser/AssetCard.tsx:368`                             | data-current:border-primary data-focused:border-primary data-selected:border-primary data-selected:bg-selected          | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Assets/Table.tsx:117`                                       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Assets/withAssetUrl.tsx:53`                                 | Failed to load asset blob URL                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Assets/withAssetUrl.tsx:71`                                 | \`withAssetUrl(${WrappedComponent.displayName \|\| WrappedComponent.name})\`                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/BackgroundLights.tsx:19`                                    | color-mix(in oklab, oklch(var(--sea-green)), transparent 55%)                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BackgroundLights.tsx:23`                                    | color-mix(in oklab, oklch(10% 0.4 290), transparent 78%)                                                                | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BackgroundLights.tsx:27`                                    | color-mix(in oklab, oklch(var(--slate-blue)), transparent 60%)                                                          | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BackgroundLights.tsx:31`                                    | color-mix(in oklab, oklch(var(--sea-green)), transparent 70%)                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BackgroundLights.tsx:52`                                    | \`absolute ${position}\`                                                                                                | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BackgroundLights.tsx:54`                                    | \`radial-gradient(circle, ${color}, transparent 75%)\`                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/BooleanChoice.tsx:88`                                       | Yes                                                                                                                     | Persisted default participant answer labels; protocol-authored data.                                                            |
| `src/components/BooleanChoice.tsx:89`                                       | No                                                                                                                      | Persisted default participant answer labels; protocol-authored data.                                                            |
| `src/components/Brand.tsx:35`                                               | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                     |
| `src/components/Brand.tsx:73`                                               | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                     |
| `src/components/Codebook/EntityTypeDialog.tsx:226`                          | \`${entity}-${type ?? 'new'}-${openCount}\`                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/ExternalLink.tsx:33`                                        | noopener noreferrer                                                                                                     | Link security relation.                                                                                                         |
| `src/components/ExternalLink.tsx:46`                                        | noopener noreferrer                                                                                                     | Link security relation.                                                                                                         |
| `src/components/Form/Dropzone/Dropzone.tsx:93`                              | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/ColorPicker.tsx:111`                            | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/ColorPicker.tsx:112`                            | cursor-default opacity-70                                                                                               | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/ColorPicker.tsx:133`                            | outline-2 outline-offset-3                                                                                              | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/ColorPicker.tsx:134`                            | hover:outline-2 hover:outline-offset-2                                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/DataSource.tsx:115`                             | \`${name ?? 'dataSource'}-type\`                                                                                        | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:364`       | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                               |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:364`       | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                               |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:374`       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:413`       | data-focused:bg-surface-2 data-selected:bg-primary data-selected:text-primary-contrast                                  | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:414`       | data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-transparent                            | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/arrayFields/Attribute.tsx:123`                         | Attribute rows must be rendered inside AssignAttributes.                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Form/arrayFields/Attribute.tsx:239`                         | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Form/arrayFields/DialogArrayField.tsx:222`                  | \`${STAGE_FORM_ID}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor\`                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Form/arrayFields/DialogArrayField.tsx:360`                  | DialogArrayField renderers must be used inside the field.                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Form/arrayFields/MultiSelect.tsx:157`                       | MultiSelect rows must be rendered inside MultiSelect.                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Form/arrayFields/MultiSelect.tsx:182`                       | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Form/arrayFields/MultiSelect.tsx:215`                       | \`group ${MULTI_SELECT_RULE_CLASSES}\`                                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Form/arrayFields/Option.tsx:153`                            | Option rows must be rendered inside Options.                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Form/arrayFields/Option.tsx:186`                            | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Form/arrayFields/Option.tsx:318`                            | Escape                                                                                                                  | Native keyboard-event identifier.                                                                                               |
| `src/components/Home/Home.tsx:120`                                          | GitHub                                                                                                                  | Product, platform, or analytics identifier.                                                                                     |
| `src/components/Home/Home.tsx:205`                                          | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/Home.tsx:220`                                          | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/Home.tsx:327`                                          | noopener noreferrer                                                                                                     | Link security relation.                                                                                                         |
| `src/components/Home/LibraryPanel.tsx:442`                                  | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Home/LibraryPanel.tsx:468`                                  | LibraryPanel action failed                                                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Home/LibraryPanel.tsx:1050`                                 | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/LibraryPanel.tsx:1051`                                 | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/LibraryPanel.tsx:1063`                                 | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/LibraryPanel.tsx:1064`                                 | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                          |
| `src/components/Home/TransitMap.tsx:68`                                     | TIMELINE_SCRIPT is empty                                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Home/TransitMap.tsx:78`                                     | \`0 0 ${DESIGN_W} ${DESIGN_H}\`                                                                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Home/TransitMap.tsx:81`                                     | xMidYMid meet                                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/TransitMap.tsx:287`                                    | xMidYMid meet                                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:163`                                 | hsl(237 79% 67%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:169`                                 | hsl(342 77% 51%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:175`                                 | hsl(27 93% 54%)                                                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:181`                                 | hsl(103 46% 56%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:187`                                 | hsl(46 100% 47%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Home/timelineScript.ts:193`                                 | hsl(237 79% 67%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/InstallBanner.tsx:104`                                      | Mac                                                                                                                     | Product, platform, or analytics identifier.                                                                                     |
| `src/components/InstallBanner.tsx:105`                                      | Safari                                                                                                                  | Product, platform, or analytics identifier.                                                                                     |
| `src/components/Parameters/Parameters.tsx:18`                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Parameters/Parameters.tsx:19`                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/PreviewHost/PreviewHost.tsx:146`                            | This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards. | Participant-preview English boundary; explicit nested provider and lang=en.                                                     |
| `src/components/PreviewHost/PreviewHost.tsx:264`                            | Failed to build preview payload                                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/PreviewHost/previewRosterData.ts:51`                        | \`Could not resolve roster asset "${assetId}" for preview\`                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/PreviewHost/previewRosterData.ts:79`                        | Could not collect roster data for preview                                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/PreviewHost/useAssetResolver.ts:47`                         | \`Missing protocol scope for asset ${assetId}\`                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/PreviewHost/useAssetResolver.ts:65`                         | \`Asset ${assetId} not found in local store\`                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/PreviewHost/useAssetResolver.ts:73`                         | \`Preview closed before asset ${assetId} finished loading\`                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/ProjectNav/ActionToolbar.tsx:116`                           | useActionToolbar must be used inside ActionToolbarProvider.                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/ProjectNav/ActionToolbar.tsx:130`                           | calc(100% + 1.25rem)                                                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/ProjectNav/NavShell.tsx:161`                                | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/ProtocolInfoCard.tsx:198`                                   | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/ProtocolInfoCard.tsx:382`                                   | Network Canvas Protocol                                                                                                 | Deterministic decorative Pattern seed, aria-hidden.                                                                             |
| `src/components/ProtocolInfoCard.tsx:433`                                   | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Query/Rules/PreviewRules.tsx:49`                            | Rule list parts must render inside a rule list.                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Query/Rules/PreviewRules.tsx:119`                           | \`${editActionId} ${textId}\`                                                                                           | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Query/Rules/PreviewRules.tsx:128`                           | \`${deleteActionId} ${textId}\`                                                                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Query/Rules/PreviewText.tsx:276`                            | \`${typeof item}-${String(item)}-${index}\`                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Query/Rules/RuleEditor.tsx:301`                             | ALTER/VARIABLE                                                                                                          | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                |
| `src/components/Query/Rules/RuleEditor.tsx:302`                             | ALTER/TYPE                                                                                                              | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                |
| `src/components/Screens/NewStageScreen/Interface.tsx:46`                    | \`${interfaceType} definition not found\`                                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Screens/NewStageScreen/Interface.tsx:76`                    | \`${descriptionId} ${tagsId}\`                                                                                          | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Screens/NewStageScreen/Interface.tsx:99`                    | \`mb-2 ${highlighted ? 'text-white' : ''}\`                                                                             | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Screens/NewStageScreen/Interface.tsx:105`                   | \`mb-3 ${highlighted ? 'text-white' : ''}\`                                                                             | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:144`              | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:210`              | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                               |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:210`              | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                               |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:225`              | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:233`              | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                               |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:238`              | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                               |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:146`             | Name and Edge Generators                                                                                                | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:147`             | Sociograms                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:148`             | Name and Edge Interpreters                                                                                              | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:149`             | Utilities                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:153`             | Create nodes                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:154`             | Create edges                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:155`             | Capture Ego data                                                                                                        | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:156`             | Capture Node Attributes                                                                                                 | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:157`             | Capture Edge Attributes                                                                                                 | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:158`             | Use Roster Data                                                                                                         | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:159`             | Display Media                                                                                                           | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:160`             | Display Data                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:236`             | NameGenerator                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:237`             | NameGeneratorQuickAdd                                                                                                   | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:238`             | NameGeneratorRoster                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:239`             | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:240`             | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:241`             | DyadCensus                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:242`             | OneToManyDyadCensus                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:243`             | TieStrengthCensus                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:244`             | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:245`             | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:246`             | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:247`             | OrdinalBin                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:248`             | CategoricalBin                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:249`             | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:250`             | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:251`             | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:252`             | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:253`             | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:254`             | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:285`             | namegenerator name generator form attributes nodes node roster                                                          | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:286`             | NameGenerator                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:293`             | namegenerator name generator quick add simple easy nodes node create roster                                             | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:294`             | NameGeneratorQuickAdd                                                                                                   | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:301`             | namegenerator name generator search add import list filter roster nodes node csv create                                 | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:302`             | NameGeneratorRoster                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:316`             | family pedigree tree census namegenerator name generator nodes node edges edge                                          | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:317`             | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:325`             | narrative pedigree disease visualize visualise genetics inheritance focal hereditary                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:326`             | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:332`             | edge tie generator edges create add                                                                                     | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:333`             | DyadCensus                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:339`             | edge tie generator edges create add                                                                                     | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:340`             | OneToManyDyadCensus                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:346`             | edge tie generator census dyad edges create strength ordinal                                                            | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:347`             | TieStrengthCensus                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:353`             | sociogram visual edges highlight visualize visualise                                                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:354`             | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:366`             | network composer sociogram free form notepad build construct nodes edges attributes single screen                       | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:367`             | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:374`             | sociogram narrative visual visualize highlight community qualitative                                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:375`             | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:381`             | ordinal bin node attributes categorical name interpreter                                                                | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:382`             | OrdinalBin                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:388`             | categorical bin node attributes name interpreter                                                                        | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:389`             | CategoricalBin                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:395`             | alter attributes node interpreter form forms                                                                            | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:396`             | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:402`             | alter attributes node interpreter map                                                                                   | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:403`             | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:409`             | edge attributes form forms edge interpreter                                                                             | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                  |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:410`             | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:416`             | ego survey participant form forms                                                                                       | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:417`             | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:424`             | instruction text participant guide intro image video audio media resource                                               | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:425`             | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:432`             | instruction text participant guide intro image video audio media resource                                               | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:433`             | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:454`             | \`${definition.keywords} ${definition.tags.map((tag) => interfaceTagLabel(tag, intl)).join(' ')}\`                      | Supplemental English search aliases; search also includes localized title, description and tag labels.                          |
| `src/components/StageEditor/Interfaces.tsx:313`                             | \`Unknown interface type: "${interfaceType}". Valid types are: ${Object.keys(INTERFACE_CONFIGS).join(', ')}\`           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/StageEditor/StageEditor.tsx:237`                            | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/StageEditor/StageFormBridge.tsx:162`                        | StageFormBridge must be rendered inside a FormStoreProvider                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/StageEditor/requireStageFieldValue.ts:26`                   | Stage field values must satisfy the form contract.                                                                      | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/StageEditor/stageFormContext.ts:75`                         | useStageFormContext must be used within a StageForm                                                                     | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/components/Tag.tsx:29`                                                 | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Tag.tsx:30`                                                 | focusable cursor-pointer                                                                                                | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Timeline/Timeline.tsx:232`                                  | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/Timeline/Timeline.tsx:423`                                  | inset(0 0 100% 0)                                                                                                       | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Timeline/Timeline.tsx:424`                                  | inset(0 0 0% 0)                                                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/TypeEditor/ShapeVariableMapping.tsx:467`                    | \`${ITEM_ROW_CLASSES} pointer-events-none select-none\`                                                                 | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Validations/ValidationRule.tsx:64`                          | \`${MULTI_SELECT_RULE_CLASSES} ${ROW_BASE}\`                                                                            | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/Validations/ValidationRule.tsx:97`                          | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/Validations/Validations.tsx:665`                            | \`${scopeId ?? ''}\|${currentVariableId ?? ''}\|${variableType ?? ''}\|${entity ?? ''}\`                                | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/Validations/contradictions.ts:57`                           | this attribute                                                                                                          | Temporary analyzer record fallback only; presentation receives original names or nested thisAttribute descriptor.               |
| `src/components/VariablePill.tsx:136`                                       | \`${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark\`                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/VariablePill.tsx:360`                                       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                               |
| `src/components/VariablePill.tsx:409`                                       | \`${Math.min(initialPillWidth, targetPillWidth)}px\`                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/VariablePill.tsx:410`                                       | \`${Math.max(initialPillWidth, targetPillWidth)}px\`                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/components/VariableRoleConflictsAlert.tsx:97`                          | \`${conflict.subject.entity}:${conflict.subject.type ?? ''}:${conflict.variableId}\`                                    | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/enhancers/withDisabledSubjectRequired.tsx:23`               | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/enhancers/withDisabledSubjectRequired.tsx:28`               | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Background/Background.tsx:145`                     | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Background/Background.tsx:146`                     | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Background/Background.tsx:147`                     | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/Form.tsx:123`                                 | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/Form.tsx:124`                                 | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/Form.tsx:125`                                 | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/Form.tsx:138`                                 | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/Form.tsx:141`                                 | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/composerHelpers.ts:160`                       | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/Form/composerHelpers.ts:204`                       | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/MapOptions.tsx:246`                                | Map Options Mapbox Key                                                                                                  | Empty data-name compatibility seam; no text or accessible name.                                                                 |
| `src/components/sections/MapOptions.tsx:275`                                | Layer data-source                                                                                                       | Empty data-name compatibility seam; no text or accessible name.                                                                 |
| `src/components/sections/NarrativePedigree/Diseases.tsx:110`                | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/NarrativePedigree/SourceStage.tsx:69`              | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/components/sections/NodePanels/usePanelSlot.ts:41`                     | \`panels[${committedIndex ?? index}]\`                                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx:116` | create edges                                                                                                            | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                |
| `src/components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx:117` | highlight attributes                                                                                                    | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                |
| `src/config/variables.ts:342`                                               | Text                                                                                                                    | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:344`                                               | TextInput                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:348`                                               | TextArea                                                                                                                | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:350`                                               | TextArea                                                                                                                | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:354`                                               | Number                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:356`                                               | NumberInput                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:360`                                               | CheckboxGroup                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:362`                                               | CheckboxGroup                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:366`                                               | Toggle                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:368`                                               | Toggle                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:372`                                               | RadioGroup                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:374`                                               | RadioGroup                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:378`                                               | ToggleButtonGroup                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:380`                                               | ToggleButtonGroup                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:384`                                               | LikertScale                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:386`                                               | LikertScale                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:390`                                               | VisualAnalogScale                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:392`                                               | VisualAnalogScale                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:396`                                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:398`                                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:402`                                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:404`                                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:408`                                               | Boolean                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:410`                                               | BooleanChoice                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/config/variables.ts:572`                                               | \`${type ?? ''}.icon\`                                                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/ducks/middleware/protocolLibraryListener.ts:80`                        | Protocol library commit failed                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/middleware/protocolValidationListener.ts:230`                    | \`Protocol validation could not be completed: ${ typeof error === 'string' ? error : ensureError(error).message }\`     | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/modules/protocol/assetManifest.ts:91`                            | Check that it is a supported file type, and try again.                                                                  | Legacy error contract; AutoFileDrop always supplies the localized generic descriptor alongside it.                              |
| `src/ducks/modules/protocol/assetManifest.ts:214`                           | \`Unsupported asset type for file: ${file.name}\`                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/modules/protocol/codebook.ts:422`                                | Type must be specified for non ego nodes                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/modules/protocol/codebook.ts:448`                                | Type must be specified for non ego nodes                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/modules/protocol/stages.ts:43`                                   | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/ducks/modules/protocol/stages.ts:114`                                  | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/ducks/modules/protocol/stages.ts:125`                                  | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                      |
| `src/ducks/modules/protocolValidation.ts:29`                                | Validation failed                                                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/modules/userActions/userActions.ts:612`                          | No active protocol to export                                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/ducks/restoreActiveProtocol.ts:203`                                    | Session state restoration timed out; using a fresh session.                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/hooks/useJsonPreview.ts:56`                                            | KeyJ                                                                                                                    | Native keyboard-event identifier.                                                                                               |
| `src/hooks/useJsonPreview.ts:61`                                            | Escape                                                                                                                  | Native keyboard-event identifier.                                                                                               |
| `src/hooks/useStageEditorKeyboard.ts:43`                                    | KeyZ                                                                                                                    | Native keyboard-event identifier.                                                                                               |
| `src/hooks/useStageEditorKeyboard.ts:49`                                    | KeyZ                                                                                                                    | Native keyboard-event identifier.                                                                                               |
| `src/hooks/useStageEditorKeyboard.ts:55`                                    | KeyY                                                                                                                    | Native keyboard-event identifier.                                                                                               |
| `src/i18n/documentMetadata.tsx:26`                                          | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                     |
| `src/i18n/locales.ts:9`                                                     | English                                                                                                                 | Autonym, rendered with the named language; stable locale tag.                                                                   |
| `src/i18n/locales.ts:10`                                                    | English (UK)                                                                                                            | Autonym, rendered with the named language; stable locale tag.                                                                   |
| `src/i18n/locales.ts:11`                                                    | Español                                                                                                                 | Autonym, rendered with the named language; stable locale tag.                                                                   |
| `src/lib/ProtocolSummary/components/Contents.tsx:82`                        | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/lib/ProtocolSummary/components/Contents.tsx:98`                        | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/lib/ProtocolSummary/components/Contents.tsx:136`                       | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/lib/ProtocolSummary/components/Cover.tsx:62`                           | Network Canvas                                                                                                          | Product, platform, or analytics identifier.                                                                                     |
| `src/lib/ProtocolSummary/components/Entity.tsx:25`                          | \`entity-${type ?? ''}\`                                                                                                | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/lib/ProtocolSummary/components/ProtocolCard.tsx:94`                    | wrap-break-word hyphens-auto                                                                                            | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/lib/ProtocolSummary/components/SummaryContext.tsx:22`                  | Untitled Protocol                                                                                                       | Provider-optional default; app SummaryPage always supplies the authored protocol name.                                          |
| `src/lib/ProtocolSummary/components/useAssetData.tsx:71`                    | Failed to load asset blob URL                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/main.tsx:92`                                                           | Root container #root not found                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/main.tsx:141`                                                          | (prefers-reduced-motion: reduce)                                                                                        | Database, error-class, or browser capability identifier.                                                                        |
| `src/preview-main.tsx:28`                                                   | Root container #root not found                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/assetDB.ts:39`                                                   | ArchitectProtocolDB                                                                                                     | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/assetDB.ts:45`                                                   | id, protocolId                                                                                                          | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/assetDB.ts:46`                                                   | id, updatedAt                                                                                                           | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/assetNames.ts:65`                                                | \`${stem} (${counter})${extension}\`                                                                                    | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/assetUtils.ts:26`                                                | Cannot save asset: no active protocol scope                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/assetUtils.ts:47`                                                | Cannot save asset: no active protocol scope                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/assetUtils.ts:67`                                                | Cannot save assets: no active protocol scope                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/bundleProtocol.ts:194`                                           | \`${(protocolName ?? 'protocol').replace(/\s+/g, '_')}-${timestamp}.netcanvas\`                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/bundleProtocol.ts:208`                                           | \`Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}\`                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/bundleProtocol.ts:208`                                           | Unknown error                                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/fileLaunchQueue.ts:56`                                           | Failed to read launched file                                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/fileLaunchQueue.ts:69`                                           | Failed to handle launched files                                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/installPrompt.ts:50`                                             | (display-mode: standalone)                                                                                              | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/netcanvasSizeGuard.ts:54`                                        | NetcanvasTooLargeError                                                                                                  | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/protocolImportErrors.ts:62`                                      | Architect could not open this protocol.                                                                                 | Legacy fallback selector/diagnostic; describeImportFailure returns a localized descriptor for UI.                               |
| `src/utils/protocolImportErrors.ts:66`                                      | Architect could not open this template.                                                                                 | Legacy fallback selector/diagnostic; describeImportFailure returns a localized descriptor for UI.                               |
| `src/utils/protocolImportErrors.ts:98`                                      | \`Caused by: ${asError.message}\`                                                                                       | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/protocolLibrary.ts:69`                                           | Failed to remove orphaned assets during save                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocolLibrary.ts:125`                                          | \`Protocol ${expected.id} disappeared during validation.\`                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocolLibrary.ts:134`                                          | \`Protocol ${expected.id} changed while it was being validated. Try opening it again.\`                                 | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/protocolLibrary.ts:142`                                          | \`Protocol ${expected.id} disappeared during validation.\`                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:40`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:55`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:59`                                      | Expected Blob data for CSV asset                                                                                        | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:90`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:156`                                     | This network file doesn't contain any nodes or edges.                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:180`                                     | That file type is not supported as a resource.                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:197`                                     | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/protocols/assetTools.ts:201`                                     | Expected Blob data for GeoJSON asset                                                                                    | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/pwa.ts:20`                                                       | \`(display-mode: ${mode})\`                                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/resolveProtocolColor.ts:24`                                      | \`Unsupported protocol color reference: ${name}\`                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |
| `src/utils/resolveProtocolColor.ts:26`                                      | \`--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}\`                                                 | Internal path, identity, filename, selector, or media query; preserve stable data.                                              |
| `src/utils/resolveProtocolColor.ts:28`                                      | \`oklch(from ${reference} calc(l - 0.05) c h)\`                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                             |
| `src/utils/storageErrors.ts:7`                                              | QuotaExceededError                                                                                                      | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/storageErrors.ts:8`                                              | InvalidStateError                                                                                                       | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/storageErrors.ts:9`                                              | SecurityError                                                                                                           | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/storageErrors.ts:15`                                             | DatabaseClosedError                                                                                                     | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/storageErrors.ts:16`                                             | OpenFailedError                                                                                                         | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/storageErrors.ts:17`                                             | VersionError                                                                                                            | Database, error-class, or browser capability identifier.                                                                        |
| `src/utils/validations.ts:371`                                              | Date value must be a string                                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable. |

### Current verification checkpoint — final app implementation

The source work is complete. The branch contains shared prerequisites through
375b2ea73 only; integration of the later verified prerequisite is held by the
orchestrator pending the existing approval. This is a draft delivery checkpoint,
not a claim that the app is ready to merge. No shared source was copied or edited.

- 1,827 active app descriptors; complete Spanish and 28 sparse en-GB overrides.
  The first 1,245 distinct pairs, the 698-message delta, subsequent 97/12
  corrections, and all final 32 census pairs were independently reviewed by
  the orchestrator and Interviewer agent. The adjacent removal-body pair and
  final contact-guidance tú correction were independently accepted. Translation
  was AI-authored and independently AI-reviewed; no professional human review
  is claimed. Fresh extraction and ICU/tag/argument parity pass.
- The source census above covers 495 production modules. The subsequently
  added ArchitectI18nRoot makes 496; it adds recovery composition without copy
  or DOM layout. The final dynamic-label follow-up converted all three raw
  printable asset-type presentations: Contents, AssetManifest and AssetBadge.
  Audio/video metadata now stores numeric duration and formats it when rendered.
  Researcher-authored asset names, IDs and protocol values remain exact.
- Main and preview entry points use ArchitectI18nRoot. The outer provider-free
  AppErrorBoundary alone owns recovery document lang/dir; the inner boundary
  leaves ownership with the mounted provider. A real provider-initialization
  throw reaches fallback/retry; a real inner error survives a language switch
  and retry without restoring stale document metadata. Removing outer recovery
  fails the startup test; restoring unconditional inner metadata cleanup fails
  the live-language test. Restored group: 3/3. Logs:
  /private/tmp/architect-root-recovery-mutation-red.log,
  /private/tmp/architect-root-recovery-restored-green.log,
  /private/tmp/architect-root-document-ownership-red.log and -green.log.
- A real printable-report test switches API key/resource labels and 12.5-second
  media metadata between English and Spanish while retaining authored values.
  Returning the raw asset type fails the text oracle; bypassing number formatting
  fails the Spanish duration oracle. Logs:
  /private/tmp/architect-print-resource-labels-mutation-red.log,
  /private/tmp/architect-print-resource-labels-restored-green.log,
  /private/tmp/architect-report-duration-mutation-red.log and -green.log.
- MigrationNotes in components/protocolOpenDialogs.tsx subscribes to useAppIntl
  and calls only the verified shared formatMigrationNotes(version, notes, intl).
  The real queued-dialog regression uses getMigrationInfo(4,5), checks actual
  whole Spanish bullets and literal schema keys, and preserves cancel/approve
  and unchanged input semantics. Raw Markdown fails that oracle:
  /private/tmp/architect-migration-notes-raw-red.log. The implemented caller's
  local test, types and build currently fail because the approved shared export
  is not integrated; no green result is claimed for this caller yet.
- Expanded source guard first found three numeric placeholders, now formatted
  with intl.formatNumber. A temporary itemLabel="prompt" mutation fails the
  actual FormatJS rule; restoration passes. Queued row-noun and provider-disabled
  mutations fail positive language assertions, restored groups pass. Evidence:
  /private/tmp/architect-item-label-guard-red.log and -green.log,
  /private/tmp/architect-row-noun-mutation-red.log and -green.log. The earlier
  empty queued-message renderer failed seven semantic assertions. Existing
  cancellation, refused-write, data-preservation and focus oracles were retained.
- The lead independently inspected NewStageScreen search: Fuse is rebuilt from
  getInterfaceTypes(intl), localized titles/descriptions/tag keywords are indexed,
  and selectedTags remain stable TAGS identities across language changes.

### Final deferred-callback and submitted-error census

Every memo/effect dependency warning from the final app lint was inspected for
intl/formatter/locale capture. No missing locale capture remains. The following
were the app-owned findings; unrelated existing warnings were left alone.

| Owner                                                                                                                                                 | Disposition                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProtocolGuardedRouter aroundNav and useProtocolNavGuard history effect                                                                                | Removed obsolete Intl arguments. Queued leave title/body and both action labels now render descriptors. Existing dispatch/navigation/history dependencies remain.                      |
| ProjectActions runDownload                                                                                                                            | Removed obsolete Intl argument; download helper emits queued descriptors only.                                                                                                         |
| StageDraftConflictDialog effect                                                                                                                       | Removed obsolete Intl argument, subscription and dependency; changing language updates the open queued dialog without tearing it down and asking again.                                |
| NameGeneratorPrompts/PromptFields validation                                                                                                          | completeAttributes now returns createMessageError; factory and caller no longer capture an Intl formatter.                                                                             |
| FamilyPedigree/NominationPrompts, FamilyPedigree/NodeConfiguration, NarrativePedigree/Diseases, sections/Form/Form, Validations, StageEditor onSubmit | Removed obsolete intl dependencies from callbacks already returning stable encoded errors. These callbacks retain every actual data dependency.                                        |
| Timeline delete callback                                                                                                                              | Removed obsolete intl dependency; queued nodes subscribe themselves, and the delayed deletion announcement reads intlRef.current.                                                      |
| ArchitectI18nProvider negotiation memo                                                                                                                | Retained browserRevision intentionally: a browser languagechange must renegotiate automatic mode even when the explicit preference is unchanged. The body documents that invalidation. |
| EdgeConfiguration handleFieldsChange                                                                                                                  | Existing warning concerns its live edgesRef, has no formatter/locale dependency, and is unrelated to localization.                                                                     |

The final helper call-site inventory is exhaustive:

- downloadActiveProtocol: useProtocolNavGuard, ProjectNav/ProjectActions and
  StageEditor/StageDraftConflictDialog (three production callers). All removed
  the obsolete formatter argument. Partial-export filenames are a shared
  locale-aware list at render time, preserving each raw filename.
- promptLeaveEditor: ProtocolGuardedRouter and the useProtocolNavGuard history
  handler (two production callers). Both keep dispatch/refusal/navigation logic.
- promptDiscardDraft: the one useProtocolNavGuard history handler.
- makeAssignAttributesValidation: NameGeneratorPrompts/PromptFields (one
  production caller); completeAttributes is exported for its direct unit oracles.
- Home's bundled-template failure uses an encoded title, so its already-queued
  generic title remains reactive with the existing localized body.

A real already-open leave dialog changes both actions from English to Spanish;
Cancel causes no dispatch/navigation, reopening and confirming leaves once.
A real incomplete-attribute submission retains its failed state and authored
value while its whole error changes language. Both failed before the correction
(2 failed, 3 passed) and all 86 tests in the six affected groups then passed on
Node 24.18.0. Logs: /private/tmp/architect-final-queued-refusals-red.log and
/private/tmp/architect-final-callbacks-green.log. Existing refusal and successful
export tests still assert their actual outcomes and rendered text.

### Canonical visual baseline disposition

All 11 intended PNG changes were directly reviewed and accepted by the lead:

- codebook.png: visible white language icon at the existing navigation height.
- summary-contents.png: whole-message stage-number glyph shaping and API Key
  heading; stage names and geometry unchanged.
- summary-ego.png and summary-entity-{family-edge,family-member,knows,person}.png:
  localized variable-type display labels with stable protocol types.
- summary-protocol-summary-document.png: locale-formatted date punctuation.
- summary-resource-library.png: API Key / GeoJSON display labels.
- summary-stage-geospatial-1.png and summary-stage-name-generator-roster-1.png:
  localized API key / GeoJSON / Network reference labels; authored names exact.

Canonical capture is pinned linux/amd64 Playwright Docker. Two successive
captures with the final deterministic fixture produced byte-identical results
for all 47 files: 28 PNGs and 19 JSONs. Logs:
/private/tmp/architect-canonical-pinned-first.log and -second.log. Comparing
against an archived, unchanged pre-app HEAD control with the same fixture
isolated exactly the 11 text/icon changes above:
/private/tmp/architect-pinned-app-control-diff.json. The remaining 17 PNGs and
all 19 JSONs retain their committed baselines. The final comparison without
writing snapshots passed 2/2:
/private/tmp/architect-canonical-no-write-green.log.

The controlled investigation explained all extra pixels before adoption.
Inherited SVG/gradient raster variation reproduced at pre-app HEAD. Separately,
actual currentSrc probes showed cache-dependent 320 versus 640 stage thumbnails
at identical 160.625-pixel displayed widths. The timeline's existing idle image
preload warms the larger candidate. The Contents element starts at y=-0.390625
and is 1035.765625 pixels high in both trees, so the rounded last PNG row includes
part of the next thumbnail; this explains its row-1036 difference too. Logs:
/private/tmp/architect-canonical-raster-app-probe.log and -base-probe.log.

The summary fixture now selects only an actually advertised srcset candidate
large enough for the displayed width, positively checks its existence, waits
for real decode/currentSrc and verifies one visible picture per protocol stage.
It leaves every actual thumbnail and its layout visible to the pixel assertion.
The same fixture runs in the control and app; no URL is synthesized and no image
is masked or replaced. All 16 inherited-only modified PNGs were restored before
the no-write verification. The lead accepted the mechanism, exact control
comparison and final images; no unexplained drift was adopted.

### Current gates and remaining action

- Last fully runnable optimized build (before adding the pending migration API
  caller) passed PWA integrity with 99 precache entries, 22 JS chunks and 69
  stage-preview assets. The canonical Docker build is the pinned Node runtime;
  earlier host commands included Node 26 and are historical evidence only.
- Earlier complete native suite: 169/169 without retries. The later complete
  native suite, including all four production Spanish workflows, exited zero
  with 168 passed and one flaky sample-protocol rule selection. Its serial retry
  passed, and a separate isolated rerun passed all 17 sample tests first attempt
  in 44.1 seconds. Logs: /private/tmp/architect-native-final.log,
  /private/tmp/architect-native-last-runnable.log and
  /private/tmp/architect-sample-recheck.log. The one failed attempt timed out on
  the Attribute option under Rule basis; the unchanged disabled predicate means
  no entity type was selected at that point. Its original trace was replaced by
  the following canonical runner, so the deeper cause is unproven. No force click,
  assertion weakening or speculative product change was made. The final
  migration caller and callback delta require a fresh integrated build/native run.
- The sticky-header drag-helper correction keeps persisted-order assertions and
  positively verifies the pointer hits the requested row. Both drag cases pass;
  the lead reviewed measured geometry and the correction. Logs:
  /private/tmp/architect-drag-diagnostic.log and
  /private/tmp/architect-drag-hit-target-green2.log.
- Manual observations before the Mac locked covered Spanish settings, persistence,
  required protocol field, all 19 interface chooser labels and Information/rich
  text editing. Later real headless production flows cover negotiation,
  authoring/required focus, preview boundary, resource upload and open metadata
  language changes. Manual access remains blocked by the locked Mac.
- Local Storybook passed 15/15 before the final caller; the later shared cold-cache
  optimizer correction is owned and verified by the prerequisite branch. Final
  integrated Storybook verification is still required.
- Final required commands now run explicitly with Node 24.18.0 from
  /Users/jmh629/.local/share/fnm/node-versions/v24.18.0/installation/bin and pnpm
  --config.verify-deps-before-run=false. Final gate results are recorded below. The known dependency failures remain visible, never skipped.
- Next action: freeze the final app-only source, catalog, reviewed baselines,
  changeset and this inventory; create a user-attributed commit and draft PR
  based on feat/app-i18n-spanish-prerequisites. After approved normal integration,
  rerun types, full units, optimized build, affected Storybook and the native
  production suite, resolve current-head review/CI, then report readiness. No
  merge or release is authorized.

Final Node 24.18.0 results for the frozen implementation:

| Gate                      | Actual result                                                                                                                                     | Log                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Full unit/scripts suite   | 2,479 passed, 6 failed, 3 pre-existing todo; 280/284 files passed. One uncaught error is the same missing migration-note function.                | /private/tmp/architect-node24-final-units.log     |
| App typecheck             | One error: the not-yet-integrated shared module has no formatMigrationNotes export.                                                               | /private/tmp/architect-node24-final-types.log     |
| E2E typecheck separately  | Passed.                                                                                                                                           | /private/tmp/architect-node24-final-e2e-types.log |
| Actual optimized build    | Failed at the same missing shared export under Node 24.18.0.                                                                                      | /private/tmp/architect-node24-final-build.log     |
| Type-aware app lint       | Passed, 0 errors; remaining locale-related warning is the documented browserRevision invalidation. Unrelated existing dependency warnings remain. | /private/tmp/architect-node24-final-lint.log      |
| App Knip                  | Passed.                                                                                                                                           | /private/tmp/architect-node24-final-knip.log      |
| Catalog extraction/guards | Fresh extraction; namespace, registry, sparse/full coverage and ICU parity tests passed in full suite.                                            | /private/tmp/architect-final-catalog-extract.log  |

The five shared-copy failures are three ComposerAttributeFields.behaviour tests,
one CategoricalBinPrompts/useOnBeforeSavePrompt test and one
TieStrengthCensusPrompts/useOnBeforeSavePrompt test. They expect the reviewed
shared disjointBounds sentence including "or input controls". The sixth is the
new migrationNotes test; its helper export exists on the verified prerequisite
branch. No test is skipped or weakened to hide these integration failures.
The final Home callback dependency cleanup removes an unused intl dependency
only; the targeted final lint verifies that no locale warning remains there.

### First PR review correction — 2026-09-05

PR #1705 is ready for review at user request and targets
`feat/app-i18n-spanish-prerequisites`. Its first reviewed head is
`86aecd19299517386de51b372e6eded6f85e10c9`, authored and committed by Joshua
Melville. The initial commit's 386 source hashes matched the lead-reviewed
freeze after hooks. The prerequisite remains locally integrated only through
`375b2ea73`; no later shared integration or PR merge has been performed.

Codex review 5122911135 and summary 5554555553 completed on that exact head.
Both P2 findings are verified and corrected in this round:

- `PRRT_kwDOKqiw4s6fmwSr` / comment 3941999191: LanguageSettings now renders
  local save feedback only when `saved !== null`. Cross-tab changes and the
  intentionally unpersisted development locale remain neutral. A blocked
  storage write still applies the selected language and announces the actual
  failure. The real dialog had two failures before correction and all three
  cases now pass; see `/private/tmp/architect-language-save-neutral-red.log`.
- `PRRT_kwDOKqiw4s6fmwSt` / comment 3941999193: the inline ProtocolField uses
  the same fixed-English provider pattern as the full preview, with
  `manageDocument={false}` and local `lang=en`/`dir=ltr`. Authored labels,
  questions, hints and responses remain raw. Only absent-label/question
  fallback descriptors use the explicit fixed-English formatter. The parent
  Architect heading, guidance and Check response action remain in the app
  language. The two descriptor descriptions now state that boundary clearly;
  their visible source/Spanish text did not change.
- Lead inspection extended the second fix to the actual portaled scale
  popup. The existing PortalContainerProvider is nested beneath the English
  DOM and React boundary; the outer ThemedRegion and researcher actions retain
  the app language. A real VisualAnalogScale keyboard interaction reproduced
  `lang=es` on the popup before this fix and passes with `lang=en` afterwards.
- A real parent sentinel and `useFormHasValue(['preview-value'], 'opaque')`
  prove the response stays in the nested preview form. Removing that Form
  fails four cases: the parent receives the preview field and/or submission,
  while the unchanged sentinel remains visible. The restored seven-case
  preview suite checks fallback copy, existing validation, authored
  prompt/label/response, parent state, and a real popup.

Relevant regression evidence:

| Regression / mutation             | Observed result                                                                         | Log                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Original inline preview           | Authored-preview fallback changed to Spanish after app switch; failure reproduced       | /private/tmp/architect-inline-preview-red.log                   |
| English provider removed          | Three tests fail on real Spanish field guidance/scale formatting                        | /private/tmp/architect-inline-preview-provider-mutation-red.log |
| Popup under outer container       | One failed, six passed; actual popup inherited document Spanish                         | /private/tmp/architect-inline-preview-portal-red.log            |
| English portal ownership restored | Seven passed                                                                            | /private/tmp/architect-inline-preview-portal-green.log          |
| Nested preview Form removed       | Four failed, three passed; opaque parent field ownership and submission assertions fail | /private/tmp/architect-preview-parent-boundary-mutation-red.log |
| Complete restored correction set  | 21 passed across six files, including strengthened parent sentinel checks               | /private/tmp/architect-review-round1-final-targeted.log         |

### Complete formatter and list call-site census

The final pass searched every production Architect source for `toFixed`,
`toLocale*`, `Intl.*`, `localeCompare` and `join`, and inspected each use.
`/private/tmp/architect-formatting-callsite-census.txt` records exact paths.
Build/test tooling and authored template data were separately classified;
none is silently treated as researcher copy.

| Surface / count                                                                  | Disposition                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapOptions: two coordinates and one zoom                                         | `intl.formatNumber`; coordinates always four fractional digits with no grouping. Whole coordinate descriptor uses `{latitude}, {longitude}` in English and `{latitude}; {longitude}` in Spanish, so decimal commas cannot be mistaken for the coordinate separator. Zoom retains up to 20 fractional digits, without changing stored numbers.                    |
| Assets/Table: one Intl.Collator constructor                                      | Collator follows `intl.locale`, retains numeric comparison and invalidates sorted rows when language changes. Chosen ascending/descending state and authored cells remain unchanged.                                                                                                                                                                             |
| Codebook/Variables: one localeCompare comparator, used by name and usage columns | Explicit current locale; a shallow data-identity refresh invalidates TanStack's row cache, which otherwise ignores comparator changes. Original row objects and the researcher's chosen direction survive. The narrow exhaustive-deps suppression documents that intentionally additional locale dependency; comparator-only red evidence proves it is required. |
| Codebook/helpers sortByLabel: two production callers                             | Injected IntlShape at the codebook usage selector and VariableSpotlight; the latter also invalidates its memo when locale changes. Provider-optional callers retain explicit English.                                                                                                                                                                            |
| Form/helpers toSelectOptions: one production caller                              | VariableDefinitionFields passes intl. Sorting follows the selected locale only within groups or within a flat lookup; authored group order and unsorted new-variable progression remain unchanged.                                                                                                                                                               |
| Partial exports: all three presentation paths                                    | LibraryPanel and StorageUnavailableBanner now match downloadActiveProtocol's late descriptor list values. An already-open warning switches English conjunctions to Spanish without changing filenames or exporting twice.                                                                                                                                        |
| Dropzone: both rejection branches, two lists each                                | Rejected and supported extensions remain raw list items until AppErrorMessage renders. Library-level and additional-extension refusals remain live through a language switch; supported uploads still succeed afterwards.                                                                                                                                        |
| Printable network attributes: useAssetData, one Asset consumer                   | Keep loaded raw CSV header names as an array; render with intl.formatList in Asset. Memoize the existing asset-variable reader so loading an array does not trigger repeated state reads. Names and source files are unchanged.                                                                                                                                  |
| Already-correct toLocale calls: three                                            | VariablePill and Query/Rules/PreviewText pass intl.locale to case conversion; LibraryPanel constructs its Luxon DateTime with intl.locale before its one toLocaleString call.                                                                                                                                                                                    |
| Intl.Segmenter: one constructor                                                  | Deliberately unchanged Unicode grapheme counting for validation; it is neither display formatting nor a language-dependent authored length rule.                                                                                                                                                                                                                 |
| Dot-path joins: four                                                             | Three selectors/indexes paths and one ProtocolSummary/helper path identify schema locations and remain stable.                                                                                                                                                                                                                                                   |
| Analytics joins: two                                                             | userActions and analyticsListener serialize technical error paths for telemetry.                                                                                                                                                                                                                                                                                 |
| Diagnostic joins: three                                                          | protocolImportErrors and ProjectActions build explicitly labelled technical details; StageEditor/Interfaces constructs a developer exception for an unsupported stable interface type. Localized primary guidance remains separate.                                                                                                                              |
| React/signature joins: six                                                       | PreviewHost conflict key; Validations field-error signature; three contradiction identity fragments; NodePanels registration signature. None is rendered as prose.                                                                                                                                                                                               |
| Codebook usageString join: one                                                   | Internal uppercase sort/filter accessor only; the visible cell renders individual UsageColumn entries.                                                                                                                                                                                                                                                           |
| NewStageScreen keyword join: one                                                 | Localized search index terms, rebuilt with intl; selected tag identifiers remain stable.                                                                                                                                                                                                                                                                         |
| Dataset cell join: one                                                           | Existing raw array-cell preview representation, without researcher-language grammar.                                                                                                                                                                                                                                                                             |
| Vite configuration join: one outside src                                         | Content-Security-Policy directives, kept as technical syntax.                                                                                                                                                                                                                                                                                                    |

No production `toFixed` remains. All three current `localeCompare` calls
receive the selected locale. No unclassified user-facing sentence/list join
remains. The 18 retained production joins are the explicit data, identity,
search and diagnostic exceptions above.

Formatter regression evidence includes:

- `/private/tmp/architect-formatting-census-red.log`: map punctuation/number
  formatting and resource collation failed before correction.
- `/private/tmp/architect-export-lists-red.log`: library and unsaved partial
  export lists failed while the already-correct active export passed.
- `/private/tmp/architect-collation-related-red.log` and
  `/private/tmp/architect-collation-comparator-only-red.log`: codebook cache
  invalidation requires more than changing the comparator.
- `/private/tmp/architect-dropzone-list-mutation-red.log`: both rejection
  branches fail when supported extensions are prejoined.
- `/private/tmp/architect-table-numeric-mutation-red.log`: the real resource
  table fails when numeric collation is disabled (`ñandú2`/`ñandú10`).
- The new printable attribute-list regression failed against the original
  comma-only string in `/private/tmp/architect-review-round1-red.log`. The
  corrected English and Spanish list tests preserve every source header.

The final catalog delta is
`/private/tmp/architect-review-round1-catalog-delta.json`: one visible Map
coordinate pair (lead AI reviewed) and two corrected participant-fallback
metadata descriptions. Catalog size remains 1,827 English and 1,827 Spanish
IDs; the sparse British English catalog is unchanged. Fresh extraction is
recorded in `/private/tmp/architect-review-round1-extract.log`.

### Exact-head CI and current gates

The user-requested force-run dispatch is
https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/33990397118
on exact head `86aecd19299517386de51b372e6eded6f85e10c9`. It completed with
failure. This ordinary feature-branch dispatch deliberately selects no E2E,
even with force_run=true; its E2E report success is not native/pixel coverage.

- Lint succeeded. Quality-support failed only at Architect's missing
  `formatMigrationNotes` export during the actual build and typecheck;
  `/private/tmp/architect-pr1705-quality-support.log` records both.
- The Architect unit result was exactly 2,479 passed, six known dependency
  failures, three existing todo. Other completed workspace test tasks passed.
  `/private/tmp/architect-pr1705-units.log` records the failure section.
- Fresco UI Storybook passed 1,318 tests; Interview then discovered
  `react-intl/server` during optimization, reloaded, and lost the runner for
  60 suites. `/private/tmp/architect-pr1705-storybook.log` reproduces the
  already-verified shared optimizer fix that has not yet been integrated.

For this corrective round, Node 24.18.0 full units passed 2,496 tests, with
only the same six dependency failures and three existing todo (288 files,
2,505 tests). See `/private/tmp/architect-review-round1-full-units.log`.
The subsequent test-fixture type and parent-sentinel improvements passed the
complete focused 21-test group. Typecheck again reports only the missing
shared presenter. Lint, Knip, build, E2E types and final formatting outcomes
are recorded in the final checkpoint below when their commands complete.

Canonical risk is explicit: adding localized conjunctions changes printable
network-attribute lists from `A, B, C` to `A, B, and C` in English and may
change wrapping. Locale-aware ordering can change rows containing accented
names. The new inline participant portal is also a rendering change. The
prior repeated 47-file capture and 11 adopted PNGs do not verify this round.
After authorized shared integration, rebuild and repeat the affected native
and canonical visual suites; inspect every resulting difference before any
baseline adoption. No baseline was altered during this corrective round.

Next action: finish lead review of this frozen app correction, commit as the
configured user, push normally, reply to and resolve the two addressed
threads, and request a new completed Codex review on the resulting full SHA.
Keep the pending shared integration explicit; after it is authorized,
integrate normally and run the final types, full tests, optimized build,
Storybook, native and canonical gates. No PR merge or release is authorized.

### First review correction: frozen verification checkpoint

All commands below use Node 24.18.0 via the explicit fnm installation PATH
and pnpm `--config.verify-deps-before-run=false`; unit runs also set
`NODE_OPTIONS=--no-experimental-webstorage`.

| Gate                                                                     | Current result                                                                                                                    | Log                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @codaco/architect test`                                   | 2,496 passed / six documented dependency failures / three existing todo; no added skips                                           | /private/tmp/architect-review-round1-full-units.log     |
| Six directly affected regression files                                   | 21/21 passed after final fixture typing and stronger parent-store oracle                                                          | /private/tmp/architect-review-round1-final-targeted.log |
| `pnpm --filter @codaco/architect typecheck`                              | Only missing formatMigrationNotes export; no app-owned type errors remain                                                         | /private/tmp/architect-review-round1-final-types.log    |
| `pnpm --filter @codaco/architect exec tsc -p e2e/tsconfig.json --noEmit` | Passed                                                                                                                            | /private/tmp/architect-review-round1-e2e-types.log      |
| Actual app build with analytics/animations disabled                      | Failed only at missing formatMigrationNotes export; log confirms Node 24.18.0                                                     | /private/tmp/architect-review-round1-final-build.log    |
| Type-aware Architect oxlint                                              | Passed, zero errors; the tested TanStack cache invalidation is narrowly documented/suppressed, no missing intl dependency remains | /private/tmp/architect-review-round1-final-lint.log     |
| `knip --workspace @codaco/architect`                                     | Passed                                                                                                                            | /private/tmp/architect-review-round1-knip.log           |
| Catalog extraction and full-suite locale guards                          | Passed; 1,827 en/es IDs, unchanged sparse en-GB; one reviewed visible pair and two metadata descriptions                          | /private/tmp/architect-review-round1-extract.log        |

Lead independently read all 22 app files, the full helper consumer set, the
21-test green group, and four failing parent-boundary mutation cases. Their
frozen SHA256 set is `/private/tmp/nc-architect-round1-lead-frozen-hashes.json`;
all 22 files still match before commit. Only this plan is additional. No
PNG or JSON baseline changed. The shared dependency hold still prevents
rebuilding/rerunning the final production-browser and canonical checkpoint.

The normal-lane changeset guard also passes: `/private/tmp/architect-review-round1-changesets.log`. The existing Architect minor changeset covers this corrective round. Final formatter and `git diff --check` pass. The lead-approved app source remains unchanged after its freeze.
