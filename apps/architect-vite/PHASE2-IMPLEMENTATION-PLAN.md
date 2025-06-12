# Phase 2 Implementation Plan - Browser-Native Navigation & Screen Removal

## Overview

Phase 2 transforms the app from a modal/overlay-based system to a fully route-based navigation system. This involves:

1. Adding new URL routes for all major app sections
2. Converting modal/screen components to full-page route components
3. Removing the extensive screen/modal overlay system
4. Implementing browser-native navigation patterns

## New Routes to Implement

### Core Protocol Routes

- `/protocol/{protocolId}/assets` - Asset management interface
- `/protocol/{protocolId}/codebook` - Codebook management interface
- `/protocol/{protocolId}/summary` - Protocol summary interface
- `/protocol/{protocolId}/stages/{stageId}` - Stage editor interface
- `/protocol/{protocolId}/stages/{stageId}/prompts` - Prompt editor interface

### Potential Additional Routes (to be identified)

- Any other modal/screen uses that should become routes

## Implementation Strategy

### Phase 2A: Route Infrastructure & Core Routes

1. Update routing system to support nested routes
2. Implement basic asset management route
3. Implement basic codebook management route
4. Implement basic protocol summary route
5. Test navigation between routes

### Phase 2B: Stage Editor Conversion

1. Convert StageEditor from modal to full-page component
2. Implement stage editor route
3. Implement prompt editor route
4. Update stage navigation to use URLs

### Phase 2C: Component Refactoring & Cleanup

1. Remove modal/overlay dependencies from converted components
2. Update styling for full-page layouts
3. Refactor components following CLAUDE.md best practices
4. Remove unused modal/screen components

## Detailed Task Breakdown

### Task Group 1: Route Infrastructure (Priority: High)

#### Task 1.1: Update Routing System

**Files to modify:**

- `src/components/Routes.tsx`
- `src/components/Protocol.tsx`

**Actions:**

- [ ] Add support for nested protocol routes with catch-all patterns
- [ ] Implement route parameter extraction for protocolId, stageId
- [ ] Add route guards to ensure protocol exists before rendering routes
- [ ] Test route navigation and parameter passing

#### Task 1.2: Asset Management Route

**Files to modify:**

- `src/components/Routes.tsx`
- `src/components/AssetBrowser/AssetBrowserWindow.tsx` (convert to page)
- Create: `src/components/pages/AssetsPage.tsx`

**Actions:**

- [ ] Create AssetsPage component using AssetBrowserWindow as base
- [ ] Remove modal/window styling and convert to full-page layout
- [ ] Add route handler in Routes.tsx
- [ ] Implement navigation to/from assets page
- [ ] Test asset management functionality in new route

#### Task 1.3: Codebook Management Route

**Files to modify:**

- `src/components/Routes.tsx`
- `src/components/Screens/CodebookScreen.tsx` (convert to page)
- Create: `src/components/pages/CodebookPage.tsx`

**Actions:**

- [ ] Create CodebookPage component using CodebookScreen as base
- [ ] Remove screen-specific dependencies and styling
- [ ] Add route handler in Routes.tsx
- [ ] Implement navigation to/from codebook page
- [ ] Test codebook functionality in new route

#### Task 1.4: Protocol Summary Route

**Files to modify:**

- `src/components/Routes.tsx`
- `src/lib/ProtocolSummary/ProtocolSummary.tsx` (convert to page)
- Create: `src/components/pages/SummaryPage.tsx`

**Actions:**

- [ ] Create SummaryPage component using ProtocolSummary as base
- [ ] Remove any modal/screen dependencies
- [ ] Add route handler in Routes.tsx
- [ ] Implement navigation to/from summary page
- [ ] Test summary functionality in new route

### Task Group 2: Stage Editor Conversion (Priority: High)

#### Task 2.1: Analyze Current Stage Editor System

**Files to analyze:**

