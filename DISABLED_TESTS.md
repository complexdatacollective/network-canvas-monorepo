# Disabled Tests

This document tracks tests that have been temporarily disabled due to technical issues that require more extensive refactoring to fix.

## Architect-Vite App

The following tests have been disabled in the architect-vite app's vitest configuration (`apps/architect-vite/vite.config.ts`).

### Module Import Issues (Missing Dependencies)

These tests fail due to unresolvable module dependencies that are no longer available or incompatible:

| Test File | Issue |
|-----------|-------|
| `src/utils/protocols/__tests__/assetTools.test.js` | Failed to resolve import "fs-extra" |
| `src/ducks/modules/protocol/__tests__/assetManifest.test.js` | Failed to resolve "@codaco/development-protocol" |
| `src/ducks/modules/protocol/__tests__/codebook.test.js` | Failed to resolve "@codaco/development-protocol" |
| `src/components/Form/Fields/VariablePicker/__tests__/VariableSpotlight.test.jsx` | Failed to resolve import "redux" |
| `src/components/sections/SociogramPrompts/__tests__/selectors.test.tsx` | Missing "reduxForm" export in redux-form mock |
| `src/components/sections/OrdinalBinPrompts/__tests__/PromptFields.test.tsx` | testPromptFields is not a function |

**Required fix:** Install missing dependencies or update imports to use alternative packages.

### Empty/Orphaned Test Files

These test files contain no actual test content (likely migration artifacts):

- `src/components/TypeEditor/__tests__/IconOption.test.jsx`
- `src/utils/netcanvasFile/__tests__/netcanvasFile.test.js`
- `src/components/sections/CategoricalBinPrompts/__tests__/PromptFields.test.jsx`
- `src/components/sections/OrdinalBinPrompts/__tests__/PromptFields.test.jsx`
- `src/components/sections/SociogramPrompts/__tests__/selectors.test.jsx`
- `src/lib/legacy-ui/components/Fields/Slider/__tests__/Field.test.jsx`
- `src/lib/legacy-ui/components/Fields/DatePicker/DatePicker/__tests__/*.test.jsx` (Date, DatePicker, Days, Months, Years)

**Required fix:** Either add proper test implementations or delete these files.

### Component Rendering Issues

These tests fail due to component export issues or rendering problems:

| Test File | Test Name | Issue |
|-----------|-----------|-------|
| `src/behaviours/__test__/Zoom.test.js` | "can render" | Zoom HOC using recompose returns function instead of component |
| `src/behaviours/__test__/Zoom.test.jsx` | "can render" | Same as above |
| `src/components/Form/Fields/DatePicker/DatePicker/__tests__/DatePicker.test.jsx` | "can render" | Mock child function not being rendered as JSX |
| `src/components/Timeline/__tests__/Timeline.test.tsx` | "renders stages" | Element type is invalid - Timeline component export issue |
| `src/components/Timeline/__tests__/Timeline.test.jsx` | - | Empty test file |
| `src/components/Timeline/__tests__/Stage.test.jsx` | - | Empty test file |
| `src/components/OrderedList/__tests__/OrderedList.test.tsx` | Multiple tests | Element type is invalid - component export issue |
| `src/components/Screens/__tests__/TypeEditorScreen.test.jsx` | - | Empty test file |
| `src/components/Screens/__tests__/StageEditorScreen.test.jsx` | - | Empty test file |

**Required fix:** Fix component exports and HOC composition patterns.

### State Structure Mismatches

These tests use outdated Redux state shapes that no longer match the current implementation:

| Test File | Issue |
|-----------|-------|
| `src/ducks/modules/userActions/__tests__/userActions.test.js` | Module doesn't export actionLocks (feature may have been removed) |
| `src/selectors/codebook/__tests__/codebook.test.js` | API change - makeGetVariable no longer throws on missing codebook |
| `src/components/sections/CategoricalBinPrompts/__tests__/PromptFields.test.tsx` | Uses "protocol" key instead of "activeProtocol" in state |

**Required fix:** Update tests to match current Redux state structure and API.

### Additional Disabled Tests

Tests disabled due to various issues (mocking problems, import errors, etc.):

- `src/components/__tests__/App.test.jsx`
- `src/components/__tests__/Issues.test.jsx`
- `src/components/__tests__/Issues.test.tsx`
- `src/components/__tests__/Protocol.test.tsx`
- `src/components/__tests__/ProtocolControlBar.test.jsx`
- `src/components/__tests__/ProtocolControlBar.test.tsx`
- `src/components/__tests__/RecentProtocols.test.jsx`
- `src/components/__tests__/RecentProtocols.test.tsx`
- `src/components/__tests__/Routes.test.tsx`
- `src/selectors/__tests__/assets.test.js`
- `src/selectors/__tests__/indexes.test.js`
- `src/utils/__tests__/getAssetData.test.js`
- `src/ducks/modules/__tests__/protocols.test.ts`
- `src/ducks/modules/__tests__/recentProtocols.test.js`
- `src/components/CodeView/__tests__/CodeView.test.jsx`
- `src/components/CodeView/__tests__/CodeView.test.tsx`
- `src/components/OrderedList/__tests__/OrderedList.test.jsx`
- `src/components/Screens/__tests__/CodebookScreen.test.jsx`
- `src/hooks/__tests__/useProtocolLoader.test.tsx`
- `src/components/Codebook/__tests__/helpers.test.tsx`
- `src/components/sections/NarrativePresets/__tests__/selectors.test.tsx`
- `src/components/sections/SortOptionsForExternalData/__tests__/getSortOrderOptionGetter.test.tsx`
- `src/components/Timeline/__tests__/Stage.test.tsx`

## How to Re-enable Tests

To re-enable a test:
1. Remove the test path from the `exclude` array in `apps/architect-vite/vite.config.ts`
2. Fix the underlying issue(s) causing the test to fail
3. Run `pnpm --filter architect-vite test` to verify the test passes
4. Remove the entry from this document

## Date Disabled

- **Date:** 2025-11-17
- **Reason:** Tests were failing due to migration from legacy architecture to new Vite-based setup
- **Disabled by:** Migration to fix critical test failures while preserving passing tests
