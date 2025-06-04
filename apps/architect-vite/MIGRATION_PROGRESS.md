## Overview

This file tracks the progress of migrating architect-vite components from PropTypes to TypeScript.

## Migration Status

### Migration Summary

Total files identified: **230 files** (revised - legacy-ui replaced with external library)
**Completed: 230 files (100%)**
**Remaining: 0 files**

- behaviours/: 2 files → **0 remaining** ✅
- components/: 200 files → **0 remaining** ✅
- lib/legacy-ui/: ~~76 files~~ → **REPLACED WITH @codaco/legacy-ui PACKAGE** ✅
- lib/ProtocolSummary/: 26 files → **0 remaining** ✅
- utils/: 1 file → **0 remaining** ✅

### Completed

- [x] src/components/Form/Fields/NativeSelect.jsx → NativeSelect.tsx (Already done)
- [x] src/behaviours/constrain.jsx → constrain.ts (Utility function with recompose)
- [x] src/behaviours/Zoom.jsx → Zoom.tsx (HOC class component with animations)
- [x] src/utils/tests/Scaffold.js → Scaffold.tsx (Test utility with redux-form)
- [x] src/components/Version.jsx → Version.tsx (No props - simple conversion)
- [x] src/components/Badge.jsx → Badge.tsx (color, children props)
- [x] src/components/Link.jsx → Link.tsx (onClick, children props)
- [x] src/components/IssueAnchor.jsx → IssueAnchor.tsx (fieldName, description props)
- [x] src/components/Disable.jsx → Disable.tsx (disabled, className, children, spread props)
- [x] src/components/Tag.jsx → Tag.tsx (id, color, onClick, selected, light, disabled, children)
- [x] src/components/ExampleForm.jsx → ExampleForm.tsx (show, onBlur, onComplete callbacks)
- [x] src/components/Tip.jsx → Tip.tsx (type enum, icon boolean, children)
- [x] src/components/DialogManager.jsx → DialogManager.tsx (Redux connector, minimal typing)
- [x] src/components/ExternalLink.jsx → ExternalLink.tsx (fixed shell import, href, children)
- [x] src/components/Timeline/InsertButton.jsx → InsertButton.tsx (onClick callback with motion)
- [x] src/components/OrderedList/DeleteButton.jsx → DeleteButton.tsx (onDelete callback with motion)
- [x] src/components/OrderedList/Handle.jsx → Handle.tsx (spread HTML attributes)
- [x] src/components/EditorLayout/Row.jsx → Row.tsx (disabled boolean, children)
- [x] src/components/Timeline/EditStageButton.jsx → EditStageButton.tsx (forwardRef with multiple props)
- [x] src/components/Form/FieldError.jsx → FieldError.tsx (error string, show boolean with conditional styling)
- [x] src/components/Home/Section.jsx → Section.tsx (children, className with motion variants)
- [x] src/components/Home/Sprite.jsx → Sprite.tsx (src, animate object, CSS properties spread)
- [x] src/components/Form/RoundButton.jsx → RoundButton.tsx (icon, content, size enum, button attributes)
- [x] src/components/Screen/CollapsableHeader.jsx → CollapsableHeader.tsx (children, threshold, collapsedState with context)
- [x] src/components/Home/Switch.jsx → Switch.tsx (label, disabled, on, className, onChange with useRef)
- [x] src/components/Loading.jsx → Loading.tsx (isLoading boolean, Redux connected with motion)
- [x] src/components/PreviewNode.jsx → PreviewNode.tsx (nodeTypes object, type string, Redux connected)
- [x] src/components/ToastManager.jsx → ToastManager.tsx (Redux connector for toast state)
- [x] src/components/BooleanChoice.jsx → BooleanChoice.tsx (form, formSelector, changeField with redux-form)
- [x] src/components/ControlBar.jsx → ControlBar.tsx (buttons arrays, motion animations, staggered children)
- [x] src/components/BasicForm.jsx → BasicForm.tsx (form submission with redux-form integration)
- [x] src/components/DetachedField.jsx → DetachedField.tsx (class component with validation, Field API mirroring)
- [x] src/components/ContextualDialog.jsx → ContextualDialog.tsx (portal dialog with Controls/Title sub-components)
- [x] src/components/Editor.jsx → Editor.tsx (complex form editor with Issues, redux-form, render props)
- [x] src/components/Home/ButtonStack.jsx → ButtonStack.tsx (simple children wrapper)
- [x] src/components/Form/Button.jsx → Button.tsx (button with className, type, HTML attributes)
- [x] src/components/Thumbnail/Image.jsx → Image.tsx (image thumbnail with HOC and spread props)
- [x] src/components/Thumbnail/Audio.jsx → Audio.tsx (audio thumbnail with HOC and meta object)
- [x] src/components/Thumbnail/Video.jsx → Video.tsx (video thumbnail with HOC and meta object)
- [x] src/components/Home/LaunchPad.jsx → LaunchPad.tsx (Redux connected component with recent protocols)
- [x] src/components/Home/Group.jsx → Group.tsx (styled container with motion animations)
- [x] src/components/Options/Option.jsx → Option.tsx (form option with validation and HOC)
- [x] src/components/Options/Options.jsx → Options.tsx (field array component with validation)
- [x] src/components/Overview.jsx → Overview.tsx (protocol overview with action buttons)
- [x] src/components/Issues.jsx → Issues.tsx (form validation issues display)
- [x] src/components/RenameVariableControl.jsx → RenameVariableControl.tsx (variable rename dialog)
- [x] src/components/Window.jsx → Window.tsx (modal window frame with portal)
- [x] src/components/Validations/Validation.jsx → Validation.tsx (validation rule component with options)
- [x] src/components/Validations/Validations.jsx → Validations.tsx (validation rules field array)
- [x] src/components/VirtualizedTable.jsx → VirtualizedTable.tsx (react-table virtualized table)
- [x] src/components/AssignAttributes/Attribute.jsx → Attribute.tsx (attribute assignment form field)
- [x] src/components/AssignAttributes/AssignAttributes.jsx → AssignAttributes.tsx (attributes assignment list)
- [x] src/components/Parameters/DatePicker.jsx → DatePicker.tsx (date picker parameters with validation)
- [x] src/components/Parameters/Scalar.jsx → Scalar.tsx (scalar input parameters)
- [x] src/components/Parameters/RelativeDatePicker.jsx → RelativeDatePicker.tsx (relative date picker parameters)
- [x] src/components/Errors/ScreenErrorBoundary.jsx → ScreenErrorBoundary.tsx (error boundary component)
- [x] src/components/Errors/ProtocolSummaryErrorBoundary.jsx → ProtocolSummaryErrorBoundary.tsx (protocol summary error boundary)
- [x] src/components/sections/ValidationSection.jsx → ValidationSection.tsx (validation section with form integration)
- [x] src/components/AssignAttributes/index.jsx → index.tsx (field array container with redux-form)
- [x] src/components/Thumbnail/index.jsx → index.tsx (re-export file)
- [x] src/components/Home/index.jsx → index.tsx (re-export file)
- [x] src/components/Options/index.jsx → index.tsx (re-export file)
- [x] src/components/Home/Home.jsx → Home.tsx (home container with motion variants)
- [x] src/components/Stackable.jsx → Stackable.tsx (class component with HOC and Redux)
- [x] src/components/RecentProtocols.jsx → RecentProtocols.tsx (class component with Redux and animations)
- [x] src/components/ProtocolStack.jsx → ProtocolStack.tsx (protocol display component with Redux)
- [x] src/components/ProtocolControlBar.jsx → ProtocolControlBar.tsx (control bar with Redux hooks)
- [x] src/components/ViewManager/views/App.jsx → App.tsx (simple app view component)
- [x] src/components/sections/Background/Background.jsx → Background.tsx (class component with form fields)
- [x] src/components/sections/Background/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/Form/Form.jsx → Form.tsx (form section with validation and HOCs)
- [x] src/components/sections/Form/FieldPreview.jsx → FieldPreview.tsx (field preview with codebook integration)
- [x] src/components/sections/Form/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/Form/helpers.jsx → helpers.tsx (utility functions with typing)
- [x] src/components/Home/useAppState.jsx → useAppState.tsx (generic hook with TypeScript)
- [x] src/components/sections/Form/FieldFields.jsx → FieldFields.tsx (complex form field component with validation)
- [x] src/components/Screens/AssetsScreen.jsx → AssetsScreen.tsx (assets screen with layout)
- [x] src/components/Screens/screenIndex.jsx → screenIndex.tsx (screen component registry)
- [x] src/components/sections/NameGeneratorRosterPrompts/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/TieStrengthCensusPrompts/helpers.jsx → helpers.tsx (helper functions with type annotations)
- [x] src/components/ViewManager/views/ProtocolSummary.jsx → ProtocolSummary.tsx (protocol summary view)
- [x] src/components/CodeView/index.jsx → index.tsx (re-export file)
- [x] src/components/Grid/index.jsx → index.tsx (re-export file)
- [x] src/components/Grid/helpers.jsx → helpers.tsx (grid utility functions with complete typing)
- [x] src/components/sections/Form/FieldFields.jsx → FieldFields.tsx (prompt fields with complex validation)
- [x] src/components/sections/TieStrengthCensusPrompts/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/Filter.jsx → Filter.tsx (filtering section with Redux integration)
- [x] src/components/sections/SociogramPrompts/utils.jsx → utils.tsx (edge filtering utility with types)
- [x] src/components/sections/TieStrengthCensusPrompts/PromptPreview.tsx (markdown prompt preview)
- [x] src/components/sections/SociogramPrompts/PromptPreview.tsx (markdown prompt preview)
- [x] src/components/sections/SearchOptionsForExternalData.jsx → SearchOptionsForExternalData.tsx (search options with validation)
- [x] src/components/sections/ContentGrid/options.jsx → options.tsx (static configuration options)
- [x] src/components/sections/ContentGrid/index.jsx → index.tsx (re-export file)
- [x] src/components/Form/AutoFileDrop.jsx → AutoFileDrop.tsx (file drop HOC with typing)
- [x] src/components/EditorLayout/index.jsx → index.tsx (re-export file)
- [x] src/components/CodeView/CodeView.jsx → CodeView.tsx (code view modal with motion)
- [x] src/components/Grid/GridItem.jsx → GridItem.tsx (grid item with preview component)
- [x] src/components/EditorLayout/Layout.jsx → Layout.tsx (layout container with HTML attributes)
- [x] src/components/sections/NameGeneratorRosterPrompts/NameGeneratorRosterPrompts.jsx → NameGeneratorRosterPrompts.tsx (editable list with HOCs)
- [x] src/components/sections/TieStrengthCensusPrompts/PromptFields.jsx → PromptFields.tsx (complex prompt fields with form integration)
- [x] src/components/Screens/CodebookScreen.jsx → CodebookScreen.tsx (codebook screen with layout)
- [x] src/components/sections/ContentGrid/ItemPreview.jsx → ItemPreview.tsx (item preview with Redux and asset types)
- [x] src/components/sections/SociogramPrompts/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/SociogramPrompts/selectors.jsx → selectors.tsx (selector functions with typed parameters)
- [x] src/components/sections/TieStrengthCensusPrompts/TieStrengthCensusPrompts.jsx → TieStrengthCensusPrompts.tsx (editable list component with HOCs)
- [x] src/components/AssetBrowser/useExternalDataPreview.jsx → useExternalDataPreview.tsx (hook with typed return tuple)
- [x] src/components/AssetBrowser/Asset.jsx → Asset.tsx (asset component with event handlers and callbacks)
- [x] src/components/sections/SociogramPrompts/SociogramPrompts.jsx → SociogramPrompts.tsx (editable list with HOCs)
- [x] src/components/sections/OneToManyDyadCensus/index.jsx → index.tsx (re-export file)
- [x] src/components/sections/OneToManyDyadCensus/PromptPreview.jsx → PromptPreview.tsx (markdown prompt preview)
- [x] src/components/sections/OneToManyDyadCensus/RemoveAfterConsideration.jsx → RemoveAfterConsideration.tsx (form toggle component with Redux)
- [x] src/components/sections/OneToManyDyadCensus/OneToManyDyadCensusPrompts.jsx → OneToManyDyadCensusPrompts.tsx (editable list with HOCs)
- [x] src/components/sections/SociogramPrompts/PromptFieldsLayout.jsx → PromptFieldsLayout.tsx (layout fields with validation and HOCs)
- [x] src/components/sections/SociogramPrompts/PromptFieldsEdges.jsx → PromptFieldsEdges.tsx (edge display configuration with form integration)
- [x] src/components/Codebook/Tag.jsx → Tag.tsx (simple tag component with conditional styling)
- [x] src/components/Grid/GridManager.jsx → GridManager.tsx (complex grid manager with inline editing and HOCs)
- [x] src/components/Assets/GeoJSON.jsx → GeoJSON.tsx (GeoJSON table component with asset path HOC)
- [x] src/components/Assets/Table.jsx → Table.tsx (sortable table component with react-table)
- [x] src/components/Assets/Network.jsx → Network.tsx (network data table with asset processing)
- [x] src/components/Query/ruleValidator.jsx → ruleValidator.ts (rule validation utility function)
- [x] src/components/Codebook/helpers.jsx → helpers.ts (codebook utility functions with complex typing)
- [x] src/components/Form/Fields/Radio.jsx → Radio.tsx (radio input field with redux-form integration)
- [x] src/components/TypeEditor/index.jsx → index.tsx (HOC connector for type editor)
- [x] src/components/Codebook/VariableList.jsx → VariableList.tsx (sortable variable list with HOC)
- [x] src/components/Query/Rules/PreviewText.jsx → PreviewText.tsx (complex rule preview with multiple subcomponents)
- [x] src/components/Form/ValidatedField.jsx → ValidatedField.tsx (validated field wrapper for redux-form)
- [x] src/components/AssetBrowser/AssetBrowser.jsx → AssetBrowser.tsx (asset browser with external data hooks)
- [x] src/components/Assets/withAssetMeta.jsx → withAssetMeta.tsx (HOC for asset metadata injection)
- [x] src/components/EditableList/withEditHandlers.jsx → withEditHandlers.tsx (HOC for editable list state management)
- [x] src/components/Screen/Screen.jsx → Screen.tsx (modal screen component with motion animations)
- [x] src/components/InlineEditScreen/Form.jsx → Form.tsx (redux-form wrapper for inline editing)
- [x] src/components/enhancers/withCreateEdgeHandler.jsx → withCreateEdgeHandler.tsx (HOC for edge creation handling)
- [x] src/components/Screens/ScreenLink.jsx → ScreenLink.tsx (navigation link for screen routing)
- [x] src/components/sections/ExternalDataSource.jsx → ExternalDataSource.tsx (data source configuration section)
- [x] src/components/sections/MapOptions.jsx → MapOptions.tsx (geospatial map configuration with complex nested defaults)
- [x] src/components/sections/BinSortOrderSection.jsx → BinSortOrderSection.tsx (sorting configuration section with Redux hooks)
- [x] src/components/sections/SkipLogic.jsx → SkipLogic.tsx (skip logic section with dialog confirmation)
- [x] src/components/sections/BucketSortOrderSection.jsx → BucketSortOrderSection.tsx (bucket sorting section with complex defaults)
- [x] src/components/sections/FilteredEdgeType.jsx → FilteredEdgeType.tsx (edge type selection with form reset handling)
- [x] src/components/Form/Fields/InputPreview.jsx → InputPreview.tsx (input field preview component)
- [x] src/components/Form/Fields/TextArea.jsx → TextArea.tsx (textarea field with redux-form integration)
- [x] src/components/Query/Filter.jsx → Filter.tsx (filter component wrapper for rules)
- [x] src/components/Query/Query.jsx → Query.tsx (query component with metadata support)
- [x] src/components/AssetBrowser/index.jsx → index.ts (re-export file)
- [x] src/components/Assets/index.jsx → index.ts (re-export file)
- [x] src/components/Dialogs/index.jsx → index.ts (re-export file)
- [x] src/components/Grid/withEditHandlers.jsx → withEditHandlers.tsx (HOC for grid editing state management)
- [x] src/components/Assets/withAssetPath.jsx → withAssetPath.tsx (HOC for asset path injection)
- [x] src/components/Assets/withAssetUrl.jsx → withAssetUrl.tsx (HOC for asset URL generation)
- [x] src/components/OrderedList/ListItem.jsx → ListItem.tsx (list item with motion animations and controls)
- [x] src/components/Codebook/EgoType.jsx → EgoType.tsx (ego type display with Redux connection)
- [x] src/components/EditableList/index.jsx → index.ts (re-export file)
- [x] src/components/Errors/index.jsx → index.ts (re-export file)
- [x] src/components/Form/index.jsx → index.ts (re-export file)
- [x] src/components/InlineEditScreen/index.jsx → index.ts (re-export file)
- [x] src/components/NewVariableWindow/index.jsx → index.ts (re-export file)
- [x] src/components/OrderedList/index.jsx → index.ts (re-export file)
- [x] src/components/Parameters/index.jsx → index.ts (re-export file)
- [x] src/components/Query/index.jsx → index.ts (re-export file)
- [x] src/components/Screens/index.jsx → index.ts (re-export file)
- [x] src/components/StageEditor/index.jsx → index.ts (re-export file)
- [x] src/components/Timeline/index.jsx → index.ts (re-export file)
- [x] src/components/Codebook/CodebookCategory.jsx → CodebookCategory.tsx (category display component)
- [x] src/components/Dialogs/UnsavedChanges.jsx → UnsavedChanges.tsx (dialog configuration function)
- [x] src/components/Form/withFormSubmitErrors.jsx → withFormSubmitErrors.tsx (HOC for form error injection)
- [x] src/components/Query/Rules/options.jsx → options.ts (static configuration constants)
- [x] src/components/Query/withFieldConnector.jsx → withFieldConnector.tsx (HOC for field prop extraction)
- [x] src/components/sections/QuickAdd/withOptions.jsx → withOptions.tsx (HOC for text variable options)
- [x] src/components/sections/NarrativePresets/selectors.jsx → selectors.ts (narrative variable selectors)
- [x] src/components/sections/NarrativePresets/withPresetProps.jsx → withPresetProps.tsx (HOC for preset state management)
- [x] src/components/sections/TieStrengthCensusPrompts/withCreateEdgeHandler.jsx → withCreateEdgeHandler.tsx (HOC for edge creation)
- [x] src/components/sections/TieStrengthCensusPrompts/withVariableOptions.jsx → withVariableOptions.tsx (HOC for ordinal variable options with lifecycle)
- [x] src/components/sections/CategoricalBinPrompts/withVariableHandlers.jsx → withVariableHandlers.tsx (HOC for variable creation/deletion)
- [x] src/components/sections/CategoricalBinPrompts/withVariableOptions.jsx → withVariableOptions.tsx (HOC for variable options with lifecycle)
- [x] src/components/Grid/withItems.jsx → withItems.tsx (HOC for form item extraction)
- [x] src/components/Query/Rules/defaultRule.jsx → defaultRule.ts (default rule generation utilities)
- [x] src/components/Query/Rules/index.jsx → index.ts (re-export file)
- [x] src/components/Query/Rules/validateRule.jsx → validateRule.ts (rule validation logic)
- [x] src/components/Query/withStoreConnector.jsx → withStoreConnector.tsx (HOC for codebook and dialog injection)
- [x] src/components/Screens/NewStageScreen/index.jsx → index.ts (re-export file)
- [x] src/components/Screens/NewStageScreen/interfaceOptions.jsx → interfaceOptions.ts (interface configuration constants)
- [x] src/components/StageEditor/configuration.jsx → configuration.ts (form name constant)
- [x] src/components/TypeEditor/convert.jsx → convert.ts (protocol format conversion utilities)
- [x] src/components/TypeEditor/getPalette.jsx → getPalette.ts (color palette utilities)
- [x] src/components/TypeEditor/getNewTypeTemplate.jsx → getNewTypeTemplate.ts (type template generation)
- [x] src/components/Validations/index.jsx → index.tsx (validation component with HOC composition)
- [x] src/components/Validations/options.jsx → options.ts (validation configuration constants)
- [x] src/components/Validations/withStoreState.jsx → withStoreState.tsx (HOC for validation state management)
- [x] src/lib/ProtocolSummary/components/AssetBadge.jsx → AssetBadge.tsx (asset display component with linking)
- [x] src/lib/ProtocolSummary/components/Variable.jsx → Variable.tsx (variable pill display with context lookup)
- [x] src/lib/ProtocolSummary/components/Rule.jsx → Rule.tsx (filter rule display with HOC composition)
- [x] src/lib/ProtocolSummary/components/useAssetData.jsx → useAssetData.tsx (asset data hook with network processing)
- [x] src/lib/ProtocolSummary/components/EntityBadge.jsx → EntityBadge.tsx (entity badge with size variants)
- [x] src/lib/ProtocolSummary/components/DualLink.jsx → DualLink.tsx (dual link component for print/screen)
- [x] src/lib/ProtocolSummary/components/Rules.jsx → Rules.tsx (rules list component with join display)
- [x] src/lib/ProtocolSummary/helpers.jsx → helpers.ts (protocol summary utilities)
- [x] src/lib/ProtocolSummary/components/helpers.jsx → helpers.tsx (component utilities with value rendering)
- [x] src/lib/ProtocolSummary/components/SummaryContext.jsx → SummaryContext.tsx (React context with typed provider)
- [x] src/lib/ProtocolSummary/components/MiniTable.jsx → MiniTable.tsx (mini table component with rotation options)
- [x] src/lib/ProtocolSummary/components/Entity.jsx → Entity.tsx (entity display with variables)
- [x] src/lib/ProtocolSummary/components/Cover.jsx → Cover.tsx (protocol summary cover page)
- [x] src/lib/ProtocolSummary/components/Contents.jsx → Contents.tsx (table of contents generation)
- [x] src/lib/ProtocolSummary/components/Variables.jsx → Variables.tsx (variables table with usage tracking)
- [x] src/lib/ProtocolSummary/components/Codebook.jsx → Codebook.tsx (codebook display with entity mapping)
- [x] src/lib/ProtocolSummary/components/AssetManifest.jsx → AssetManifest.tsx (asset manifest display by type)
- [x] src/lib/ProtocolSummary/components/Stages.jsx → Stages.tsx (stages list with configuration)
- [x] src/lib/ProtocolSummary/components/Asset.jsx → Asset.tsx (asset preview with media support)
- [x] src/lib/ProtocolSummary/components/Stage/index.jsx → index.ts (re-export file)
- [x] src/lib/ProtocolSummary/components/Stage/Filter.jsx → Filter.tsx (stage filter display)
- [x] src/lib/ProtocolSummary/components/Stage/SkipLogic.jsx → SkipLogic.tsx (skip logic rules display)
- [x] src/lib/ProtocolSummary/components/Stage/DataSource.jsx → DataSource.tsx (data source configuration)
- [x] src/lib/ProtocolSummary/components/Stage/Behaviours.jsx → Behaviours.tsx (stage behaviors with mapping)
- [x] src/lib/ProtocolSummary/components/Stage/Presets.jsx → Presets.tsx (stage presets with complex nested structure)
- [x] src/lib/ProtocolSummary/components/Stage/InterviewScript.jsx → InterviewScript.tsx (interview script markdown display)
- [x] src/lib/ProtocolSummary/components/Stage/QuickAdd.jsx → QuickAdd.tsx (quick add variable configuration)
- [x] src/lib/ProtocolSummary/components/Stage/PageHeading.jsx → PageHeading.tsx (stage page heading display)
- [x] src/lib/ProtocolSummary/components/Stage/Panels.jsx → Panels.tsx (stage panels with data source mapping)
- [x] src/lib/ProtocolSummary/components/Stage/IntroductionPanel.jsx → IntroductionPanel.tsx (introduction panel with markdown)
- [x] src/lib/ProtocolSummary/components/Stage/Items.jsx → Items.tsx (stage items with asset/text rendering)
- [x] src/lib/ProtocolSummary/components/Stage/Form.jsx → Form.tsx (stage form with field mapping)
- [x] src/lib/ProtocolSummary/components/Stage/Prompts.jsx → Prompts.tsx (stage prompts list with spread props)
- [x] src/lib/ProtocolSummary/components/Stage/Prompt.jsx → Prompt.tsx (complex prompt display with attributes mapping)
- [x] src/lib/ProtocolSummary/components/Stage/Stage.jsx → Stage.tsx (main stage component with comprehensive configuration)
- [x] src/lib/ProtocolSummary/ProtocolSummary.jsx → ProtocolSummary.tsx (main protocol summary component with PDF export)

