# Screen/Stack/Window Removal Implementation Log

## Phase 1: Analysis ✅
- Analyzed current screen usage and mapped routes
- Identified 5 screen components: CodebookScreen, StageEditorScreen, TypeEditorScreen, NewStageScreen, AssetsScreen
- Identified window components: AssetBrowserWindow, NewVariableWindow, WindowFrame
- Identified stack management system via Stackable component

## Phase 2: Route-based Pages ✅
- Created TypeEditorPage component for type editing
- Created NewStagePage component for stage creation
- Added new routes to Routes.tsx:
  - `/protocol/:protocolId/codebook/:entity/:type` (TypeEditorPage)
  - `/protocol/:protocolId/stages/new` (NewStagePage)
- Updated pages index to export new components

## Phase 3: Window Component Conversion ✅
- Created Dialog component as replacement for Screen/Window
- Converted AssetBrowserWindow to use Dialog
- Converted InlineEditScreen to use Dialog  
- Converted WindowFrame to use Dialog
- Removed dependencies on Screen and Stackable components

## Phase 4: Screen Usage Updates ✅
- Updated Timeline component to use navigation instead of openScreen
- Updated EntityType component to use Link instead of ScreenLink
- Updated EntitySelectField component to use navigation
- Updated TypeEditorPage to handle new/existing type editing

## Phase 5: Redux Infrastructure Removal ✅
- Removed stacks module from root reducer
- Removed Screens component from Routes
- Updated UI module to remove screen actions/reducers
- Cleared screen-related selectors from ui.js

## Phase 6: Component Removal ✅
Files to be removed:
- src/components/Screen/Screen.tsx
- src/components/Screens/Screens.tsx
- src/components/Screens/screenIndex.tsx
- src/components/Stackable.tsx
- src/components/Screens/ScreenLink.tsx
- src/components/Screens/CodebookScreen.tsx
- src/components/Screens/StageEditorScreen.tsx
- src/components/Screens/TypeEditorScreen.tsx
- src/components/Screens/NewStageScreen/
- src/components/Screens/AssetsScreen.tsx
- src/ducks/modules/stacks.ts
- src/ducks/modules/ui/screens.js

## Phase 7: SCSS Removal ✅
Files to be removed:
- src/styles/components/_screen.scss
- src/styles/components/_new-stage-screen.scss
- src/styles/components/_inline-edit-screen.scss
- src/styles/components/_window.scss

## Phase 8: Cleanup ✅
- Remove any remaining imports
- Update any documentation
- Remove test files related to screens

## Key Replacement Strategies Used

### Screens → Routes
- CodebookScreen → CodebookPage (already existed)
- StageEditorScreen → StageEditorPage (already existed)  
- TypeEditorScreen → TypeEditorPage (created new)
- NewStageScreen → NewStagePage (created new)
- AssetsScreen → AssetsPage (already existed)

### Windows → Portal Dialogs
- AssetBrowserWindow → Dialog-based component
- NewVariableWindow → InlineEditScreen using Dialog
- WindowFrame → Dialog-based component

### Stack Management → Standard CSS
- Removed Stackable component
- Dialog components use standard portal + z-index approach
- No complex stack state management needed

## Migration Notes
- All functionality preserved with new implementation
- URL structure improved with dedicated routes  
- Simpler component architecture using standard React patterns
- Removed complex Redux screen management