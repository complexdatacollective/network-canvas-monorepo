# Architect application localization execution plan

Issue: #1616. Branch: `feat/architect-app-i18n`. Base at start:
`4c4789f59`. Shared prerequisites are owned by the orchestration branch and
must merge first; this PR owns Architect and its normal-lane app changeset.
The final review correction also adds a small default-label text helper beside
the shared Markdown renderer, with a separate normal-lane library changeset.

The accepted 2026-09-04 app UI design and 2026-08-27 protocol localization
design govern the work. The user's amendment adds complete neutral Spanish
(`es`) alongside source English (`en`) and sparse British English (`en-GB`).
The existing app-i18n APIs, Studio implementation and PR #1651 were inspected.

## Acceptance matrix and surface inventory

This table records the current implementation status; the dated checkpoints
below preserve earlier results without promoting them to final evidence.

| Surface / acceptance area              | Implementation and evidence                                                                                                                    | Current status                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device preference and language setting | Immediate en/es/en-GB selection, Automatic, persistence, rejected-storage feedback and cross-tab updates                                       | All eight focused production workflows pass, including held-module startup, six existing language flows and actual editor/printed rule lists                                                    |
| Full and inline preview boundaries     | Shell owns built-in interface language; host supplies its resolved request and scoped finish copy; protocol-authored strings/data stay literal | Full-preview menu, queued-dialog and independent-language workflows pass; actual inline field, response and parent dialog survive ES–GB–ES                                                      |
| Home, editors, codebook and resources  | Complete chrome, guidance, errors, counts and locale-aware alphabetical controls                                                               | Reviewed Codebook counts, related positions/thresholds/conflicts and queued plurals remain covered; static startup exposes the proper product name before JavaScript                            |
| Printed summaries and codebook         | Locale collation and whole linked/operand lists retain literal names, exact targets, rich labels and language grammar                          | Actual schema-valid editor and printed rule lists change live across ES/EN/GB, including Spanish “e Isabel”; authored data stays exact                                                          |
| Catalogs and production locales        | 1,825 complete EN/ES descriptors and 37 sparse en-GB overrides                                                                                 | Prior independently reviewed ten EN/ES pairs and ten GB overrides remain byte-identical; round three adds no copy                                                                               |
| Development pseudo-locale              | Development-only registry option; never persisted as a production preference                                                                   | Existing scope preserved                                                                                                                                                                        |
| Static and catalog checks              | App+E2E types, type-aware lint, full repository Knip, byte-identical extraction/parity, formatting and changeset guard pass                    | Fresh round-three source verified, production build/PWA integrity pass                                                                                                                          |
| Focused source verification            | Round four: 43/43 app rule tests, 31/31 shared renderer tests and 4/4 production browser workflows                                             | Five additional no-write faults detect the old editor parser and missing GFM, HTML, sanitization or unwrapping; prior language, identity and boot proofs remain applicable                      |
| Broad app and shared integration gates | 2,516 unit/script passes plus three existing todos, all 293 files; 173/173 native passes; cold Storybook 15/15                                 | Full 9585 CI passes all six E2E jobs; round-four focused gates and both affected Rules stories pass, with fresh final CI required after push                                                    |
| Canonical images                       | CI runs 34057696010 and 34057709075 pass 2/2 each, 28/28 repeat stable; the six approved changes were adopted                                  | Normal fd856 pixel CI passes. Round-three recursive fixture census and actual printed DOM prove no changed branch in any capture; all 28 PNGs and 19 JSONs remain unchanged                     |
| PR, CI and review                      | Runtime #1719 merged; Architect normally integrates main 4ea9fe095 via f35e12bcd; fd856 standard main CI34059080801 fully succeeds             | The final Markdown-dialect finding is corrected in round four. Independent focused review is clean; a completed clean final-head Codex verdict and fresh standard CI remain required after push |

## Deliberate scope boundaries

- Protocol-authored labels, variable names, participant content and bundled
  sample protocol data retain their authored text. Locale changes never write
  protocol content, research data, enum values, paths or identifiers.
- The user's 2026-09-06 clarification includes built-in interview controls,
  validation, accessible names and messages. Full and inline previews request
  the host's resolved UI locale from the runtime's own independent registry.
  Protocol-authored participant strings remain literal until the separately
  scoped protocol-content localization feature. Preparation, failure and
  completion screens remain Architect chrome.
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

## Historical implementation checkpoints

These dated records describe their recorded source states. Fixed-English
preview decisions and missing-export integration holds below were superseded
by the current acceptance matrix and the latest checkpoint at the end.

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
  exact icon-library identifier names. The earlier preview English exception
  is superseded by the clarified built-in interface scope below. These are not locale-dependent researcher prose.
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