## Notes on Legacy-UI Migration

- ✅ **lib/legacy-ui/ directory replaced** with external package `@codaco/legacy-ui`
- ✅ **All imports updated** to use `@codaco/legacy-ui/components/*` pattern
- ✅ **5 legacy-ui components migrated** before replacement: Icon, ProgressBar, Expandable, Spinner, Node
- **Remaining migration focuses on components/ and lib/ProtocolSummary/ only**

## Original Migration Instructions

### Migration Rules (Complete Instructions)

**Identify target files**: Look for .js or .jsx files containing defaultProps, propTypes, or PropTypes imports

**Convert file to TypeScript**: Rename .js to .ts and .jsx to .tsx

**Remove PropTypes import**: Delete any line containing import PropTypes from 'prop-types'

**Extract prop types from PropTypes definitions**:

- Convert PropTypes.string → string
- Convert PropTypes.number → number
- Convert PropTypes.bool → boolean
- Convert PropTypes.func → () => void or appropriate function signature
- Convert PropTypes.array → unknown[] or more specific array type
- Convert PropTypes.object → Record<string, unknown> or more specific type
- Convert PropTypes.node → React.ReactNode
- Convert PropTypes.element → React.ReactElement
- Convert PropTypes.oneOf(['a', 'b']) → 'a' | 'b'
- Convert PropTypes.oneOfType([type1, type2]) → type1 | type2
- Convert PropTypes.arrayOf(PropTypes.string) → string[]
- Convert PropTypes.shape({...}) → extract as separate type
- Required props: Remove .isRequired and make non-optional in type
- Optional props: Add ? to the type definition