- `src/components/StageEditor/StageEditor.tsx`
- `src/components/Screens/StageEditorScreen.tsx`
- `src/components/Screen/EditorScreen.tsx`
- Navigation patterns from Overview/Timeline components

**Actions:**

- [ ] Document current stage editor modal system
- [ ] Identify all entry points to stage editor
- [ ] Map out current stage editor component hierarchy
- [ ] Identify dependencies on screen/modal system

#### Task 2.2: Create Stage Editor Page Component

**Files to create/modify:**

- Create: `src/components/pages/StageEditorPage.tsx`
- `src/components/StageEditor/StageEditor.tsx` (refactor)
- `src/components/Routes.tsx`

**Actions:**

- [ ] Create StageEditorPage as full-page wrapper
- [ ] Refactor StageEditor to work without screen dependencies
- [ ] Add route handler for `/protocol/{protocolId}/stages/{stageId}`
- [ ] Implement stage parameter extraction and validation
- [ ] Test stage editor in route context

#### Task 2.3: Create Prompt Editor Route

**Files to analyze/modify:**

- Identify current prompt editing components/modals
- Create: `src/components/pages/PromptEditorPage.tsx`
- `src/components/Routes.tsx`

**Actions:**

- [ ] Identify how prompts are currently edited (likely in modals)
- [ ] Create PromptEditorPage component
- [ ] Add route handler for `/protocol/{protocolId}/stages/{stageId}/prompts`
- [ ] Implement prompt editing functionality in route
- [ ] Test prompt editing in new route

### Task Group 3: Navigation Updates (Priority: Medium)

#### Task 3.1: Update Timeline Navigation

**Files to modify:**

- `src/components/Timeline/Timeline.tsx`
- `src/components/Timeline/Stage.tsx`
- `src/components/Timeline/EditStageButton.tsx`

**Actions:**

- [ ] Replace modal-based stage editing with route navigation
- [ ] Update EditStageButton to navigate to stage editor route
- [ ] Remove dependencies on screen/modal actions
- [ ] Test timeline navigation to stage editor

#### Task 3.2: Update Overview Navigation

**Files to modify:**

- `src/components/Overview.tsx`
- Any buttons/links that open modals

**Actions:**

- [ ] Replace modal-based navigation with route navigation
- [ ] Add navigation buttons for assets, codebook, summary pages
- [ ] Remove dependencies on screen/modal actions
- [ ] Test overview navigation to new routes

### Task Group 4: Component Refactoring (Priority: Medium)

#### Task 4.1: Remove Screen Dependencies

**Files to modify:**

- `src/components/AssetBrowser/AssetBrowserWindow.tsx`
- `src/components/Screens/CodebookScreen.tsx`
- `src/components/Screens/StageEditorScreen.tsx`
- Any other components that use screen system

**Actions:**

- [ ] Remove Window/Screen wrapper components
- [ ] Update component styling for full-page layouts
- [ ] Remove portal/overlay rendering logic
- [ ] Convert to standard component exports

#### Task 4.2: Apply CLAUDE.md Best Practices

**Files to refactor:**

- All components converted in previous tasks

**Actions:**

- [ ] Convert to TypeScript where needed
- [ ] Remove HOCs and replace with hooks where possible
- [ ] Apply Tailwind styling (remove SCSS where possible)
- [ ] Use functional components with hooks
- [ ] Follow path alias conventions

### Task Group 5: Testing & Cleanup (Priority: Low)

#### Task 5.1: Add Route Tests

**Files to create:**

- `src/components/pages/__tests__/AssetsPage.test.tsx`
- `src/components/pages/__tests__/CodebookPage.test.tsx`
- `src/components/pages/__tests__/SummaryPage.test.tsx`
- `src/components/pages/__tests__/StageEditorPage.test.tsx`
- Update: `src/components/__tests__/Routes.test.tsx`

**Actions:**