| Source                                                                      | Candidate                                                                                                               | Disposition                                                                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/analytics.ts:12`                                                       | ArchitectWeb                                                                                                            | Product, platform, or analytics identifier.                                                                                      |
| `src/analytics.ts:13`                                                       | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                      |
| `src/components/AppUpdate/AppUpdatePill.tsx:33`                             | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                      |
| `src/components/AppUpdate/AppUpdateProvider.tsx:27`                         | useAppUpdateContext must be used within AppUpdateProvider                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/AssetBrowser/AssetCard.tsx:368`                             | data-current:border-primary data-focused:border-primary data-selected:border-primary data-selected:bg-selected          | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Assets/Table.tsx:117`                                       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Assets/withAssetUrl.tsx:53`                                 | Failed to load asset blob URL                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Assets/withAssetUrl.tsx:71`                                 | \`withAssetUrl(${WrappedComponent.displayName \|\| WrappedComponent.name})\`                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/BackgroundLights.tsx:19`                                    | color-mix(in oklab, oklch(var(--sea-green)), transparent 55%)                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BackgroundLights.tsx:23`                                    | color-mix(in oklab, oklch(10% 0.4 290), transparent 78%)                                                                | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BackgroundLights.tsx:27`                                    | color-mix(in oklab, oklch(var(--slate-blue)), transparent 60%)                                                          | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BackgroundLights.tsx:31`                                    | color-mix(in oklab, oklch(var(--sea-green)), transparent 70%)                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BackgroundLights.tsx:52`                                    | \`absolute ${position}\`                                                                                                | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BackgroundLights.tsx:54`                                    | \`radial-gradient(circle, ${color}, transparent 75%)\`                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/BooleanChoice.tsx:88`                                       | Yes                                                                                                                     | Persisted default participant answer labels; protocol-authored data.                                                             |
| `src/components/BooleanChoice.tsx:89`                                       | No                                                                                                                      | Persisted default participant answer labels; protocol-authored data.                                                             |
| `src/components/Brand.tsx:35`                                               | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                      |
| `src/components/Brand.tsx:73`                                               | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                      |
| `src/components/Codebook/EntityTypeDialog.tsx:226`                          | \`${entity}-${type ?? 'new'}-${openCount}\`                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/ExternalLink.tsx:33`                                        | noopener noreferrer                                                                                                     | Link security relation.                                                                                                          |
| `src/components/ExternalLink.tsx:46`                                        | noopener noreferrer                                                                                                     | Link security relation.                                                                                                          |
| `src/components/Form/Dropzone/Dropzone.tsx:93`                              | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/ColorPicker.tsx:111`                            | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/ColorPicker.tsx:112`                            | cursor-default opacity-70                                                                                               | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/ColorPicker.tsx:133`                            | outline-2 outline-offset-3                                                                                              | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/ColorPicker.tsx:134`                            | hover:outline-2 hover:outline-offset-2                                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/DataSource.tsx:115`                             | \`${name ?? 'dataSource'}-type\`                                                                                        | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:364`       | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                                |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:364`       | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                                |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:374`       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:413`       | data-focused:bg-surface-2 data-selected:bg-primary data-selected:text-primary-contrast                                  | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/Fields/VariablePicker/VariableSpotlight.tsx:414`       | data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-transparent                            | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/arrayFields/Attribute.tsx:123`                         | Attribute rows must be rendered inside AssignAttributes.                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Form/arrayFields/Attribute.tsx:239`                         | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Form/arrayFields/DialogArrayField.tsx:222`                  | \`${STAGE_FORM_ID}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor\`                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Form/arrayFields/DialogArrayField.tsx:360`                  | DialogArrayField renderers must be used inside the field.                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Form/arrayFields/MultiSelect.tsx:157`                       | MultiSelect rows must be rendered inside MultiSelect.                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Form/arrayFields/MultiSelect.tsx:182`                       | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Form/arrayFields/MultiSelect.tsx:215`                       | \`group ${MULTI_SELECT_RULE_CLASSES}\`                                                                                  | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Form/arrayFields/Option.tsx:153`                            | Option rows must be rendered inside Options.                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Form/arrayFields/Option.tsx:186`                            | \`${arrayName}[${committedIndex ?? index}]\`                                                                            | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Form/arrayFields/Option.tsx:318`                            | Escape                                                                                                                  | Native keyboard-event identifier.                                                                                                |
| `src/components/Home/Home.tsx:120`                                          | GitHub                                                                                                                  | Product, platform, or analytics identifier.                                                                                      |
| `src/components/Home/Home.tsx:205`                                          | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/Home.tsx:220`                                          | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/Home.tsx:327`                                          | noopener noreferrer                                                                                                     | Link security relation.                                                                                                          |
| `src/components/Home/LibraryPanel.tsx:442`                                  | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Home/LibraryPanel.tsx:468`                                  | LibraryPanel action failed                                                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Home/LibraryPanel.tsx:1050`                                 | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/LibraryPanel.tsx:1051`                                 | Sample Protocol                                                                                                         | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/LibraryPanel.tsx:1063`                                 | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/LibraryPanel.tsx:1064`                                 | Development Protocol                                                                                                    | Authored bundled protocol name, preserved consistently on the card and in stored data.                                           |
| `src/components/Home/TransitMap.tsx:68`                                     | TIMELINE_SCRIPT is empty                                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Home/TransitMap.tsx:78`                                     | \`0 0 ${DESIGN_W} ${DESIGN_H}\`                                                                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Home/TransitMap.tsx:81`                                     | xMidYMid meet                                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/TransitMap.tsx:287`                                    | xMidYMid meet                                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:163`                                 | hsl(237 79% 67%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:169`                                 | hsl(342 77% 51%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:175`                                 | hsl(27 93% 54%)                                                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:181`                                 | hsl(103 46% 56%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:187`                                 | hsl(46 100% 47%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Home/timelineScript.ts:193`                                 | hsl(237 79% 67%)                                                                                                        | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/InstallBanner.tsx:104`                                      | Mac                                                                                                                     | Product, platform, or analytics identifier.                                                                                      |
| `src/components/InstallBanner.tsx:105`                                      | Safari                                                                                                                  | Product, platform, or analytics identifier.                                                                                      |
| `src/components/Parameters/Parameters.tsx:18`                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Parameters/Parameters.tsx:19`                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/PreviewHost/PreviewHost.tsx:146`                            | This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards. | Superseded on 2026-09-06: extracted preview confirmation descriptor; subscribed to Shell locale with explicit Architect catalog. |
| `src/components/PreviewHost/PreviewHost.tsx:264`                            | Failed to build preview payload                                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/PreviewHost/previewRosterData.ts:51`                        | \`Could not resolve roster asset "${assetId}" for preview\`                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/PreviewHost/previewRosterData.ts:79`                        | Could not collect roster data for preview                                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/PreviewHost/useAssetResolver.ts:47`                         | \`Missing protocol scope for asset ${assetId}\`                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/PreviewHost/useAssetResolver.ts:65`                         | \`Asset ${assetId} not found in local store\`                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/PreviewHost/useAssetResolver.ts:73`                         | \`Preview closed before asset ${assetId} finished loading\`                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/ProjectNav/ActionToolbar.tsx:116`                           | useActionToolbar must be used inside ActionToolbarProvider.                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/ProjectNav/ActionToolbar.tsx:130`                           | calc(100% + 1.25rem)                                                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/ProjectNav/NavShell.tsx:161`                                | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/ProtocolInfoCard.tsx:198`                                   | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/ProtocolInfoCard.tsx:382`                                   | Network Canvas Protocol                                                                                                 | Deterministic decorative Pattern seed, aria-hidden.                                                                              |
| `src/components/ProtocolInfoCard.tsx:433`                                   | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Query/Rules/PreviewRules.tsx:49`                            | Rule list parts must render inside a rule list.                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Query/Rules/PreviewRules.tsx:119`                           | \`${editActionId} ${textId}\`                                                                                           | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Query/Rules/PreviewRules.tsx:128`                           | \`${deleteActionId} ${textId}\`                                                                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Query/Rules/PreviewText.tsx:276`                            | \`${typeof item}-${String(item)}-${index}\`                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Query/Rules/RuleEditor.tsx:301`                             | ALTER/VARIABLE                                                                                                          | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                 |
| `src/components/Query/Rules/RuleEditor.tsx:302`                             | ALTER/TYPE                                                                                                              | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                 |
| `src/components/Screens/NewStageScreen/Interface.tsx:46`                    | \`${interfaceType} definition not found\`                                                                               | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Screens/NewStageScreen/Interface.tsx:76`                    | \`${descriptionId} ${tagsId}\`                                                                                          | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Screens/NewStageScreen/Interface.tsx:99`                    | \`mb-2 ${highlighted ? 'text-white' : ''}\`                                                                             | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Screens/NewStageScreen/Interface.tsx:105`                   | \`mb-3 ${highlighted ? 'text-white' : ''}\`                                                                             | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:144`              | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:210`              | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                                |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:210`              | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                                |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:225`              | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:233`              | ArrowUp                                                                                                                 | Native keyboard-event identifier.                                                                                                |
| `src/components/Screens/NewStageScreen/NewStageScreen.tsx:238`              | ArrowDown                                                                                                               | Native keyboard-event identifier.                                                                                                |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:146`             | Name and Edge Generators                                                                                                | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:147`             | Sociograms                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:148`             | Name and Edge Interpreters                                                                                              | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:149`             | Utilities                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:153`             | Create nodes                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:154`             | Create edges                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:155`             | Capture Ego data                                                                                                        | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:156`             | Capture Node Attributes                                                                                                 | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:157`             | Capture Edge Attributes                                                                                                 | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:158`             | Use Roster Data                                                                                                         | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:159`             | Display Media                                                                                                           | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:160`             | Display Data                                                                                                            | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:236`             | NameGenerator                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:237`             | NameGeneratorQuickAdd                                                                                                   | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:238`             | NameGeneratorRoster                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:239`             | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:240`             | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:241`             | DyadCensus                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:242`             | OneToManyDyadCensus                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:243`             | TieStrengthCensus                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:244`             | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:245`             | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:246`             | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:247`             | OrdinalBin                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:248`             | CategoricalBin                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:249`             | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:250`             | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:251`             | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:252`             | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:253`             | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:254`             | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:285`             | namegenerator name generator form attributes nodes node roster                                                          | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:286`             | NameGenerator                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:293`             | namegenerator name generator quick add simple easy nodes node create roster                                             | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:294`             | NameGeneratorQuickAdd                                                                                                   | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:301`             | namegenerator name generator search add import list filter roster nodes node csv create                                 | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:302`             | NameGeneratorRoster                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:316`             | family pedigree tree census namegenerator name generator nodes node edges edge                                          | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:317`             | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:325`             | narrative pedigree disease visualize visualise genetics inheritance focal hereditary                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:326`             | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:332`             | edge tie generator edges create add                                                                                     | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:333`             | DyadCensus                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:339`             | edge tie generator edges create add                                                                                     | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:340`             | OneToManyDyadCensus                                                                                                     | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:346`             | edge tie generator census dyad edges create strength ordinal                                                            | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:347`             | TieStrengthCensus                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:353`             | sociogram visual edges highlight visualize visualise                                                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:354`             | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:366`             | network composer sociogram free form notepad build construct nodes edges attributes single screen                       | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:367`             | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:374`             | sociogram narrative visual visualize highlight community qualitative                                                    | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:375`             | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:381`             | ordinal bin node attributes categorical name interpreter                                                                | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:382`             | OrdinalBin                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:388`             | categorical bin node attributes name interpreter                                                                        | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:389`             | CategoricalBin                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:395`             | alter attributes node interpreter form forms                                                                            | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:396`             | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:402`             | alter attributes node interpreter map                                                                                   | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:403`             | Geospatial                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:409`             | edge attributes form forms edge interpreter                                                                             | Compatibility category/tag key; presentation resolves its explicit descriptor.                                                   |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:410`             | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:416`             | ego survey participant form forms                                                                                       | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:417`             | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:424`             | instruction text participant guide intro image video audio media resource                                               | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:425`             | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:432`             | instruction text participant guide intro image video audio media resource                                               | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:433`             | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Screens/NewStageScreen/interfaceOptions.ts:454`             | \`${definition.keywords} ${definition.tags.map((tag) => interfaceTagLabel(tag, intl)).join(' ')}\`                      | Supplemental English search aliases; search also includes localized title, description and tag labels.                           |
| `src/components/StageEditor/Interfaces.tsx:313`                             | \`Unknown interface type: "${interfaceType}". Valid types are: ${Object.keys(INTERFACE_CONFIGS).join(', ')}\`           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/StageEditor/StageEditor.tsx:237`                            | Information                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/StageEditor/StageFormBridge.tsx:162`                        | StageFormBridge must be rendered inside a FormStoreProvider                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/StageEditor/requireStageFieldValue.ts:26`                   | Stage field values must satisfy the form contract.                                                                      | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/StageEditor/stageFormContext.ts:75`                         | useStageFormContext must be used within a StageForm                                                                     | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/components/Tag.tsx:29`                                                 | cursor-not-allowed opacity-50                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Tag.tsx:30`                                                 | focusable cursor-pointer                                                                                                | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Timeline/Timeline.tsx:232`                                  | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/Timeline/Timeline.tsx:423`                                  | inset(0 0 100% 0)                                                                                                       | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Timeline/Timeline.tsx:424`                                  | inset(0 0 0% 0)                                                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/TypeEditor/ShapeVariableMapping.tsx:467`                    | \`${ITEM_ROW_CLASSES} pointer-events-none select-none\`                                                                 | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Validations/ValidationRule.tsx:64`                          | \`${MULTI_SELECT_RULE_CLASSES} ${ROW_BASE}\`                                                                            | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/Validations/ValidationRule.tsx:97`                          | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/Validations/Validations.tsx:665`                            | \`${scopeId ?? ''}\|${currentVariableId ?? ''}\|${variableType ?? ''}\|${entity ?? ''}\`                                | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/Validations/contradictions.ts:57`                           | this attribute                                                                                                          | Temporary analyzer record fallback only; presentation receives original names or nested thisAttribute descriptor.                |
| `src/components/VariablePill.tsx:136`                                       | \`${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark\`                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/VariablePill.tsx:360`                                       | Enter                                                                                                                   | Native keyboard-event identifier.                                                                                                |
| `src/components/VariablePill.tsx:409`                                       | \`${Math.min(initialPillWidth, targetPillWidth)}px\`                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/VariablePill.tsx:410`                                       | \`${Math.max(initialPillWidth, targetPillWidth)}px\`                                                                    | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/components/VariableRoleConflictsAlert.tsx:97`                          | \`${conflict.subject.entity}:${conflict.subject.type ?? ''}:${conflict.variableId}\`                                    | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/enhancers/withDisabledSubjectRequired.tsx:23`               | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/enhancers/withDisabledSubjectRequired.tsx:28`               | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Background/Background.tsx:145`                     | Narrative                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Background/Background.tsx:146`                     | Sociogram                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Background/Background.tsx:147`                     | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/Form.tsx:123`                                 | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/Form.tsx:124`                                 | AlterForm                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/Form.tsx:125`                                 | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/Form.tsx:138`                                 | EgoForm                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/Form.tsx:141`                                 | AlterEdgeForm                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/composerHelpers.ts:160`                       | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/Form/composerHelpers.ts:204`                       | NetworkComposer                                                                                                         | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/MapOptions.tsx:246`                                | Map Options Mapbox Key                                                                                                  | Empty data-name compatibility seam; no text or accessible name.                                                                  |
| `src/components/sections/MapOptions.tsx:275`                                | Layer data-source                                                                                                       | Empty data-name compatibility seam; no text or accessible name.                                                                  |
| `src/components/sections/NarrativePedigree/Diseases.tsx:110`                | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/NarrativePedigree/SourceStage.tsx:69`              | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/components/sections/NodePanels/usePanelSlot.ts:41`                     | \`panels[${committedIndex ?? index}]\`                                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx:116` | create edges                                                                                                            | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                 |
| `src/components/sections/SociogramPrompts/PromptFieldsTapBehaviour.tsx:117` | highlight attributes                                                                                                    | Persisted behavior or internal rule identifier; visible option has a descriptor.                                                 |
| `src/config/variables.ts:342`                                               | Text                                                                                                                    | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:344`                                               | TextInput                                                                                                               | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:348`                                               | TextArea                                                                                                                | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:350`                                               | TextArea                                                                                                                | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:354`                                               | Number                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:356`                                               | NumberInput                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:360`                                               | CheckboxGroup                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:362`                                               | CheckboxGroup                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:366`                                               | Toggle                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:368`                                               | Toggle                                                                                                                  | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:372`                                               | RadioGroup                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:374`                                               | RadioGroup                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:378`                                               | ToggleButtonGroup                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:380`                                               | ToggleButtonGroup                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:384`                                               | LikertScale                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:386`                                               | LikertScale                                                                                                             | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:390`                                               | VisualAnalogScale                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:392`                                               | VisualAnalogScale                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:396`                                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:398`                                               | DatePicker                                                                                                              | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:402`                                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:404`                                               | RelativeDatePicker                                                                                                      | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:408`                                               | Boolean                                                                                                                 | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:410`                                               | BooleanChoice                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/config/variables.ts:572`                                               | \`${type ?? ''}.icon\`                                                                                                  | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/ducks/middleware/protocolLibraryListener.ts:80`                        | Protocol library commit failed                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/middleware/protocolValidationListener.ts:230`                    | \`Protocol validation could not be completed: ${ typeof error === 'string' ? error : ensureError(error).message }\`     | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/modules/protocol/assetManifest.ts:91`                            | Check that it is a supported file type, and try again.                                                                  | Legacy error contract; AutoFileDrop always supplies the localized generic descriptor alongside it.                               |
| `src/ducks/modules/protocol/assetManifest.ts:214`                           | \`Unsupported asset type for file: ${file.name}\`                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/modules/protocol/codebook.ts:422`                                | Type must be specified for non ego nodes                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/modules/protocol/codebook.ts:448`                                | Type must be specified for non ego nodes                                                                                | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/modules/protocol/stages.ts:43`                                   | NarrativePedigree                                                                                                       | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/ducks/modules/protocol/stages.ts:114`                                  | FamilyPedigree                                                                                                          | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/ducks/modules/protocol/stages.ts:125`                                  | Anonymisation                                                                                                           | Stable protocol/interface/input-control identifier; presentation uses descriptor metadata.                                       |
| `src/ducks/modules/protocolValidation.ts:29`                                | Validation failed                                                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/modules/userActions/userActions.ts:612`                          | No active protocol to export                                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/ducks/restoreActiveProtocol.ts:203`                                    | Session state restoration timed out; using a fresh session.                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/hooks/useJsonPreview.ts:56`                                            | KeyJ                                                                                                                    | Native keyboard-event identifier.                                                                                                |
| `src/hooks/useJsonPreview.ts:61`                                            | Escape                                                                                                                  | Native keyboard-event identifier.                                                                                                |
| `src/hooks/useStageEditorKeyboard.ts:43`                                    | KeyZ                                                                                                                    | Native keyboard-event identifier.                                                                                                |
| `src/hooks/useStageEditorKeyboard.ts:49`                                    | KeyZ                                                                                                                    | Native keyboard-event identifier.                                                                                                |
| `src/hooks/useStageEditorKeyboard.ts:55`                                    | KeyY                                                                                                                    | Native keyboard-event identifier.                                                                                                |
| `src/i18n/documentMetadata.tsx:26`                                          | Architect                                                                                                               | Product, platform, or analytics identifier.                                                                                      |
| `src/i18n/locales.ts:9`                                                     | English                                                                                                                 | Autonym, rendered with the named language; stable locale tag.                                                                    |
| `src/i18n/locales.ts:10`                                                    | English (UK)                                                                                                            | Autonym, rendered with the named language; stable locale tag.                                                                    |
| `src/i18n/locales.ts:11`                                                    | Español                                                                                                                 | Autonym, rendered with the named language; stable locale tag.                                                                    |
| `src/lib/ProtocolSummary/components/Contents.tsx:82`                        | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/lib/ProtocolSummary/components/Contents.tsx:98`                        | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/lib/ProtocolSummary/components/Contents.tsx:136`                       | \`list-none ${headingClass}\`                                                                                           | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/lib/ProtocolSummary/components/Cover.tsx:62`                           | Network Canvas                                                                                                          | Product, platform, or analytics identifier.                                                                                      |
| `src/lib/ProtocolSummary/components/Entity.tsx:25`                          | \`entity-${type ?? ''}\`                                                                                                | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/lib/ProtocolSummary/components/ProtocolCard.tsx:94`                    | wrap-break-word hyphens-auto                                                                                            | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/lib/ProtocolSummary/components/SummaryContext.tsx:22`                  | Untitled Protocol                                                                                                       | Provider-optional default; app SummaryPage always supplies the authored protocol name.                                           |
| `src/lib/ProtocolSummary/components/useAssetData.tsx:71`                    | Failed to load asset blob URL                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/main.tsx:92`                                                           | Root container #root not found                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/main.tsx:141`                                                          | (prefers-reduced-motion: reduce)                                                                                        | Database, error-class, or browser capability identifier.                                                                         |
| `src/preview-main.tsx:28`                                                   | Root container #root not found                                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/assetDB.ts:39`                                                   | ArchitectProtocolDB                                                                                                     | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/assetDB.ts:45`                                                   | id, protocolId                                                                                                          | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/assetDB.ts:46`                                                   | id, updatedAt                                                                                                           | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/assetNames.ts:65`                                                | \`${stem} (${counter})${extension}\`                                                                                    | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/assetUtils.ts:26`                                                | Cannot save asset: no active protocol scope                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/assetUtils.ts:47`                                                | Cannot save asset: no active protocol scope                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/assetUtils.ts:67`                                                | Cannot save assets: no active protocol scope                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/bundleProtocol.ts:194`                                           | \`${(protocolName ?? 'protocol').replace(/\s+/g, '_')}-${timestamp}.netcanvas\`                                         | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/bundleProtocol.ts:208`                                           | \`Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}\`                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/bundleProtocol.ts:208`                                           | Unknown error                                                                                                           | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/fileLaunchQueue.ts:56`                                           | Failed to read launched file                                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/fileLaunchQueue.ts:69`                                           | Failed to handle launched files                                                                                         | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/installPrompt.ts:50`                                             | (display-mode: standalone)                                                                                              | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/netcanvasSizeGuard.ts:54`                                        | NetcanvasTooLargeError                                                                                                  | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/protocolImportErrors.ts:62`                                      | Architect could not open this protocol.                                                                                 | Legacy fallback selector/diagnostic; describeImportFailure returns a localized descriptor for UI.                                |
| `src/utils/protocolImportErrors.ts:66`                                      | Architect could not open this template.                                                                                 | Legacy fallback selector/diagnostic; describeImportFailure returns a localized descriptor for UI.                                |
| `src/utils/protocolImportErrors.ts:98`                                      | \`Caused by: ${asError.message}\`                                                                                       | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/protocolLibrary.ts:69`                                           | Failed to remove orphaned assets during save                                                                            | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocolLibrary.ts:125`                                          | \`Protocol ${expected.id} disappeared during validation.\`                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocolLibrary.ts:134`                                          | \`Protocol ${expected.id} changed while it was being validated. Try opening it again.\`                                 | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/protocolLibrary.ts:142`                                          | \`Protocol ${expected.id} disappeared during validation.\`                                                              | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:40`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:55`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:59`                                      | Expected Blob data for CSV asset                                                                                        | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:90`                                      | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:156`                                     | This network file doesn't contain any nodes or edges.                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:180`                                     | That file type is not supported as a resource.                                                                          | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:197`                                     | \`Asset with ID "${assetId}" not found in IndexedDB\`                                                                   | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/protocols/assetTools.ts:201`                                     | Expected Blob data for GeoJSON asset                                                                                    | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/pwa.ts:20`                                                       | \`(display-mode: ${mode})\`                                                                                             | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/resolveProtocolColor.ts:24`                                      | \`Unsupported protocol color reference: ${name}\`                                                                       | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |
| `src/utils/resolveProtocolColor.ts:26`                                      | \`--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}\`                                                 | Internal path, identity, filename, selector, or media query; preserve stable data.                                               |
| `src/utils/resolveProtocolColor.ts:28`                                      | \`oklch(from ${reference} calc(l - 0.05) c h)\`                                                                         | Styling, SVG, or layout value; no researcher prose.                                                                              |
| `src/utils/storageErrors.ts:7`                                              | QuotaExceededError                                                                                                      | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/storageErrors.ts:8`                                              | InvalidStateError                                                                                                       | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/storageErrors.ts:9`                                              | SecurityError                                                                                                           | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/storageErrors.ts:15`                                             | DatabaseClosedError                                                                                                     | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/storageErrors.ts:16`                                             | OpenFailedError                                                                                                         | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/storageErrors.ts:17`                                             | VersionError                                                                                                            | Database, error-class, or browser capability identifier.                                                                         |
| `src/utils/validations.ts:371`                                              | Date value must be a string                                                                                             | Developer/technical diagnostic; UI boundary reports localized actionable guidance and labelled English detail where applicable.  |

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

### Authorized integration and clarified runtime scope — 2026-09-06

The lead completed the ordinary local merge of shared commit
`f3b4dc7b88441d0349d33af52203f6e30bc76c17` onto app head
`8f60a6c9baa3a4095d68a0a5decd93769d70c312`, producing
`4423f25fa80aec6d0272665f36494fd0bfcc20fa`. That authorized integration is
complete. No rebase, force push, GitHub merge, release or deployment occurred.
The previous completed clean Codex verdict is 5554894746 on `8f60a6c9`;
it does not review the local merge or the pending interface correction.

The integrated app's typecheck (including E2E types), optimized production
build, type-aware lint, Knip, extraction, format and changeset guard passed.
The built production native suite passed 169/169 in 9.0 minutes. Logs:
`/private/tmp/architect-integrated-final-types.log`,
`/private/tmp/architect-integrated-final-build.log`,
`/private/tmp/architect-integrated-final-lint.log`,
`/private/tmp/architect-integrated-final-knip.log`,
`/private/tmp/architect-integrated-extraction.log`,
`/private/tmp/architect-integrated-format.log`,
`/private/tmp/architect-integrated-changesets.log`, and
`/private/tmp/architect-integrated-native.log`.

The first integrated full unit/scripts result was 2,495 passed, seven failures
and three existing todo in 288 files (2,505 tests). Six failures expected the
old disjoint-bounds sentence; their assertions now require the new complete
actionable guidance. The seventh migration-note oracle expected Markdown's
`code` node although Architect deliberately unwraps that unsupported element.
It now checks the exact rendered Spanish list-item sentence, raw schema
identifiers and unchanged approval/data behavior. Replacing the real
localized Markdown with raw notes fails this Spanish oracle; the production
source was restored. Evidence is
`/private/tmp/architect-integrated-final-units.log` and
`/private/tmp/architect-integrated-migration-mutation-red.log`.
The two corrected suites now pass all 60 tests in 9.69 seconds with one
worker: `/private/tmp/architect-integrated-contract-corrections-green.log`.
Later full reruns were interrupted under unrelated external CPU saturation;
their filenames containing `green` do not imply a successful result.

The user then explicitly expanded scope to include all built-in participant
interface controls/messages in `@codaco/interview`. The lead owns a separate
runtime provider, requestedLocale negotiation, static catalogs and Shell
contract. This app does not copy the runtime catalogs or localize authored
protocol strings. The bounded shared interface assignment audited 67 owned
production files, added 113 contextual descriptors with independently
reviewed Spanish and two sparse British overrides, and passed 57 focused
checks across ten suites. Four deliberate mutations fail on queued-search
status, open-dialog placeholder, roster memo invalidation and native Mapbox
live labels. The shared package source is frozen for lead verification; its
whole-package, matrix, visual and integration evidence is tracked by the lead.

The Architect preview correction was prepared in
`/private/tmp/nc-architect-preview-locale.patch` and applied after the public
runtime provider became available by the normal merge recorded below. It:

- Pass the host's resolved locale to Shell and remove the broad English-only
  wrapper. Shell owns built-in interface formatting and its DOM language.
- Wrap inline ProtocolField in the exported InterviewI18nProvider, preserving
  the isolated Form and local portal container. The preview DOM language and
  direction come from that provider's negotiated locale.
- Keep authored questions, labels, hints, choices and answers literal. Only
  absent-label/question defaults use built-in localized fallback messages.
- Render the preview-only finish explanation through a subscribed component
  that reads Shell's resolved locale and formats with the Architect catalog.
  The actual node can be queued in Shell's isolated provider and follows later
  locale changes. A React node does not retain its creation-time context.
- Add an actual queued DialogProvider regression with independent document and
  interface languages, plus active Spanish validation/popup and parent-form
  preservation assertions. Update the existing production app-language E2E
  workflow to exercise independent preview menu selection, Automatic, and an
  already-open confirmation across a host language change. These prepared
  tests are now applied; their current integrated results are recorded below.

The lead independently reviewed the new EN/ES confirmation pair: the message
preserves that preview responses are never saved, finishing ends this run,
and the researcher can restart. No GB override is needed. The unused English
label descriptor is removed, so the app catalog remains 1,827 IDs. Two existing
fallback descriptions now explain their actual purpose; their translations
are unchanged.

### Current runtime/main integration — 2026-09-06

The authorized normal merge of shared checkpoint
`3ffccd752d119f9b63103d07f5284a6ddc8d605a` produced
`107a46ebcca54daaf9f14812a0df0db44ebfacdc`, with first parent
`4423f25fa80aec6d0272665f36494fd0bfcc20fa`. The shared parent contains the
runtime localization and current main through the reviewed #1702 reconciliation.
Author and committer are Joshua Melville. The three pre-existing app test/plan
changes survived byte-for-byte; the reviewed eight-file preview patch matched
all frozen before/after hashes when applied. A fresh frozen filtered dependency
install added seven packages across 18 selected workspace projects without
changing the lockfile or using dependency build output.

Current app/E2E types pass. Full Architect type-aware lint and Knip pass;
formatting passes 936 files and the changeset guard passes. The current focused
six-suite run passed 111 tests and exposed one asynchronous test expectation:
Fresco revalidates existing field errors after a formatter change. Awaiting the
same exact Spanish sentence fixes the oracle without changing production code;
the actual field suite now passes 7/7. Full units, build, cold Storybook, native and production locale checks now pass;
the final evidence below distinguishes the descriptor-only follow-up.

The updated upstream shipping policy requires canonical PNG generation only in
GitHub Actions, after the pushed ref exists. No native or Docker PNG generation
will run. The classifier flags shared/runtime consumers conservatively; lead
owns cross-app baseline sequencing and reviews every changed artifact before
adoption. Current feature PR CI automatically runs affected native and pixel
E2E from the cumulative PR diff; historical zero-E2E dispatch evidence above
describes the older policy and does not establish the current gate.

Finish the fresh local gates, update this matrix, and commit verified app work
with user attribution. The lead lifted the push hold after #1702 merged.
Normally push the existing PR after source review and repeat explicit @codex review,
fix/reply/resolve rounds until its final full SHA has a completed clean verdict.
The requested development server remains available at
http://127.0.0.1:5183, listener PID 10189; HTTP 200 was checked after integration.

### Final local app handoff — 2026-09-06

The current source includes the normal shared/main integration and the reviewed
preview correction. No production behavior defect surfaced in the final native
or locale workflows. The production Spanish preview did expose a stale English
readiness expectation in the StagePreview page object: its existing label
configuration now includes the next-step accessible name. All three callers
were audited; the two English callers retain their default and the Spanish
caller supplies “Siguiente paso”. This retains a strict role/name assertion.

A real copy defect remained in LanguageSettings: its old hint promised that
changing Architect language would not change preview language. The corrected
complete EN/ES pair now says protocol content stays unchanged, while preview
controls inherit the language unless the preview menu selects an override.
The lead independently reviewed and approved this second translation delta
exactly as proposed; no GB override is needed. Extraction preserves 1,827 app
IDs and 28 sparse British overrides. A fresh production build/PWA check, both
locale/catalog suites (13 tests), and all four production language workflows
pass after this final descriptor-only correction.

| Gate                       | Exact final evidence                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App units/scripts          | 2,504 passed, three existing todos, 288 files, 635.68 seconds. `/private/tmp/nc-architect-runtime-full-units.log`. This full run preceded only the final language-guidance descriptor correction.                                                                                                                                                                        |
| Preview regressions        | 39 passed across both actual preview suites after all three in-memory mutations. `/private/tmp/nc-architect-preview-mutation-controls-green.log`.                                                                                                                                                                                                                        |
| Meaningful failures        | Forced English Shell request fails the active-host regression; frozen confirmation formatter fails the actual queued dialog after ES negotiation; forced English inline provider fails both the live required error and the Spanish percentage popup. No source files were written; hashes remain identical. `/private/tmp/nc-architect-preview-mutation-evidence.json`. |
| Final copy/catalog tests   | 13 passed in both locale/catalog suites after the settings-hint correction. `/private/tmp/nc-architect-runtime-final-locale-units.log`.                                                                                                                                                                                                                                  |
| Production build           | Final Vite build and PWA integrity assertion pass; 24 JS chunks and 69 stage-preview assets are precached. `/private/tmp/nc-architect-runtime-final-build.log`.                                                                                                                                                                                                          |
| Cold Storybook             | 15 passed across all three files after deleting only the verified Architect sb-vitest cache. No late dependency discovery or reload. `/private/tmp/nc-architect-runtime-cold-storybook.log`.                                                                                                                                                                             |
| Full native E2E            | 169 passed in 37 files, 3.0 minutes, zero retries. `/private/tmp/nc-architect-runtime-full-native.log`; the full JSON report is retained as `/private/tmp/nc-architect-runtime-full-native-results.json`. This run preceded only the final language-guidance descriptor correction.                                                                                      |
| Final production languages | All four workflows pass on the final build: es-MX negotiation, device persistence/Automatic, Spanish authoring and literal research data, independent GB preview menu and Automatic reset, already-queued finish copy reacting across tabs, unchanged resource filename, and open-table invalidation. `/private/tmp/nc-architect-runtime-final-app-language.log`.        |
| Real inline preview        | Existing required error changes ES–GB–ES through a second tab's real settings UI; actual input and parent dialog retain identity, the participant response survives, and stored protocol JSON stays exact. `/private/tmp/nc-architect-runtime-inline-ui.log`; ARIA evidence under `/private/tmp/nc-architect-runtime-ui-evidence/`.                                      |
| Spanish expansion          | All 19 distinct stage editors pass at 390px and 768px, with no document or app-scroll-container horizontal overflow, correct lang/dir, and unchanged authored protocol JSON. Per-stage ARIA and both 19-row measurement files are retained under `/private/tmp/nc-architect-runtime-ui-evidence/`.                                                                       |
| Keyboard/accessibility     | The actual 390px settings dialog opens by keyboard, native typeahead selects en/en-GB/es, the successful-save status is exposed in its live region, the dialog fits the viewport, Escape restores trigger focus, and reload retains Spanish. `/private/tmp/nc-architect-runtime-final-keyboard.log`.                                                                     |
| Regional reports           | British map colour/centred wording, printed Initial Centre and Selection Colour, and asset Attributes label pass while protocol data stays unchanged. `/private/tmp/nc-architect-runtime-final-keyboard-gb.log` contains the passing regional case; its initial keyboard failure is superseded by the separate successful keyboard run.                                  |
| Baseline preflight         | All 47 committed baseline files remain unchanged: 28 PNGs and 19 JSONs. `/private/tmp/nc-architect-runtime-final-baseline-preflight.json`. No local baseline PNG generation or adoption occurred.                                                                                                                                                                        |

The scratch audit initially used getByText for a label containing required/hint
text; the actual accessible tree showed the correct British radiogroup name,
which the corrected assertion uses. Native macOS headless popup arrow presses
also left a plain control select unchanged; the independent plain-select probe
confirmed this was not app-specific. Actual collapsed-select keyboard typeahead
then passed all three production language choices. Neither diagnosis required
production control changes or weaker assertions.

The lead confirmed #1702 merged at
`39f59598be90c8413a49710364db477c7a3c2711`. The app PR will target
`feat/interview-interface-i18n` for an app-only review until that shared runtime
follow-up lands. CI only starts automatically for PRs targeting main, so the
interim stacked head uses the authorized force_run=true/release_app=none package
dispatch and canonical Architect image workflow; local native evidence remains
separate. After the runtime PR lands, the lead retargets #1705 to main and waits
for fresh required/native CI on its current head. Canonical images must be
inspected by the lead before adoption, and the formal final @codex review must
name the head containing those images and any final runtime merge. A historical
clean verdict, dispatch success or completed local gates cannot replace these
remaining delivery gates. The lead owns PR merge sequencing; no release or
production deployment is part of this app handoff.

### Canonical CI baseline adoption — 2026-09-06

The normal merge of final shared checkpoint
`5128f4942c67dee5e8690fd43852887b23a24593` produced app head
`8db90a1ceacce6997de21d499572f2f54bdf573d`, with first parent
`10138a29eee23521406519baf87dad39524a7449`. All 14 independently reviewed app
file hashes survived the commit hooks and merge unchanged. The additional
shared delta contains a Navigation story keyboard-order correction and unrelated
landed main work; it changes no Architect or interview runtime production code.
PR #1705 now targets `feat/interview-interface-i18n`, the branch for
[runtime PR #1719](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1719).

The two independent forced (`update_mode=all`) Architect capture runs
[34053348544](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34053348544)
and [34053362502](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34053362502)
each passed both capture cases on this exact head. Both used
`mcr.microsoft.com/playwright:v1.62.1-noble`, image digest
`sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
All 28 generated PNGs are byte-identical between runs. Seventeen differ from
the committed set, with every image dimension unchanged. The 11 other PNGs
and all 19 protocol JSON baselines remain unchanged.

Every changed pixel was located programmatically. The app owner inspected all
40 changed bands as old/new comparison crops, and the lead independently
inspected every band in native-resolution contact sheets and checked the
two-run byte inventory. The lead approved exactly these 17 canonical files:

| PNG stem (under `apps/architect/e2e/visual-snapshots/chromium/`) | Changed pixels | Reviewed change                                                                                           |
| ---------------------------------------------------------------- | -------------: | --------------------------------------------------------------------------------------------------------- |
| `summary-resource-library`                                       |          2,472 | Printed attribute lists now read “name and age”, matching the reviewed locale-aware whole-list formatter. |
| `summary-stage-family-pedigree-1`                                |              8 | Rounded table/container edges; content and geometry unchanged.                                            |
| `summary-stage-dyad-census-1`                                    |            138 | Node/edge glyph and container edges; content and geometry unchanged.                                      |
| `summary-stage-narrative-pedigree-1`                             |             26 | Thumbnail/container corner edges; content and geometry unchanged.                                         |
| `summary-stage-one-to-many-dyad-census-1`                        |            110 | Node glyph and rounded container edges; content and geometry unchanged.                                   |
| `summary-stage-sociogram-1`                                      |            159 | Stage-number circle, node glyph, pill and container edges; content and geometry unchanged.                |
| `summary-stage-ordinal-bin-1`                                    |            121 | Node glyph, thumbnail corner and pill/container edges; content and geometry unchanged.                    |
| `summary-stage-name-generator-quick-add-1`                       |            110 | Node glyph and thumbnail corner edges; content and geometry unchanged.                                    |
| `summary-stage-categorical-bin-1`                                |            135 | Node glyph and thumbnail corner edges; content and geometry unchanged.                                    |
| `summary-stage-alter-form-1`                                     |            188 | Stage-number circle, node glyph, pill and container edges; content and geometry unchanged.                |
| `summary-stage-name-generator-1`                                 |            106 | Node glyph edge, with a maximum one-unit channel difference; content and geometry unchanged.              |
| `summary-stage-anonymisation-1`                                  |             11 | Thumbnail/container corner edges; content and geometry unchanged.                                         |
| `summary-stage-alter-edge-form-1`                                |             18 | Thumbnail corner edges; content and geometry unchanged.                                                   |
| `summary-stage-narrative-1`                                      |            220 | Node glyph, pill and container edges; content and geometry unchanged.                                     |
| `summary-stage-ego-form-1`                                       |             41 | Rounded table, thumbnail and pill/container edges; content and geometry unchanged.                        |
| `summary-stage-tie-strength-census-1`                            |            112 | Node/edge glyph and rounded container edges; content and geometry unchanged.                              |
| `summary-stage-network-composer-1`                               |            112 | Node glyph and rounded container edges; content and geometry unchanged.                                   |

The 16 raster-only updates replace earlier local emulated-container captures
with stable canonical CI output. No source thumbnail assets changed, no text
or controls disappeared, and unchanged pixels outside the reviewed bands were
verified directly. Their acceptance rests on complete visual inspection and
two independent identical captures, not on a threshold or pixel-count heuristic.
Only the approved artifact PNGs were copied; derived comparison crops are not
baselines. Exact hashes, dimensions, coordinates and comparison images remain
in `/private/tmp/nc-architect-ci-visual-comparison.json` and
`/private/tmp/nc-architect-ci-visual-inspection/`.

Interim package CI
[34053336072](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34053336072)
runs on the source head above with `force_run=true` and `release_app=none`.
Its manual-dispatch policy selects no E2E or release jobs. The automatic review
of that head reported two separately owned Interviewer host concerns (device
preference across vault locks and its finish-copy override); the lead is
coordinating those against the Interviewer app PR. It reported no new Architect
inline thread, and both original threads remain resolved. The explicit app-only
review is requested again after this baseline checkpoint is pushed. A fresh
normal no-write pixel/native gate remains required after retargeting to main;
capture success is generation evidence, not that final comparison verdict.

## Current-head review correction round two (2026-09-06)

The explicit review of `72e6123b1188abf2e2548d4ad3442828092d7373`
finished with four actionable Architect threads. The app owner reproduced all
four mechanisms and inspected their related call sites before correcting them:

- `PRRT_kwDOKqiw4s6fubDx`: printed stage attributes and the printed attribute
  table now compare literal names with the active locale. The same census found
  NativeSelect’s default alphabetical option sort; it now uses the locale and
  invalidates its memo on language changes. `sortOptionsByLabel=false` preserves
  authored order, selection, disabled options and original input arrays.
- `PRRT_kwDOKqiw4s6fubDz`: the stage’s linked attribute list now formats raw names
  into locale list parts before restoring the corresponding link at each element
  position. This preserves separate IDs for duplicate names and gives Intl the
  actual initial sound needed for Spanish “e Isabel”. Authored form-field order
  remains unchanged; it is a distinct list from the alphabetical attribute row.
- `PRRT_kwDOKqiw4s6fubD2`: all three Codebook headings now use ICU number arguments.
  Related fixes cover the conflict alert, edit/remove option positions, threshold
  positions, the new-protocol character limit, printed stage numbers and queued
  duplicate-row counts. Numeric breakpoint labels format up to 21 significant
  digits, preserving the exact number and the canonical numeric input value.
- `PRRT_kwDOKqiw4s6fubD4`: the actual complete TypeEditor hint now has the British
  override; Narrative behaviours and Removal behaviour use their rendered IDs.
  A wider spelling census added seven live sibling overrides for analogue,
  normalised, optimised, recognisable/recognise and neighbourhood. The unused
  nodeExamples/edgeExamples descriptors have no production member access at the
  pre-correction head or after this change, and their catalog entries are gone.

The numeric AST census inspected 506 production TS/TSX files and reviewed 102
raw placeholder bindings before its final character-limit correction. Remaining
numeric-looking raw strings are already locale-formatted counts/coordinates,
canonical option values, ISO input bounds, or app/schema version identifiers.
Remaining alphabetical sort sites all pass the active locale. Form fields,
protocol stage order, response options with sorting disabled, and the codebook’s
comma-separated search index preserve their distinct data/order contracts.
Census scripts/results and the unused-ID audit are retained under
`/private/tmp/nc-architect-review-round2-*`.

The original new tests produced five intended failures and two passing controls.
Additional rendered tests reproduced raw option positions, precise threshold
labels and the queued duplicate-row count. Five later no-write Vite mutations
independently remove select memo invalidation, freeze printed sorting to English,
freeze linked-list grammar to English, restore raw Codebook counts, or remove the
three reported live GB overrides. Each produces exactly the intended failing
test, with its control tests still passing. Before/after file hashes prove the
mutation runs never edited production source or catalogs.

The stored-protocol browser fixture is parsed through CurrentProtocolSchema.
It uses valid ASCII NMTOKEN names with underscores, hyphens and dots to distinguish
locale collation from codepoint sorting. Accented-name and Spanish ñ-versus-n
ordering are direct-render tests of the generic formatter, not claims that the
current protocol schema accepts accented attribute names. A first invalid fixture
and then an overly broad selector that included authored form fields were fixed;
neither failure was accepted or converted into a production exception.

| Round-two evidence                         | Result                                                       | Retained evidence                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Focused real components and related suites | 52 passed across 11 suites                                   | `/private/tmp/nc-architect-review-round2-focused-green.log`                                                                |
| Production language workflows              | 6 passed, 7.4 seconds, no retries                            | `/private/tmp/nc-architect-review-round2-production-language.log`                                                          |
| Five no-write mutation runs                | Five intended failing tests; controls pass; source unchanged | `/private/tmp/nc-architect-review-round2-mutation-evidence.json`                                                           |
| App and E2E types                          | Passed                                                       | `/private/tmp/nc-architect-review-round2-types.log`                                                                        |
| App type-aware lint                        | Passed; existing warnings retained                           | `/private/tmp/nc-architect-review-round2-lint.log`                                                                         |
| Full repository Knip                       | Passed                                                       | `/private/tmp/nc-architect-review-round2-knip-full.log`                                                                    |
| App formatting                             | 938 matched files pass                                       | `/private/tmp/nc-architect-review-round2-format-check.log`                                                                 |
| Production build and PWA integrity         | Passed; 24 JS chunks and 69 stage-preview assets precached   | `/private/tmp/nc-architect-review-round2-build.log`                                                                        |
| Catalog extraction, parity and changesets  | Passed; EN/ES 1,825, GB 37                                   | `/private/tmp/nc-architect-review-round2-extraction.log`, focused catalog suite, changesets log                            |
| Independent copy review                    | Lead approved all ten EN/ES and ten live GB deltas           | `/private/tmp/nc-architect-review-round2-copy-delta.json`, `/private/tmp/nc-architect-review-round2-gb-sibling-delta.json` |

No baseline was written or adopted in this source correction. The printed
attribute conjunctions intentionally affect English summary pixels, so the
reviewed source must be pushed before two fresh canonical CI captures, complete
lead inspection, and any adoption. The next normal shared-runtime merge and
final current-head review/CI remain delivery gates; neither the previous clean
review nor the earlier accepted images satisfy them.

### Reviewed source commit and final runtime integration

The lead approved the complete 21-file correction patch, SHA256
`6a4c4148c10103835b177275ab98dad5782153de95947ad78461f669cd82c747`,
including every production change, new test, catalog delta and unused-ID proof.
The ordinary user-attributed commit is
`9c18eab06be65e1497fd0e2a88fc3b32a5f73360`. All 21 frozen hashes survived the
standard lint-staged hooks, with dependency verification explicitly disabled for
that hook invocation so no verification dependencies were installed.

Normal merge `aeeffb615634d60211b0c06a96f6807aea26150c` has that corrective
commit as its first parent and final runtime
`185eec160663c2efa6b7b4c43d27da572b050937` as its second. The merge was clean
and every frozen app hash remained unchanged. That shared checkpoint supplies
the reviewed canonical runtime images, finite accessibility announcements and
the measured Interviewer Storybook optimizer/readiness fixes; its final extra
change only reduces input-event work in a two-Shell integration test. The final
app broad tests and image/review gates apply to this integrated source.

### Final main integration and canonical adoption (2026-09-06)

Runtime PR #1719 merged at
`4ea9fe0951fb267e60bc938196202b4057c52ea0`. The ordinary Architect merge
`f35e12bcda32a17a9004d79f8062bde1076e39ce` has that freshly fetched main
commit as its second parent and preserves all 20 frozen round-two app source,
test and catalog hashes. Both author and committer remain Joshua Melville.

The final pre-main full run exposed the already-landed #1714 removal-animation
bug: 2,511 tests passed, one focus assertion found two Remove controls while the
removed row was still exiting, and three existing todos remained. No new test
synchronization or production workaround was added. A disposable ordinary main
integration passed all 29 actual DialogArrayField tests, including main’s
deterministic long-exit regression. The lead inspected the sole conflict patch,
SHA256 `cfb473a2df8236646152bef255e0458ea66ff46a36c844e606ebb79ff2056105`,
and approved preserving both the locale-independent `[data-array-row-remove]`
selector and main’s exclusion of controls beneath `aria-hidden="true"`.
The actual merge and hooks preserve those exact reviewed bytes. Its final
full run passes 2,513 tests plus the same three todos; the earlier failure is
retained in `/private/tmp/nc-architect-final-integrated-units.log`.

| Final source gate            | Exact evidence                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full app units/scripts       | 2,513 passed, three existing todos, all 292 files; 70.51 seconds. `/private/tmp/nc-architect-final-main-units.log`.                                                                                                                                                                                                                                                                                                                                       |
| Types, lint, full Knip       | All pass on the actual main-integrated source; existing lint warnings only. `/private/tmp/nc-architect-final-main-{types,lint,knip}.log`.                                                                                                                                                                                                                                                                                                                 |
| Catalogs and changesets      | Extraction preserves EN SHA256 `240dae8dd5c4422b9fe33f2418c7b75839271c6bb8a55f7e5a2ccdc93146478c`; all catalog suites are in the full unit run; 1,825 EN/ES entries and 37 GB overrides. `/private/tmp/nc-architect-final-main-{extraction,changesets}.log`.                                                                                                                                                                                              |
| Production build             | PWA integrity passes with 24 JavaScript chunks, 69 stage-preview assets and 101 precache entries. `/private/tmp/nc-architect-final-main-build.log`.                                                                                                                                                                                                                                                                                                       |
| Full native E2E              | 171/171 pass, no skips, failures or retries; 1.4 minutes. `/private/tmp/nc-architect-final-main-native.log` and `-native-results.json`. Includes all six actual production language workflows.                                                                                                                                                                                                                                                            |
| Expanded production UI audit | 5/5 pass: all 19 Spanish editors at 390px and 768px, exact protocol preservation, DOM language/direction, actual keyboard typeahead/save announcement/focus return/persistence, British map/report labels, and actual inline response/parent-dialog preservation across ES–GB–ES. `/private/tmp/nc-architect-final-main-production-ui.log`; 38 editor ARIA records plus metrics and dialog evidence under `/private/tmp/nc-architect-final-ui-evidence/`. |
| Cold Storybook               | 15/15, all three files, after deleting only the verified Architect optimizer cache; no late dependency discovery/reload. `/private/tmp/nc-architect-final-main-cold-storybook.log`.                                                                                                                                                                                                                                                                       |
| Review corrections           | 52 focused passes across 11 suites and five intended no-write mutation failures with passing controls remain recorded above. All four review threads have code fixes and replies, and are resolved.                                                                                                                                                                                                                                                       |

Canonical generation ran only in GitHub Actions using the pinned Playwright
1.62.1 Noble image. Runs
[34057696010](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34057696010)
and [34057709075](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34057709075)
each passed both capture cases on pushed source
`8a870f3f87ae04801fcacf3ae4e538d001400d11`. All 28 forced outputs are
byte-identical across runs. The lead independently inspected every changed
native-resolution band and approved exactly these six first-run files:

- `summary-stage-alter-form-1.png`
- `summary-stage-family-pedigree-1.png`
- `summary-stage-name-generator-roster-1.png`
- `summary-stage-narrative-1.png`
- `summary-stage-network-composer-1.png`
- `summary-stage-sociogram-1.png`

Each change is the intended whole English attribute-list conjunction and its
resulting table-cell width. Dimensions are unchanged; there are zero changed
pixels outside the six reviewed bands. Literal variable names remain unchanged.
The other 22 PNGs and all 19 JSON stage baselines retain their prior bytes.
The later main integration changes removal-exit accessibility and focus; those
states are absent from the static printed capture surfaces. Final automatic
main CI must still run the normal no-write pixel comparison against this merge.

Inventory and hashes:
`/private/tmp/nc-architect-round2-visual-review/inventory.json` (SHA256
`cf647c8a84d9f848f471e4f9509409a2307426ae97f6ba7d61baae640857fdb7`);
all six before/after bands are in adjacent `contact-1.png`; zero-outside-band
proof is in `outside-bands-proof.json`; adoption pre/post hashes are in
`/private/tmp/nc-architect-round2-adoption-evidence.json`. No baseline PNG was
generated locally. The baseline commit contains only those six approved PNGs
and this app-owned audit.

The stacked manual run 34057907717 runs package checks with
`force_run=true` and `release_app=none`; it intentionally selects zero E2E.
Its Storybook job succeeds, establishing the prior timeout’s diagnosed fix.
The lead is retargeting #1705 to main before the final push so fresh automatic
main-merge-tree checks select the normal policy without another manual dispatch.
Final current-head Codex review and automatic required/native/pixel checks remain
external gates; earlier clean reviews and generation success do not establish
them. The lead retains merge sequencing and final ancestry verification.

### Round-three rule operands and accessible static startup (2026-09-06)

The next completed review identified two reachable gaps, threads
`PRRT_kwDOKqiw4s6fu4JU` and `PRRT_kwDOKqiw4s6fu4JY`. Both have source
corrections, rather than dismissals. The integrated predecessor
`fd856ed1ed3dc72be5afadd797a2f2a2862b64b2` has a fully successful standard
main run [34059080801](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34059080801), including all selected native and pixel jobs.
That result is the integration baseline, not a verdict on these new fixes.

`PreviewText.Value` now uses the subscribed formatter’s whole list parts and
restores original `ValueToken` elements by position. This covers both the real
rule editor and printed summary through their existing shared
`getRuleDisplayOptions` path. Repeated labels retain their own original tokens;
canonical numbers, regular expressions and response values remain literal.
For rich option labels, the already-consumed protocol-builder Markdown adapter
provides displayed text solely for list grammar: emphasis or link syntax must
not hide the initial sound choosing Spanish “y” versus “e”. Original labels
still render through `RenderMarkdown`. No parser, catalog, or protocol data
format was added. Related summary attribute lists already use locale parts;
Codebook’s remaining `usageString` comma join is a sorting accessor whose cell
renders `UsageColumn`, not displayed list prose. Other comma joins identify
technical paths, headers or data rather than this operand surface.

Static `index.html` now exposes a polite status containing the proper name
“Architect” before the entry module or its dependencies finish downloading.
The spinner remains decorative. This follows the already-reviewed Interviewer
startup pattern. Existing document initialization updates the same text node
to shared localized loading guidance; it does not add an English sentence or
another locale negotiator. Main and preview entry initialization share this
helper, and the main entry retains its existing loader fade/removal lifecycle.

| Round-three proof               | Result and exact evidence                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original production regressions | The original source fails all three new rule-list units and the actual Spanish rule-list browser expectation; its held entry-module boot test cannot find an accessible status. `nc-architect-review-round3-{list-red,rule-browser-red,boot-red}.log` under `/private/tmp/`.                                                                                      |
| Focused current units           | 32/32 in three suites: actual default/summary rule rendering, 28 existing rule controls, and persisted-locale startup. `/private/tmp/nc-architect-review-round3-targeted-green.log`.                                                                                                                                                                              |
| In-memory list faults           | Forcing English list parts causes three intended failures with 28 controls passing; using raw Markdown for conjunction selection causes two intended failures with 29 controls passing. `/private/tmp/nc-architect-review-round3-{english-mutation,markdown-mutation}.log`.                                                                                       |
| In-memory boot fault            | Adding `aria-hidden=true` only to the actual HTML response makes the unchanged held-module accessibility assertions fail; the real canonical-document control passes. `/private/tmp/nc-architect-review-round3-boot-mutation-canonical.log`. Production source hashes before/after are identical.                                                                 |
| Real production flow            | 8/8 pass in 9.2 seconds. Held module proves proper-name status before React, then Spanish startup; actual editor and print tokens change ES–EN–GB without modifying stored protocol. Existing six language/preview/resource workflows remain green. `/private/tmp/nc-architect-review-round3-browser-green.log`.                                                  |
| Full units/scripts              | 2,516 pass and three existing todos across 293 files, 284.91 seconds using two workers to bound machine load. `/private/tmp/nc-architect-review-round3-units.log`.                                                                                                                                                                                                |
| Full native E2E                 | 173/173 pass, zero skipped, flaky or unexpected tests, 152.29 seconds. `/private/tmp/nc-architect-review-round3-native.log` and `/private/tmp/nc-architect-review-round3-native-results.json`.                                                                                                                                                                    |
| Cold Storybook                  | 15/15 pass after deleting only Architect’s known `sb-vitest` optimizer cache, 9.06 seconds. An old story expected the comma prefix; it now requires “Family and ” while preserving both original authored-token checks. Its initial one failure/14 controls and final pass are retained in `nc-architect-review-round3-cold-storybook{,-old-list-assertion}.log`. |
| Static/build/catalog gates      | Types including E2E, lint, full repository Knip, formatting, extraction, changeset validation and fresh build/PWA integrity pass. `/private/tmp/nc-architect-review-round3-{types,lint,knip,format,extraction,changesets,build}.log`. All three catalog hashes remain unchanged at 1,825/1,825/37 entries.                                                        |

The lead strengthened the final token-preservation oracle: each current DOM
token is compared with its captured original using identity (`toBe`), after
asserting the complete token count. An in-memory locale-dependent React key
causes both real rendering variants to fail those identity assertions while
29 controls pass, even though their serialized HTML is visually identical.
The unmodified production source passes all 32 focused tests with the stronger
assertions. Evidence is `/private/tmp/nc-architect-review-round3-identity-mutation.log`
and the final `targeted-green.log`. This test-only strengthening followed the
full unit/native run; production, catalog and browser bytes remain unchanged.

The first multi-tab browser attempt correctly failed when the newly opened
summary tab had no active protocol: selection is tab-scoped. Its setup now
opens the existing library entry through the actual home UI before summary
navigation; no assertion was removed or relaxed. The separate initial
comma-only production failure remains recorded.

Visual impact was assessed against the exact existing capture states. Both
canonical cases use the unchanged all-interfaces fixture. A recursive census
of that complete protocol finds 19 stages and zero `filter`, `skipLogic` or
`rules` properties, including nested content. A freshly built browser loads
all 19 printed stage sections and the actual roster attributes, then proves
zero rendered rule operands and a hidden boot loader. Evidence:
`/private/tmp/nc-architect-review-round3-fixture-census.json` and
`/private/tmp/nc-architect-review-round3-canonical-dom.json`. Thus the changed
rule branch appears in none of the 28 existing PNGs, and the static accessible
text is invisible and removed before capture. The lead approved preserving all
28 PNGs and all 19 JSON baselines rather than regenerating unrelated captures.
The classifier’s broader historical branch candidates were already verified
in prior canonical/main checkpoints; this bounded correction changes no
shared package, dependency, global style or asset.

No translation review delta is needed: the only static text is the proper
product name and the loading guidance already comes from reviewed
`commonMessages.loading`. The existing minor app changeset covers these
unreleased feature corrections. The corrected source must receive one normal
push, replies/resolution for both findings, fresh explicit current-head Codex
review and green standard main-merge-tree CI before the lead’s merge. No new
package-only dispatch or local PNG generation substitutes for those gates.

### Final Markdown dialect correction — 2026-09-07

Completed Codex review of `9585a6c663f86cb05aded8714159e8e88d145b1f`
identified one further actionable finding: the grammar-only editor Markdown
adapter did not match the GFM/raw-HTML dialect used to display option labels.
The old adapter causes six new real component assertions to fail, while nine
controls pass. The correction uses `getMarkdownLabelText` beside the shared
`RenderMarkdown` component. Both use the same default GFM/gemoji, raw HTML,
sanitization, allowed elements and unwrapping options. The helper reads the
synchronous renderer's processed React tree; it needs no new dependency, DOM
parser, server renderer or custom Spanish heuristic. An `unknown` child walker
with explicit guards respects the repository's Array.isArray typing.

The helper is restricted to the default label dialect. Custom components,
explicit empty plugin arrays, section tags, wrapper properties and false
unwrapping options retain their existing behavior. The call-site audit found
23 production modules referencing RenderMarkdown; their rendering behavior
is unchanged. The sole grammar-only editor-adapter use moved to this helper.
Architect's option editor, protocol-builder's option editor and RichTextField
retain their intentionally separate editing conversion contract. Original
rule tokens, DOM identity, links, authored markup and stored values remain
unchanged. The existing app changeset covers the new language feature; the
new public library helper has its own minor normal-lane changeset.

Final local verification:

- 43/43 actual rule component assertions and 31/31 shared renderer assertions
  pass. Explicit expected strings and actual DOM text cover strike variants,
  raw/filtered HTML, script stripping, entities, reference and unsafe links,
  image removal, emoji, code, escaped syntax, whitespace, GFM structures and
  custom option controls.
- Five no-write faults fail their intended assertions: old adapter 6 red /
  9 controls; missing GFM 5/26; missing HTML processing 8/23; missing
  sanitization 1/30; missing unwrapping 23/8. Production files are not mutated.
- Both affected Rules Storybook cases pass from a fresh dependency optimizer.
  The preceding full app run passed all 15 stories, 2,516 unit/script cases
  with three existing todos, and 173 native cases; those are prior full-run
  evidence, not claimed as repeated on this correction.
- Four fresh production browser workflows pass after the final PWA build:
  three schema-valid GFM/raw/sanitized HTML option-label variants in the real
  editor and printed summary across ES/EN/GB, plus the held-module startup
  status. Exact emphasis, full list grammar and unchanged persisted protocol
  are positive assertions.
- Architect app/E2E and Fresco UI types, type-aware lint (existing warnings),
  full root Knip, format, extraction, catalog hashes and changeset lanes pass.
  Production build verifies its 101-entry precache, all 24 JavaScript chunks
  and 69 stage-preview assets. A package-manager auto-verification briefly
  recreated this temporary checkout's modules; the frozen offline install
  restored them, and these final gates ran afterward. No lockfile changed.
- All EN/ES/GB catalogs and all 28 PNG/19 JSON baselines remain unchanged.
  The rule branch is absent from the canonical fixture, as the preceding
  recursive census and actual printed DOM establish. Shared renderer
  defaults are unchanged and positive parity tests verify their output; no
  unrelated canonical image regeneration is warranted.
- An independent focused code review found no actionable issues. The last
  full standard CI run, 34061280205 on 9585, passed every selected job. Fresh
  standard CI and a completed clean explicit Codex review of the new final
  head remain the delivery gates before enqueueing.

Detailed temporary logs use the prefix
`/private/tmp/nc-architect-review-round4-`, including `renderer-final.log`,
`app-final.log`, `stories.log`, `browser-final.log`, `build-final.log`,
`types-final.log`, `lint-final.log`, `knip-final.log`, `extraction.log`,
`changesets.log` and each named mutation log.
