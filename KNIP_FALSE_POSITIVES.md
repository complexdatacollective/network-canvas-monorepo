# Knip False Positives Documentation

This document explains why certain exports are reported as "unused" by knip but are actually in use. These are false positives due to limitations in knip's static analysis.

## Summary

- **Total knip reports**: 94 (92 unused exports + 2 unused types)
- **Actual unused**: 0 (all genuinely unused exports have been removed)
- **False positives**: 94 (documented below)

## Categories of False Positives

### 1. Section Components (Used in Configuration Objects)

**Location**: `apps/architect-vite/src/components/sections/**/*.tsx`

**Why false positive**: These components are imported and used in `StageEditor/Interfaces.tsx` in a configuration object that maps interface types to their required sections. Knip's static analysis doesn't trace through this object property access pattern.

**Examples**:
- `Background`, `Form`, `CardDisplayOptions`, `CategoricalBinPrompts`
- `ContentGrid`, `DyadCensusPrompts`, `ExternalDataSource`
- `NameGeneratorPrompts`, `QuickAdd`, `SkipLogicSection`
- And many more section components

**Usage pattern**:
```typescript
export const INTERFACES = {
  NameGenerator: {
    sections: [Form, NameGeneratorPrompts, SkipLogicSection]
  },
  // ...
}
```

### 2. Redux Selectors (Used via connect() and useSelector)

**Location**: `apps/architect-vite/src/selectors/**/*.js`

**Why false positive**: Selectors are used in `mapStateToProps` functions passed to Redux's `connect()` HOC, or in `useSelector` hooks. Knip doesn't trace through Redux's runtime composition.

**Examples**:
- `getStageList`, `getStage`, `getStageIndex`
- `getNetworkAssets`, `getExperiments`
- `getHasUnsavedChanges`, `getIsProtocolValid`, `getTimelineLocus`
- `getOptionsForVariableSelector`

**Usage pattern**:
```typescript
const mapStateToProps = (state) => ({
  stageList: getStageList(state),
  // ...
});
export default connect(mapStateToProps)(Component);
```

### 3. Validation Functions (Used via Dynamic Lookup)

**Location**: `apps/architect-vite/src/utils/validations.js`

**Why false positive**: These functions are referenced by name as strings in validation configuration objects, then looked up dynamically at runtime.

**Examples**:
- `requiredAcceptsZero`, `requiredAcceptsNull`
- `positiveNumber`, `uniqueArrayAttribute`
- `ISODate`, `allowedNMToken`, `validRegExp`

**Usage pattern**:
```typescript
// In a field configuration:
{ validation: { requiredAcceptsZero: true, positiveNumber: true } }

// Runtime lookup:
const validationFns = import('./validations.js');
const validate = validationFns[validationName];
```

### 4. Query Components (Used via Barrel File Re-exports)

**Location**: `apps/architect-vite/src/components/Query/**/*.tsx`

**Why false positive**: Components like `Filter`, `Query`, and `Rules` are exported from their individual files and re-exported through `Query/index.ts`. Other parts of the app import from `Query/index.ts`, not directly from the component files. Knip sees the individual file exports as unused because it doesn't understand the barrel file pattern.

**Examples**:
- `Filter` (from Filter.tsx) - re-exported and used via `Query/index.ts`
- `Query` (from Query.tsx) - re-exported and used via `Query/index.ts`
- `Rules`, `operators` (from Rules directory) - internal to Query components
- `OptionItem` types (from EditEgoRule, EditEntityRule) - internal type definitions

**Usage pattern**:
```typescript
// Query/index.ts re-exports
export { default as Filter } from "./Filter";
export { default as Query } from "./Query";

// Used in sections/Filter.tsx
import { Filter as FilterQuery } from "~/components/Query";
```

### 5. Legacy UI Dialog Components (Used via Aggregator Pattern)

**Location**: `apps/architect-vite/src/lib/legacy-ui/components/Dialog/*.tsx`

**Why false positive**: Individual dialog components (`Confirm`, `Notice`, `Warning`, etc.) are imported by `Dialogs.tsx` which exports them as a unified interface. The app uses `Dialogs.tsx`, not the individual components.

