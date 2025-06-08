# Phase 1 Implementation Plan: Redux Store Refactoring

## Overview

This plan details the refactoring of the Redux store to better represent the current protocol being edited or viewed, and implements URL-based protocol routing.

## Goals

1. Rename `recentProtocols` to `protocols` to serve as a datastore of all opened/created protocols
2. Rename `protocol` to reflect that it represents the current protocol being edited/viewed
3. Implement `/protocol/{protocolId}` routing to load protocols from the Redux store

## Key Decisions (Resolved)

1. **Protocol IDs**: Generate IDs based on a hash of the protocol.json content
   - This ensures consistent IDs for the same protocol
   - Allows detection of duplicate protocols
   - Stable across sessions

2. **Current Protocol Naming**: Use `activeProtocol`
   - Clear indication that this is the currently active/edited protocol

3. **Data Persistence**: Full protocol data persistence
   - Since this will be a web app with no filesystem access
   - All protocol data must be stored in Redux/localStorage
   - No lazy loading from disk possible

## Implementation Steps

### Step 1: Create New Redux Modules

1. Create `protocols.ts` module (renamed from `recentProtocols.ts`)
   - Extend data structure to include full protocol data and unique IDs
   - Add actions for adding, updating, removing protocols
   - Add selectors for getting protocols by ID

2. Create `activeProtocol.ts` module (renamed from `protocol.ts`)
   - Maintain existing functionality
   - Update to load protocol data from `protocols` store
   - Keep timeline middleware integration

### Step 2: Update Routing

1. Modify `Routes.tsx` to support parameterized routes:

   ```tsx
   <Route path="/protocol/:protocolId" component={Protocol} />
   ```

2. Create `useProtocolLoader` hook to:
   - Read protocolId from route params
   - Load protocol from Redux store
   - Handle missing/invalid protocol IDs

### Step 3: Update Protocol Loading Flow

1. Modify `openNetcanvas` action to:
   - Generate ID by hashing the protocol JSON content
   - Store full protocol in `protocols` store with generated ID
   - Set as active protocol
   - Navigate to `/protocol/{protocolId}`
   - Handle protocol imports (no file paths in web app)

2. Update components:
   - `ProtocolStack`: Navigate to protocol by ID
   - `LaunchPad`: Display protocols from new store
   - `Protocol`: Use route params to determine which protocol to display

### Step 4: Update Selectors and Actions

1. Update all components using old selectors
2. Replace old action dispatches with new ones
3. Update type definitions

### Step 5: Testing

1. Write tests for new Redux modules:
   - `protocols.test.ts`
   - `activeProtocol.test.ts`

2. Write tests for routing:
   - Protocol loading by ID
   - Invalid ID handling
   - Navigation between protocols

3. Write integration tests:
   - Test component integration with new stores
   - Test URL-based protocol loading

## Files to Modify

### Redux Modules

- [x] Create `src/ducks/modules/protocols.ts` (from recentProtocols.ts)
- [x] Create `src/ducks/modules/activeProtocol.ts` (from protocol.ts)
- [x] Update `src/ducks/modules/root.ts`
- [x] Remove `src/ducks/modules/recentProtocols.ts`
- [x] Remove `src/ducks/modules/protocol.ts`
- [x] Remove `src/ducks/modules/session.js`
- [x] Remove old `src/ducks/modules/userActions/userActions.js`

### Components

- [x] Update `src/components/Routes.tsx`
- [x] Update `src/components/Protocol.tsx`
- [x] Update `src/components/Home/LaunchPad.tsx`
- [x] Update `src/components/ProtocolStack.tsx`
- [x] Update `src/components/ProtocolControlBar.tsx`
- [x] Create `src/hooks/useProtocolLoader.tsx`

### Selectors

- [x] Update `src/selectors/protocol.js` -> Created protocol.ts with dual-store support
- [x] Create `src/selectors/protocols.js`
- [x] Update all components using old selectors

### Actions/UserActions

- [x] Created `src/ducks/modules/userActions/webUserActions.ts`
- [x] Update remaining components to use webUserActions
- [x] Remove old userActions.js (desktop version)
- [x] Replace session logic with saveableChange.ts

### Tests

- [x] Create `src/ducks/modules/__tests__/protocols.test.ts`
- [x] Create `src/ducks/modules/__tests__/activeProtocol.test.ts`
- [x] Create `src/hooks/__tests__/useProtocolLoader.test.tsx`
- [x] Update existing protocol-related tests
- [x] Create routing tests (`src/components/__tests__/Routes.test.tsx`, `src/components/__tests__/Protocol.test.tsx`)

## Implementation Strategy

1. **Phase 1a**: Create new modules alongside old ones ✅
2. **Phase 1b**: Update components to use new modules ✅
3. **Phase 1c**: Remove old modules ✅
4. **Phase 1d**: Test thoroughly ✅

## Phase 1 Status: ✅ COMPLETE

## Success Criteria

1. All protocols have unique IDs ✅
2. Protocols can be accessed via URL ✅
3. Clean separation between protocols store and activeProtocol ✅
4. All tests passing ✅
5. Web-compatible file operations ✅

## Web App Implications

Since this will be a web app with no filesystem access:

1. **File Management**:
   - Remove all file path dependencies
   - Protocol import/export will use browser File API
   - No file watching or filesystem operations

2. **Storage**:
   - All protocol data stored in Redux + localStorage
   - Consider IndexedDB for larger datasets in future
   - Protocol assets (images, etc.) stored as base64 or blobs

3. **Protocol Loading**:
   - Users upload protocol files via file input
   - Protocols parsed and stored entirely in browser
   - Export functionality downloads protocol as file

4. **ID Generation**:
   - Use a hash function (e.g., SHA-256) on stringified protocol JSON
   - Ensures same protocol always gets same ID
   - Helps detect duplicate imports