- [ ] Test route rendering and navigation
- [ ] Test protocol parameter extraction
- [ ] Test component functionality in route context
- [ ] Test edge cases (invalid IDs, missing protocols)

#### Task 5.2: Remove Unused Components

**Files to analyze/remove:**

- Components that are only used for modal/screen system
- Wrapper components that are no longer needed

**Actions:**

- [ ] Identify components only used by modal system
- [ ] Remove unused screen/modal wrapper components
- [ ] Clean up imports and exports
- [ ] Remove unused CSS/SCSS files

## Progress Tracking

### Task Status Legend

- [ ] Not Started
- 🔄 In Progress  
- ✅ Complete
- ❌ Blocked/Issue

## Implementation Summary (as of 2025-01-10)

### ✅ Major Accomplishments

**Phase 2A: Route Infrastructure & Core Routes (COMPLETE)**

1. **Routing System Updated**:
   - Added nested protocol routes: `/protocol/{protocolId}/assets`, `/protocol/{protocolId}/codebook`, `/protocol/{protocolId}/summary`, `/protocol/{protocolId}/stages/{stageId}`
   - Implemented protocol loading middleware with `useProtocolLoader` hook
   - Added route parameter extraction and validation

2. **Asset Management Route**:
   - Created `AssetsPage.tsx` component using existing `AssetBrowser`
   - Converted from modal to full-page layout
   - Implemented navigation from Overview page

3. **Codebook Management Route**:
   - Created `CodebookPage.tsx` component using existing `Codebook`
   - Fixed Redux selector issues (`isUsed` array handling)
   - Implemented full-page codebook management

4. **Protocol Summary Route**:
   - Created `SummaryPage.tsx` component using existing `ProtocolSummary`
   - **Removed all Node.js/Electron dependencies** for web compatibility
   - Converted PDF export to browser print functionality
   - Fixed asset handling for web-based approach

**Phase 2B: Stage Editor Conversion (COMPLETE)**

1. **Stage Editor Analysis & Implementation**:
   - Created `StageEditorPage.tsx` as full-page stage editor
   - Removed locus from URL per user requirement (kept in Redux state)
   - Implemented form state management with proper navigation
   - Fixed timeline selectors for new Redux state structure

2. **Navigation Updates**:
   - Updated Timeline component to use route navigation instead of modals
   - Updated Overview component with route-based navigation buttons
   - Removed all `openScreen` modal dependencies

**Phase 2C: Web Compatibility & Bug Fixes (MOSTLY COMPLETE)**

1. **Web App Migration**:
   - **Removed all Node.js dependencies**: path, fs, Electron APIs
   - **Replaced asset:// protocol** with web-compatible `/assets/` paths
   - Added placeholder implementations for future remote asset service
   - Fixed browser print functionality for protocol summaries

2. **React Compliance & Performance**:
   - **Fixed React key warnings**: Unique keys for Stage variables and Rules components
   - **Fixed event listener cleanup**: Proper ref handling to prevent null errors
   - **Added accessibility improvements**: Track elements for audio/video
   - **TypeScript improvements**: Better type safety for refs and state

3. **Component Modernization**:
   - Updated components to use React hooks instead of HOCs where possible
   - Applied TypeScript to new page components
   - Improved error handling and edge cases

### 🔄 In Progress

**Task 4.2: Apply CLAUDE.md Best Practices** - Ongoing modernization of components

### 📋 Remaining Tasks

**Task 2.3: Create Prompt Editor Route** - Future enhancement for granular prompt editing

**Task 5.1: Add Route Tests** - Comprehensive test coverage for new routes

**Task 5.2: Remove Unused Components** - Cleanup of legacy modal/screen components

### 🎯 Current Status

**Phase 2 is functionally COMPLETE**. All major routes are working:

- ✅ Asset management accessible via `/protocol/{id}/assets`
- ✅ Codebook management accessible via `/protocol/{id}/codebook`  
- ✅ Protocol summary accessible via `/protocol/{id}/summary`
- ✅ Stage editor accessible via `/protocol/{id}/stages/{stageId}`
- ✅ Browser-native navigation with back/forward buttons
- ✅ Deep linking support for all routes
- ✅ Web-compatible (no Node.js/Electron dependencies)

### 🐛 Issues Resolved

1. **Timeline loading errors** - Fixed protocol state selectors
2. **Codebook form errors** - Fixed array handling in selectors  
3. **Node.js module errors** - Removed all Node/Electron dependencies
4. **Asset protocol errors** - Replaced custom `asset://` with web paths
5. **React key warnings** - Added unique keys for all mapped elements
6. **Event listener cleanup** - Fixed null ref issues in Asset component
7. **TypeScript errors** - Improved type safety for media elements

### Phase 2A Progress: Route Infrastructure & Core Routes

- ✅ **Task 1.1**: Update Routing System
- ✅ **Task 1.2**: Asset Management Route
- ✅ **Task 1.3**: Codebook Management Route
- ✅ **Task 1.4**: Protocol Summary Route

### Phase 2B Progress: Stage Editor Conversion

- ✅ **Task 2.1**: Analyze Current Stage Editor System
- ✅ **Task 2.2**: Create Stage Editor Page Component

### Phase 2C Progress: Component Refactoring & Cleanup

- ✅ **Task 3.1**: Update Timeline Navigation
- ✅ **Task 3.2**: Update Overview Navigation
- ✅ **Task 4.1**: Remove Screen Dependencies
- 🔄 **Task 4.2**: Apply CLAUDE.md Best Practices
- [ ] **Task 5.1**: Add Route Tests
- [ ] **Task 5.2**: Remove Unused Components

## Key Decisions & Notes

### Routing Strategy

- Using wouter's existing pattern with catch-all routes for protocol sections
- Maintaining backward compatibility where possible during transition
- Route parameters will be extracted and validated before component rendering

### Component Strategy

- Convert modal/screen components to standalone page components
- Maintain existing component logic but remove screen/modal dependencies
- Apply modern React patterns (hooks, TypeScript, Tailwind)

### Navigation Strategy

- Replace all modal-based navigation with route-based navigation
- Use browser's native back/forward buttons
- Maintain current user experience while enabling URL-based deep linking

## Dependencies & Considerations

### External Dependencies

- wouter routing (already in use)
- Framer Motion for route transitions (if needed)
- Existing Redux store structure (from Phase 1)

### Browser Compatibility

- Modern browsers with History API support
- URL-based navigation for all major features
- Deep linking support for all routes

### Testing Strategy

- Route-based testing using React Testing Library
- Integration tests for navigation flows
- Component tests for converted page components

## Success Criteria

1. **All major app sections accessible via URL** - Users can bookmark and share links to specific protocol sections
2. **No modal/overlay navigation** - All navigation uses browser-native routing
3. **Stage editor works as full page** - Stage editing no longer requires modals
4. **Backward compatible during transition** - Existing functionality preserved during refactor
5. **Improved maintainability** - Components follow CLAUDE.md best practices
6. **All tests passing** - New route-based tests validate functionality

## Risk Mitigation

### Risk: Breaking existing functionality during conversion

**Mitigation**: Convert one route at a time, maintain parallel functionality until fully tested

### Risk: Complex component dependencies on modal system

**Mitigation**: Thorough analysis phase before conversion, gradual refactoring approach

### Risk: Styling issues when converting from modal to full-page

**Mitigation**: Dedicated styling review and update phase for each converted component

### Risk: URL state management complexity

**Mitigation**: Use existing Redux store for state, URLs only for navigation parameters

---

**This plan provides a structured approach to Phase 2, with clear tasks, progress tracking, and risk mitigation strategies. Each task can be completed incrementally while maintaining a working application.**