**Examples**:
- `Confirm`, `Dialog`, `ErrorDialog`, `Notice`
- `SimpleDialog`, `Warning`

**Usage pattern**:
```typescript
// Dialogs.tsx imports all individual dialogs
import Confirm from './Confirm';
import Notice from './Notice';
// ... exports them in an aggregated way

// Components use Dialogs.tsx
import Dialogs from '~/lib/legacy-ui/components/Dialogs';
```

### 6. Configuration Exports (Used in Config Files)

**Location**: `apps/architect-vite/src/config/*.js`

**Why false positive**: Configuration constants are used throughout the app in object literals, switch statements, and other non-import contexts.

**Examples**:
- `VARIABLE_TYPES`, `COMPONENTS`, `VARIABLE_TYPES_COMPONENTS`
- `VARIABLE_TYPES_WITH_OPTIONS`, `INITIAL_VALUES`
- `LABEL_VARIABLE_TYPES`

**Usage pattern**:
```typescript
// Accessed as object properties
import { VARIABLE_TYPES } from '~/config/variables';
const type = VARIABLE_TYPES.text;
```

### 7. Redux Infrastructure Exports

**Location**: `apps/architect-vite/src/ducks/modules/**/*.ts`

**Why false positive**: Redux modules export `actionTypes`, `actionCreators`, `selectors`, and `test` objects that are used by the Redux store configuration and test files.

**Examples**:
- `actionTypes` objects (used for action type constants)
- `actionCreators` objects (used with `bindActionCreators`)
- `selectors` objects (used for state selection)
- `test` objects (used to expose actions for testing)

### 8. Async Redux Thunks (Used Internally)

**Location**: `apps/architect-vite/src/ducks/modules/protocol/*.ts`

**Why false positive**: Async thunk functions are wrapped by `actionCreators` and not imported directly. They're used internally by the Redux infrastructure.

**Examples**:
- `createTypeAsync`, `updateTypeAsync`, `deleteTypeAsync`
- `createVariableAsync`, `updateVariableAsync`, `deleteVariableAsync`
- `importAssetAsync`

**Usage pattern**:
```typescript
// Thunk definition
export const createTypeAsync = createAsyncThunk(...);

// Wrapped in actionCreators
export const actionCreators = {
  createType: createTypeAsync,
  // ...
};

// Used via actionCreators
dispatch(actionCreators.createType(data));
```

### 9. Test-Only Exports

**Location**: Various Redux modules

**Why false positive**: Some exports are specifically for testing (like `UnconnectedTypeEditor`) and are imported by test files, which knip may not analyze.

**Examples**:
- `UnconnectedTypeEditor`
- Various `test` objects in Redux modules

### 10. Component Exports for Testing

**Location**: Various component files

**Why false positive**: Default exports or named exports that are used in test files or by parent components via non-standard import patterns.

**Examples**:
- Default exports from `optionGetters.tsx` files
- `ImageThumbnail`, `VideoThumbnail`

## Recommendations

1. **Do NOT remove these exports** - They are all actively used despite knip reporting them as unused

2. **Configure knip** - Consider adding these patterns to `.kniprc.json` to suppress false positives:
   ```json
   {
     "ignore": [
       "apps/architect-vite/src/components/sections/**/*",
       "apps/architect-vite/src/selectors/**/*",
       "apps/architect-vite/src/utils/validations.js",
       "apps/architect-vite/src/config/**/*"
     ]
   }
   ```

3. **Update this document** - If you identify additional false positives or genuinely unused exports, update this document accordingly

## What Was Actually Removed

During the knip cleanup process, we successfully removed:
- **25 unused files** (completely unused components and utilities, excluding Query components which were initially deleted but then restored)
- **176 genuinely unused exports** (redundant exports, dead code, etc.)
- **34 unused exported types** (type exports that were never imported)

The remaining 94 "unused" exports and types are all false positives that should be kept.

## Note on Query Components

Initially, the Query component files (Filter.tsx, Query.tsx, and Rules directory) were incorrectly deleted by an automated sub-agent. These have been restored as they are actively used through barrel file re-exports in `Query/index.ts`. This highlights the importance of manual verification even when using automated tools.
