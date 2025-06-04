# Redux Modernization Plan for Architect-Vite

## Executive Summary

This document outlines a comprehensive plan to modernize the Redux implementation in the architect-vite application while preserving the existing state shape and maintaining backward compatibility. The modernization focuses on adopting Redux Toolkit best practices, removing legacy dependencies, and improving type safety.

## Current State Analysis

### Redux Setup

- **Store Configuration**: Currently using `@reduxjs/toolkit` v2.8.2 with `configureStore`
- **State Persistence**: Uses `redux-remember` for localStorage persistence
- **Timeline/Undo**: Custom timeline middleware for undo/redo functionality on protocol changes
- **Form State**: Heavy dependency on `redux-form` v8.3.6 (legacy)
- **State Structure**: Well-organized with clear separation of concerns

### Current Dependencies (Redux-related)

- `@reduxjs/toolkit`: v2.8.2 ✅ (modern, keep)
- `redux`: v4.0.5 (legacy, can be removed - RTK includes it)
- `redux-form`: v8.3.6 (legacy, needs migration)
- `redux-logger`: v2.7.4 (legacy version)
- `redux-mock-store`: v1.5.4 (testing)
- `redux-remember`: v5.2.0 (persistence)
- `redux-thunk`: v2.3.0 (legacy, RTK includes it)
- `react-redux`: v9.2.0 ✅ (modern, keep)
- `reselect`: v3.0.0 (legacy version, can be removed - RTK includes it)

### State Modules Status

- ✅ `recentProtocols.ts` - Already modernized with RTK createSlice
- 🔄 `protocol.js` - Legacy reducer with complex sub-reducers
- 🔄 `app.js` - Legacy reducer, simple state management
- 🔄 `dialogs.js` - Legacy reducer
- 🔄 `toasts.js` - Legacy reducer
- 🔄 `stacks.js` - Legacy reducer
- 🔄 `ui.js` - Missing from analysis but likely exists
- 🔄 `form` - Redux-form reducer (major migration needed)

## Modernization Goals

1. **Maintain State Shape**: Preserve existing state structure for backward compatibility
2. **Type Safety**: Add comprehensive TypeScript types throughout
3. **Modern Redux**: Migrate to RTK patterns (createSlice, createAsyncThunk)
4. **Remove Legacy**: Eliminate outdated dependencies and patterns
5. **Performance**: Optimize selectors and reduce boilerplate
6. **Developer Experience**: Improve debugging and development workflow
7. **Correctness**: Ensure best practices are followed, particularly around immutability and state management

## Phase 1: Infrastructure Updates

### 1.1 Dependency Updates

**Remove Legacy Dependencies:**

```bash
pnpm remove redux redux-thunk redux-logger reselect
```

**Update Existing Dependencies:**

```bash
pnpm add redux-logger@latest  # Re-add latest version
```

**New Dependencies (if needed):**

```bash
# Consider adding for enhanced DevTools
pnpm add @reduxjs/toolkit-query  # Only if API calls are needed
```

### 1.2 Store Configuration Improvements

**File**: `src/ducks/store.js` → `src/ducks/store.ts`

**Changes**:

- Remove explicit `redux-thunk` import (included in RTK)
- Update logger to latest version
- Add proper TypeScript types
- Improve middleware configuration
- Add RTK Query setup (if needed)

### 1.3 Root Reducer Migration

**File**: `src/ducks/modules/root.js` → `src/ducks/modules/root.ts`

**Changes**:

- Convert to TypeScript
- Remove `redux` import (use RTK's combineReducers)
- Add proper typing for state shape
- Ensure timeline middleware compatibility

## Phase 2: State Module Migrations

### 2.1 App Module (`app.js` → `app.ts`)

**Current**: Simple key-value state management
**Target**: RTK createSlice with proper typing

**Migration Steps**:

1. Convert to createSlice pattern
2. Add TypeScript interfaces
3. Preserve existing action creators and selectors
4. Update imports throughout codebase

### 2.2 Dialogs Module (`dialogs.js` → `dialogs.ts`)

**Migration Steps**:

1. Analyze current dialog state structure
2. Create TypeScript interfaces for dialog types
3. Convert to createSlice with proper reducers
4. Preserve existing modal/dialog functionality

### 2.3 Toasts Module (`toasts.js` → `toasts.ts`)

**Migration Steps**:

1. Define toast message interfaces
2. Convert to createSlice
3. Maintain existing toast queue functionality
4. Add proper typing for toast types (success, error, info, etc.)

### 2.4 Stacks Module (`stacks.js` → `stacks.ts`)

**Migration Steps**:

1. Understand current stack/screen management
2. Create interfaces for screen/modal stacks
3. Convert to createSlice
4. Preserve navigation functionality

### 2.5 Protocol Module (`protocol.js` → `protocol.ts`)

**Current**: Complex reducer with sub-reducers using `reduceReducers`
**Target**: Maintain complexity while adding type safety

**Migration Steps**:

1. **Preserve Structure**: Keep the `reduceReducers` pattern for sub-modules
2. **Add Types**: Create comprehensive interfaces for protocol state
3. **Sub-reducer Integration**: Ensure `stages`, `codebook`, and `assetManifest` reducers work with RTK
4. **Action Creators**: Convert to RTK action creators while maintaining timeline compatibility
5. **Timeline Middleware**: Ensure timeline middleware works with new actions

**Special Considerations**:

- Protocol module has complex nested state
- Timeline middleware depends on action type patterns (`PROTOCOL/` prefix)
- Sub-reducers must remain compatible
- Protocol validation integration

## Phase 3: Redux-Form Migration

### 3.1 Assessment

**Current Usage**: 107 files using redux-form
**Complexity**: High - forms throughout the application
**Timeline**: This should be a separate major migration

### 3.2 Migration Strategy Options

**Option A: React Hook Form (Recommended)**

- Modern, performant, minimal re-renders
- Better TypeScript support
- Smaller bundle size
- Easy validation integration

**Option B: Formik**

- More similar to redux-form patterns
- Easier migration path
- Still widely used

**Option C: Native React State**

- For simple forms only
- Reduce dependencies

### 3.3 Migration Steps (Separate Epic)

1. **Choose replacement library** (recommend React Hook Form)
2. **Create migration utility functions** to ease transition
3. **Migrate forms incrementally** by complexity/usage
4. **Update validation logic** to work with new form library
5. **Remove redux-form dependency** after all forms migrated

**Note**: This is a major undertaking and should be planned as a separate epic/phase due to the extensive usage (107 files).

## Phase 4: Selector Modernization

### 4.1 Reselect Updates

**Current**: Reselect v3.0.0 (standalone dependency)
**Target**: Use reselect included with @reduxjs/toolkit

### 4.2 Selector Improvements

**Files to Update**:

- `src/selectors/protocol.js` → `src/selectors/protocol.ts`
- `src/selectors/assets.js` → `src/selectors/assets.ts`
- `src/selectors/codebook/index.js` → `src/selectors/codebook/index.ts`
- All other selector files

**Changes**:

1. Update imports to use `import { createSelector } from '@reduxjs/toolkit'`
2. Add proper TypeScript typing
3. Use createSelector with proper typing
4. Optimize selector performance
5. Add memoization where beneficial

## Phase 5: Testing Updates

### 5.1 Test Utilities

**Update**:

- `redux-mock-store` usage in tests
- Add RTK testing utilities
- Update test setup for new store configuration

### 5.2 Test Migrations

**Files to Update**:

- Any tests that mock Redux store
- Tests that depend on action creators
- Integration tests with form state

## Implementation Plan

### Phase 1: Infrastructure

- [ ] Update dependencies
- [ ] Migrate store configuration
- [ ] Update root reducer
- [ ] Ensure all builds pass

### Phase 2: Simple Modules

- [ ] Migrate app module
- [ ] Migrate dialogs module
- [ ] Migrate toasts module
- [ ] Update related tests

### Phase 3: Complex Modules

- [ ] Migrate stacks module
- [ ] Begin protocol module migration
- [ ] Ensure timeline middleware compatibility

### Phase 4: Protocol Module

- [ ] Complete protocol module migration
- [ ] Test all protocol functionality
- [ ] Verify undo/redo works correctly

### Phase 5: Selectors

- [ ] Update reselect imports to use RTK version
- [ ] Migrate all selectors to TypeScript
- [ ] Optimize selector performance

### Phase 6: Testing & Cleanup

- [ ] Update all tests
- [ ] Remove unused dependencies
- [ ] Performance testing
- [ ] Documentation updates

### Future Phase: Redux-Form Migration

- [ ] Plan redux-form replacement
- [ ] Implement form migration strategy
- [ ] Execute form-by-form migration
- [ ] Remove redux-form dependency

## Dependencies to Remove

```json
{
  "remove": [
    "redux",           // Included in RTK
    "redux-thunk",     // Included in RTK
    "reselect"         // Included in RTK
  ],
  "update": [
    "redux-logger"     // Update to latest
  ]
}
```

## Dependencies to Keep

```json
{
  "keep": [
    "@reduxjs/toolkit", // Core modern Redux
    "react-redux",      // React bindings
    "redux-remember",   // Persistence (until replaced)
    "redux-form"        // Keep for now, migrate separately
  ]
}
```

## Risk Mitigation

### High Risks

1. **Timeline Middleware**: Custom undo/redo functionality must be preserved
2. **Form State**: Large number of forms depend on redux-form
3. **State Shape**: Any changes could break existing functionality

### Mitigation Strategies

1. **Incremental Migration**: Migrate one module at a time
2. **Comprehensive Testing**: Test each migration thoroughly
3. **Feature Flags**: Use feature flags for major changes
4. **Rollback Plan**: Maintain ability to rollback changes

### Testing Strategy

1. **Unit Tests**: Test each reducer individually
2. **Integration Tests**: Test store configuration
3. **E2E Tests**: Test critical user workflows
4. **Performance Tests**: Ensure no performance regressions

## Success Criteria

### Technical Metrics

- [ ] All Redux modules use RTK patterns
- [ ] 100% TypeScript coverage for Redux code
- [ ] No legacy Redux dependencies
- [ ] Maintained test coverage
- [ ] No performance regressions

### Functional Metrics

- [ ] All existing functionality works
- [ ] Timeline/undo-redo works correctly
- [ ] Form validation works correctly
- [ ] State persistence works correctly
- [ ] No breaking changes to state shape

## Post-Migration Benefits

1. **Developer Experience**: Better TypeScript support and debugging
2. **Performance**: Improved selector performance and reduced boilerplate
3. **Maintainability**: Modern patterns easier to understand and maintain
4. **Bundle Size**: Smaller bundle size after removing legacy dependencies
5. **Future-Proof**: Modern Redux patterns for future development

## Conclusion

This modernization plan provides a systematic approach to updating the Redux implementation while preserving existing functionality. The phased approach minimizes risk and allows for thorough testing at each step. The redux-form migration is intentionally separated due to its complexity and should be planned as a follow-up project.

The key to success will be maintaining the existing state shape and ensuring all timeline/undo functionality continues to work correctly throughout the migration process.