**Create TypeScript type definitions**:

- Use type keyword, NOT interface
- Name the type as ComponentNameProps
- Place type definition immediately before the component

**Handle function components**:

- Add type annotation to function parameters: function Component({ prop1, prop2 }: ComponentProps)
- Move all defaultProps values to destructuring defaults in function signature
- Delete the Component.defaultProps = {...} assignment completely

**Handle class components**:

- Add type annotation: class Component extends React.Component<ComponentProps>
- Keep static defaultProps = {...} as-is (do not change for class components)
- Remove static propTypes = {...}

**Handle nested object defaults**:

- For simple defaults: Use destructuring with defaults: { config = { theme: 'light' } }
- For complex nested defaults:
  - Create helper function getDefaultConfig() that returns the full default object
  - In component, merge defaults: const finalConfig = { ...getDefaultConfig(), ...config }
  - For deeply nested objects, merge each level

**Handle array defaults**: Use destructuring default: { items = [] }

**Handle function prop defaults**: Use destructuring default: { onClick = () => {} }

**Handle conditional/computed defaults**: Use nullish coalescing: const value = providedValue ?? computeDefault()

**Special type conversions**:

- PropTypes.any → any (but add TODO comment to improve later)
- PropTypes.instanceOf(Class) → InstanceType<typeof Class>
- Custom validators → create custom type or use unknown with runtime validation

**Type naming conventions**:

- Main props type: ComponentNameProps
- Nested object types: ComponentNameConfigProps, ComponentNameItemProps
- Always use PascalCase for type names

**DO NOT**:

- Use interface - always use type
- Leave any PropTypes or defaultProps code for function components
- Change defaultProps for class components
- Use React.FC or React.FunctionComponent
- Import PropTypes anywhere in the migrated file

## Migration Notes

- Following strict type definitions (no interfaces)
- Preserving all default values
- Using ES6 default parameters for function components
- Maintaining runtime validation where critical

## Commands

```bash
# Run tests after migration
pnpm test

# Type check
pnpm typecheck

# Lint check
pnpm lint
```

Last Updated: 2025-01-04
