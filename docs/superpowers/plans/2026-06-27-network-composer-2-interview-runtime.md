# Network Composer — Interview Runtime Implementation Plan (2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on component/canvas tasks:** the data/state tasks (store, undo, actions, registration, types) carry exact code. The interactive canvas/inspector tasks carry concrete reference implementations grounded in the existing `Canvas`/`CanvasNode`/`SlidesForm` code; their TDD tests are the contract — when a reference snippet diverges from the live code, make the test pass and keep the snippet's structure. Never weaken a test to pass.

**Goal:** Build the `NetworkComposer` interview interface — a promptless, single-screen, free-form network builder that creates/edits nodes, draws/edits multiple edge types, supports multi-select + lasso clique-connect, deletion, and undo/redo, reusing the shared canvas/force-simulation infrastructure.

**Architecture:** A new interface component under `packages/interview/src/interfaces/NetworkComposer/`, registered in the interface registry. It reuses the existing canvas position store (`createCanvasStore`), `CanvasNode`, `EdgeLayer`, `useForceSimulation`, `ConcentricCircles`, and `SlidesForm` for the inspector. Interaction state (active tool, multi-selection, pending edge source, lasso) lives in a new per-instance `createComposerStore` (zustand). A new per-instance `createUndoStore` holds a bounded command/inverse stack. All network mutations go through existing session thunks (`addNode`, `addEdge`, `updateNode`, `updateEdge`, `deleteNode`, `deleteEdge`).

**Tech Stack:** React, Redux Toolkit (`createAsyncThunk`/`createAction`), Zustand (`createStore` + `subscribeWithSelector`), Vitest (`--project units`), TypeScript. The `~` import alias maps to `packages/interview/src`.

## Global Constraints

- **Depends on plan 1** (the `NetworkComposer` schema + `StageType`). Do not start until plan 1 is merged/available.
- **No `any` types.** Reuse existing primitives: `entityPrimaryKeyProperty`, `entityAttributesProperty`, `NcNode`, `NcEdge` from `@codaco/shared-consts`; `useAppDispatch`, `useStageSelector`, `useCurrentStep`, `StageProps`.
- **Operator power-tool, not participant-guided:** promptless; no `usePrompts`; no `NodeDrawer` (nodes are created here, not dragged from a drawer).
- **All network writes go through session thunks** — never mutate the Redux network directly. This keeps encryption, codebook validation, and prompt-meta handling intact.
- **Per-instance stores:** create the composer/undo/canvas stores with `useRef(createX())` so each mounted stage has isolated state (mirrors Sociogram's `useRef(createCanvasStore())`).
- **Undo is scoped to this stage session** — the stack lives in the per-instance store and is discarded on unmount; it never reaches into other stages.
- Pre-commit hooks run `oxfmt` + `oxlint`. Tasks do not run the formatter/linter manually. Defer `pnpm typecheck`, full tests, and `knip` to the final verification task.
- Run unit tests with the **`units` project** (`--project units`); the storybook/chromium project is CI-only.

---

## File Structure

- **Create:** `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx` — interface root; wires stores, canvas, palette, inspector, keyboard handlers.
- **Create:** `packages/interview/src/interfaces/NetworkComposer/useComposerStore.ts` — per-instance zustand store for interaction state (active tool, selection, pending edge source, lasso).
- **Create:** `packages/interview/src/interfaces/NetworkComposer/useUndoStore.ts` — per-instance bounded command/inverse stack.
- **Create:** `packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts` — hook binding composer interactions to session thunks + undo (create node, connect, connect-all, delete, update attributes, reposition).
- **Create:** `packages/interview/src/interfaces/NetworkComposer/ComposerCanvas.tsx` — canvas surface: background tap-to-add, node tap (select / edge endpoint), multi-select highlight, lasso overlay. Reuses `CanvasNode`, `EdgeLayer`, the canvas position store, and `useForceSimulation` handlers.
- **Create:** `packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx` — floating palette: select/move, add-node, one tool per edge type, auto-layout switch, undo/redo.
- **Create:** `packages/interview/src/interfaces/NetworkComposer/Inspector.tsx` — docked panel rendering the node form (selected node) or edge form (selected edge) via `SlidesForm`, with a Delete button.
- **Modify:** `packages/interview/src/interfaces/index.tsx` — add the `NetworkComposer` case to `getInterface`.
- **Create (tests):** co-located `__tests__/*.test.ts(x)` per module (paths given per task).

---

## Milestone M1 — Scaffold & registration

### Task 1: Register `NetworkComposer` and render a stub

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Modify: `packages/interview/src/interfaces/index.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.registration.test.tsx`

**Interfaces:**

- Consumes: `StageProps<'NetworkComposer'>` (from `~/types`, available once plan 1 adds the stage type).
- Produces: `NetworkComposer` default-exported component; `getInterface('NetworkComposer')` returns it.

- [ ] **Step 1: Write the failing test**

Create `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.registration.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';

import getInterface from '../../index';
import NetworkComposer from '../NetworkComposer';

describe('NetworkComposer registration', () => {
  it('is returned by getInterface for the NetworkComposer type', () => {
    expect(getInterface('NetworkComposer')).toBe(NetworkComposer);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.registration.test.tsx`
Expected: FAIL — `../NetworkComposer` does not exist.

- [ ] **Step 3: Create the stub component**

Create `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`:

```tsx
'use client';

import type { StageProps } from '~/types';

type NetworkComposerProps = StageProps<'NetworkComposer'>;

const NetworkComposer = (_props: NetworkComposerProps) => {
  return (
    <div
      className="interface h-dvh overflow-hidden"
      data-testid="network-composer"
    />
  );
};

export default NetworkComposer;
```

- [ ] **Step 4: Register in the interface map**

In `packages/interview/src/interfaces/index.tsx`, add the import next to the other interface imports:

```tsx
import NetworkComposer from './NetworkComposer/NetworkComposer';
```

Add the case inside `getInterface`'s `switch`, after the `Sociogram` case:

```tsx
    case 'NetworkComposer':
      return NetworkComposer;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.registration.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/ packages/interview/src/interfaces/index.tsx
git commit -m "feat(interview): scaffold and register NetworkComposer interface"
```

---

## Milestone M2 — Composer interaction store

### Task 2: `createComposerStore` (active tool, selection, pending edge, lasso)

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/useComposerStore.ts`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerStore.test.ts`

**Interfaces:**

- Produces:
  - `type ComposerTool = { kind: 'select' } | { kind: 'addNode' } | { kind: 'edge'; edgeType: string }`
  - `createComposerStore(): ComposerStoreApi`
  - `useComposerStore<T>(store, selector): T`
  - Store state: `activeTool: ComposerTool`, `selectedNodeIds: ReadonlySet<string>`, `selectedEdgeId: string | null`, `pendingEdgeSource: string | null`, `lassoPoints: { x: number; y: number }[] | null`.
  - Store actions: `setActiveTool(tool)`, `selectOnlyNode(id)`, `toggleNodeInSelection(id)`, `selectNodes(ids)`, `clearSelection()`, `selectEdge(id)`, `setPendingEdgeSource(id|null)`, `startLasso()`, `addLassoPoint(p)`, `endLasso()`.
  - Switching tools clears `selectedNodeIds`, `selectedEdgeId`, and `pendingEdgeSource`.

- [ ] **Step 1: Write the failing tests**

Create `packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createComposerStore } from '../useComposerStore';

describe('createComposerStore', () => {
  it('defaults to the select tool with no selection', () => {
    const s = createComposerStore().getState();
    expect(s.activeTool).toEqual({ kind: 'select' });
    expect(s.selectedNodeIds.size).toBe(0);
    expect(s.selectedEdgeId).toBeNull();
    expect(s.pendingEdgeSource).toBeNull();
  });

  it('selectOnlyNode replaces the selection and clears edge selection', () => {
    const store = createComposerStore();
    store.getState().selectEdge('e1');
    store.getState().selectOnlyNode('n1');
    expect([...store.getState().selectedNodeIds]).toEqual(['n1']);
    expect(store.getState().selectedEdgeId).toBeNull();
  });

  it('toggleNodeInSelection adds then removes a node', () => {
    const store = createComposerStore();
    store.getState().toggleNodeInSelection('n1');
    store.getState().toggleNodeInSelection('n2');
    expect(store.getState().selectedNodeIds.size).toBe(2);
    store.getState().toggleNodeInSelection('n1');
    expect([...store.getState().selectedNodeIds]).toEqual(['n2']);
  });

  it('switching the active tool clears selection and pending edge source', () => {
    const store = createComposerStore();
    store.getState().selectOnlyNode('n1');
    store.getState().setPendingEdgeSource('n1');
    store.getState().setActiveTool({ kind: 'edge', edgeType: 'knows' });
    expect(store.getState().selectedNodeIds.size).toBe(0);
    expect(store.getState().pendingEdgeSource).toBeNull();
    expect(store.getState().activeTool).toEqual({
      kind: 'edge',
      edgeType: 'knows',
    });
  });

  it('captures a lasso path then clears it on end', () => {
    const store = createComposerStore();
    store.getState().startLasso();
    store.getState().addLassoPoint({ x: 0.1, y: 0.1 });
    store.getState().addLassoPoint({ x: 0.2, y: 0.2 });
    expect(store.getState().lassoPoints).toHaveLength(2);
    store.getState().endLasso();
    expect(store.getState().lassoPoints).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useComposerStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `packages/interview/src/interfaces/NetworkComposer/useComposerStore.ts`:

```ts
import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type ComposerTool =
  { kind: 'select' } | { kind: 'addNode' } | { kind: 'edge'; edgeType: string };

type Point = { x: number; y: number };

type ComposerState = {
  activeTool: ComposerTool;
  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  pendingEdgeSource: string | null;
  lassoPoints: Point[] | null;
};

type ComposerActions = {
  setActiveTool: (tool: ComposerTool) => void;
  selectOnlyNode: (id: string) => void;
  toggleNodeInSelection: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  selectEdge: (id: string) => void;
  setPendingEdgeSource: (id: string | null) => void;
  startLasso: () => void;
  addLassoPoint: (point: Point) => void;
  endLasso: () => void;
};

export type ComposerStore = ComposerState & ComposerActions;

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export const createComposerStore = () =>
  createStore<ComposerStore>()(
    subscribeWithSelector((set) => ({
      activeTool: { kind: 'select' },
      selectedNodeIds: EMPTY_SELECTION,
      selectedEdgeId: null,
      pendingEdgeSource: null,
      lassoPoints: null,

      setActiveTool: (tool) =>
        set({
          activeTool: tool,
          selectedNodeIds: EMPTY_SELECTION,
          selectedEdgeId: null,
          pendingEdgeSource: null,
        }),

      selectOnlyNode: (id) =>
        set({ selectedNodeIds: new Set([id]), selectedEdgeId: null }),

      toggleNodeInSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedNodeIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { selectedNodeIds: next, selectedEdgeId: null };
        }),

      selectNodes: (ids) =>
        set({ selectedNodeIds: new Set(ids), selectedEdgeId: null }),

      clearSelection: () =>
        set({ selectedNodeIds: EMPTY_SELECTION, selectedEdgeId: null }),

      selectEdge: (id) =>
        set({ selectedEdgeId: id, selectedNodeIds: EMPTY_SELECTION }),

      setPendingEdgeSource: (id) => set({ pendingEdgeSource: id }),

      startLasso: () => set({ lassoPoints: [] }),

      addLassoPoint: (point) =>
        set((state) => ({
          lassoPoints: [...(state.lassoPoints ?? []), point],
        })),

      endLasso: () => set({ lassoPoints: null }),
    })),
  );

export type ComposerStoreApi = ReturnType<typeof createComposerStore>;

export function useComposerStore<T>(
  store: ComposerStoreApi,
  selector: (state: ComposerStore) => T,
): T {
  return useStore(store, selector);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useComposerStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/useComposerStore.ts \
        packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerStore.test.ts
git commit -m "feat(interview): add NetworkComposer interaction store"
```

---

## Milestone M3 — Undo/redo store

### Task 3: `createUndoStore` (bounded command/inverse stack)

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/useUndoStore.ts`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/useUndoStore.test.ts`

**Interfaces:**

- Produces:
  - `type UndoCommand = { label: string; undo: () => void; redo: () => void }`
  - `createUndoStore(limit?: number): UndoStoreApi` (default limit 50)
  - `useUndoStore<T>(store, selector): T`
  - State: `past: UndoCommand[]`, `future: UndoCommand[]`. Derived booleans `canUndo`/`canRedo` are read as `past.length > 0` / `future.length > 0`.
  - Actions: `push(command)` (runs nothing — the caller has already applied the effect; push records it, clears `future`, trims to `limit`), `undo()` (pops `past`, calls its `undo()`, moves to `future`), `redo()` (pops `future`, calls its `redo()`, moves to `past`).

- [ ] **Step 1: Write the failing tests**

Create `packages/interview/src/interfaces/NetworkComposer/__tests__/useUndoStore.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createUndoStore } from '../useUndoStore';

const cmd = (log: string[], name: string) => ({
  label: name,
  undo: () => log.push(`undo:${name}`),
  redo: () => log.push(`redo:${name}`),
});

describe('createUndoStore', () => {
  it('starts empty', () => {
    const s = createUndoStore().getState();
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
  });

  it('push records a command and clears redo future', () => {
    const store = createUndoStore();
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    store.getState().undo();
    store.getState().push(cmd(log, 'b'));
    expect(store.getState().future).toHaveLength(0);
  });

  it('undo then redo calls the command hooks in order', () => {
    const store = createUndoStore();
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    store.getState().undo();
    store.getState().redo();
    expect(log).toEqual(['undo:a', 'redo:a']);
  });

  it('is a no-op when there is nothing to undo/redo', () => {
    const store = createUndoStore();
    expect(() => store.getState().undo()).not.toThrow();
    expect(() => store.getState().redo()).not.toThrow();
  });

  it('trims the past to the limit (oldest dropped)', () => {
    const store = createUndoStore(2);
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    store.getState().push(cmd(log, 'b'));
    store.getState().push(cmd(log, 'c'));
    expect(store.getState().past.map((c) => c.label)).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useUndoStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `packages/interview/src/interfaces/NetworkComposer/useUndoStore.ts`:

```ts
import { createStore, useStore } from 'zustand';

export type UndoCommand = {
  label: string;
  undo: () => void;
  redo: () => void;
};

type UndoState = {
  past: UndoCommand[];
  future: UndoCommand[];
};

type UndoActions = {
  push: (command: UndoCommand) => void;
  undo: () => void;
  redo: () => void;
};

export type UndoStore = UndoState & UndoActions;

export const createUndoStore = (limit = 50) =>
  createStore<UndoStore>()((set, get) => ({
    past: [],
    future: [],

    push: (command) =>
      set((state) => ({
        past: [...state.past, command].slice(-limit),
        future: [],
      })),

    undo: () => {
      const { past } = get();
      const command = past[past.length - 1];
      if (!command) return;
      command.undo();
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [command, ...state.future],
      }));
    },

    redo: () => {
      const { future } = get();
      const command = future[0];
      if (!command) return;
      command.redo();
      set((state) => ({
        past: [...state.past, command],
        future: state.future.slice(1),
      }));
    },
  }));

export type UndoStoreApi = ReturnType<typeof createUndoStore>;

export function useUndoStore<T>(
  store: UndoStoreApi,
  selector: (state: UndoStore) => T,
): T {
  return useStore(store, selector);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useUndoStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/useUndoStore.ts \
        packages/interview/src/interfaces/NetworkComposer/__tests__/useUndoStore.test.ts
git commit -m "feat(interview): add NetworkComposer undo/redo store"
```

---

## Milestone M4 — Canvas surface, existing-node rendering, positioning

### Task 4: `ComposerCanvas` — render nodes/edges, manual + auto-layout, background

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/ComposerCanvas.tsx`
- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.canvas.test.tsx`

**Interfaces:**

- Consumes: `createCanvasStore`/`useCanvasStore` (`~/canvas/useCanvasStore`), `CanvasNode` (`~/canvas/CanvasNode`), `EdgeLayer` (`~/canvas/EdgeLayer`), `useForceSimulation` (`~/interfaces/Sociogram/useForceSimulation`), `ConcentricCircles` (`~/components/ConcentricCircles`), the composer store, session selectors `getNetworkNodesForType`/`getEdges`.
- Produces: `ComposerCanvas` component with props `{ canvasStore, composerStore, nodes, edges, layoutVariable, background, simulation, onBackgroundTap, onNodeTap, onEdgeTap }`. Renders the background, `EdgeLayer`, and a `CanvasNode` per node whose `selected` reflects `composerStore.selectedNodeIds`. A pointer-down on empty background (no drag) calls `onBackgroundTap(position)`; a node tap calls `onNodeTap(nodeId)`.

This task reuses the Sociogram's position/simulation wiring. Model the layout-mode logic on `Sociogram.tsx` lines 53–98 (manual vs automatic; `syncFromNodes`/`syncNewFromNodes`; `useForceSimulation`).

- [ ] **Step 1: Write the failing test**

Create `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.canvas.test.tsx`. Use the interview test harness used by other interface tests (render-with-store helper). Mirror the import + render setup from `src/interfaces/Sociogram/__tests__/Sociogram.allowPositioning.test.ts`; assert:

```tsx
// Pseudostructure — copy the store/render harness from the Sociogram test file.
// 1. Render NetworkComposer with a stage whose subject is `person`, a
//    `layoutVariable`, and a session network containing two placed `person`
//    nodes.
// 2. Assert two CanvasNode elements render (query by the ConnectedNode test id /
//    role used in the Sociogram tests).
// 3. Assert the background concentric-circles element renders when
//    `background.concentricCircles` is set.
```

(Author the concrete assertions against the same DOM hooks the Sociogram test uses — `data-testid="network-composer"`, node role/testids from `ConnectedNode`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.canvas.test.tsx`
Expected: FAIL — the stub renders no nodes/background.

- [ ] **Step 3: Implement `ComposerCanvas`**

Create `packages/interview/src/interfaces/NetworkComposer/ComposerCanvas.tsx`. Adapt `Canvas.tsx`: keep the `ResizeObserver`→`setCanvasDimensions` effect and the document-level pointer tracking; render `EdgeLayer` and `CanvasNode`s; add a background pointer-down handler that, when the pointer is released without crossing the drag threshold, converts the screen point to a normalized `{x,y}` (reuse the `screenToNormalized` math from `useCanvasDrag.ts` lines 36–47) and calls `onBackgroundTap`. Drive each `CanvasNode`'s `selected` from `composerStore.selectedNodeIds.has(nodeId)` and its `onSelect` from `onNodeTap`.

```tsx
'use client';

import { clamp } from 'es-toolkit';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import CanvasNode from '~/canvas/CanvasNode';
import EdgeLayer from '~/canvas/EdgeLayer';
import type { CanvasStoreApi } from '~/canvas/useCanvasStore';

import { type ComposerStoreApi, useComposerStore } from './useComposerStore';

type Position = { x: number; y: number };

type ComposerCanvasProps = {
  canvasStore: CanvasStoreApi;
  composerStore: ComposerStoreApi;
  nodes: NcNode[];
  edges: NcEdge[];
  background: ReactNode;
  allowRepositioning?: boolean;
  simulation?: {
    moveNode: (nodeId: string, position: Position) => void;
    releaseNode: (nodeId: string) => void;
  } | null;
  onBackgroundTap: (position: Position) => void;
  onNodeTap: (nodeId: string) => void;
  onNodeDragEnd: (nodeId: string, position: Position) => void;
};

const DRAG_THRESHOLD = 5;

export default function ComposerCanvas({
  canvasStore,
  composerStore,
  nodes,
  edges,
  background,
  allowRepositioning = true,
  simulation = null,
  onBackgroundTap,
  onNodeTap,
  onNodeDragEnd,
}: ComposerCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const selectedNodeIds = useComposerStore(
    composerStore,
    (s) => s.selectedNodeIds,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      canvasStore.getState().setCanvasDimensions({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasStore]);

  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    downRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBackgroundPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved >= DRAG_THRESHOLD) return; // a drag, not a tap
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      onBackgroundTap({
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      });
    },
    [onBackgroundTap],
  );

  return (
    <div
      ref={canvasRef}
      className="relative size-full overflow-hidden"
      role="application"
      onPointerDown={handleBackgroundPointerDown}
      onPointerUp={handleBackgroundPointerUp}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {background}
      </div>
      <EdgeLayer edges={edges} store={canvasStore} />
      {nodes.map((node) => {
        const nodeId = node[entityPrimaryKeyProperty];
        return (
          <CanvasNode
            key={nodeId}
            node={node}
            canvasRef={canvasRef}
            store={canvasStore}
            onDragEnd={onNodeDragEnd}
            onSelect={onNodeTap}
            selected={selectedNodeIds.has(nodeId)}
            allowRepositioning={allowRepositioning}
            simulation={simulation}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Wire `ComposerCanvas` into `NetworkComposer`**

Replace `NetworkComposer.tsx` body with the canvas wiring, modelled on `Sociogram.tsx` lines 39–98 and 195–232 (read those for the exact selector/store/simulation calls). Read `stage.subject`, `stage.layoutVariable`, `stage.behaviours?.automaticLayout?.enabled`, `stage.background`. Use `useStageSelector(getNetworkNodesForType)` for nodes and `useStageSelector(getEdges)` for edges. Create `canvasStore`, `composerStore`, `undoStore` with `useRef(createX())`. For now pass no-op handlers for `onBackgroundTap`/`onNodeTap` (real handlers arrive in later tasks) and reuse the Sociogram's `handleNodeDragEnd` for `onNodeDragEnd`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.canvas.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/
git commit -m "feat(interview): NetworkComposer canvas with node/edge rendering and layout"
```

---

## Milestone M5 — Composer actions hook (create / connect / delete / attributes)

### Task 5: `useComposerActions` — session-thunk + undo bindings

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerActions.test.ts`

**Interfaces:**

- Consumes: `addNode`, `addEdge`, `updateNode`, `updateEdge`, `deleteNode`, `deleteEdge`, `toggleEdge` (from `~/store/modules/session`); `useAppDispatch`; the canvas + undo stores; `currentStep`.
- Produces a hook returning:
  - `createNodeAt(name: string, position: Position): Promise<string>` — dispatches `addNode` with `{ type: subject.type, attributeData: { [quickAdd]: name, [layoutVariable]: position }, currentStep }`, returns the new node id; pushes an undo command that `deleteNode`s it (redo re-adds).
  - `connect(from: string, to: string, edgeType: string)` — dispatches `addEdge`; pushes inverse `deleteEdge`.
  - `connectAll(nodeIds: string[], edgeType: string)` — adds every pairwise edge among `nodeIds` not already present; pushes a single inverse that deletes them all.
  - `deleteNodeById(id)` / `deleteEdgeById(id)` — capture the entity (and a node's incident edges) for the inverse, dispatch delete, push inverse that re-adds.
  - `updateNodeAttributes(id, data)` / `updateEdgeAttributes(id, data)` — capture prior attribute values for the inverse, dispatch update, push inverse.
  - `repositionNode(id, position, previous)` — dispatch `updateNode` writing `layoutVariable`; push inverse restoring `previous`.

**Important — new-node id:** `addNode`'s fulfilled payload (session.ts lines 200–229) does not include an explicit id; the reducer assigns it. To obtain the id deterministically, pass a pre-generated primary key via `modelData` (mirroring how `addEdge` pre-generates `edgeId`). Read `src/store/modules/session.ts` around the `addNode` reducer/`extraReducers` to confirm the `modelData` key used for the primary key (`entityPrimaryKeyProperty` from `@codaco/shared-consts`); generate it with the same `uuid` import session.ts uses and include it as `modelData: { [entityPrimaryKeyProperty]: id }`. The test below asserts the returned id matches the node that appears in the network.

- [ ] **Step 1: Write the failing tests**

Create `packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerActions.test.ts`. Use the interview store test harness (a real configured store with a codebook containing `person` + `knows`, as the session-action tests under `src/store/modules/__tests__/` do — read one for the exact `makeStore`/`renderHook` setup). Assert:

```ts
// 1. createNodeAt('Alex', {x:0.5,y:0.5}) adds a person node whose quickAdd
//    variable === 'Alex' and whose layoutVariable === {x:0.5,y:0.5}; the
//    returned id matches that node's primary key.
// 2. After createNodeAt, undoStore.undo() removes the node; redo() re-adds it.
// 3. connect(a,b,'knows') adds one edge; undo removes it.
// 4. connectAll([a,b,c],'knows') adds 3 edges; undo removes all 3.
// 5. deleteNodeById(a) removes the node and its incident edges; undo restores
//    both node and edges.
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useComposerActions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useComposerActions`**

Create `packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts` binding each action above to the session thunks and pushing the matching `UndoCommand`. Use `dispatch(thunk(args)).unwrap()` where a result is needed. For `connectAll`, compute the pairwise set with a nested loop over `nodeIds` and skip pairs where an edge of `edgeType` already exists (reuse the network's edges; an edge matches when `{from,to,type}` is the same unordered pair — consistent with the shared-graph edge identity). Keep the file focused on action/undo binding only.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/useComposerActions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts \
        packages/interview/src/interfaces/NetworkComposer/__tests__/useComposerActions.test.ts
git commit -m "feat(interview): NetworkComposer action hook with undo bindings"
```

---

## Milestone M6 — Tool palette & Add-Node tool

### Task 6: `ToolPalette` and quick-add node creation

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx`
- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.addNode.test.tsx`

**Interfaces:**

- Consumes: composer store (active tool), undo store (canUndo/canRedo), `stage.edges` (one tool per edge subject type), edge codebook colours via the existing codebook selector used by `ConnectedNode`.
- Produces: `ToolPalette` with buttons: Select/Move, Add Node, one per `edges[].subject.type`, an auto-layout toggle (when `behaviours.automaticLayout` is configured), and Undo/Redo. Each button calls `composerStore.setActiveTool(...)`; the active tool is visually marked (`aria-pressed`).
- When the Add Node tool is active, a background tap calls `createNodeAt('', position)` and immediately enters the inline-rename state for the new node (the node renders an inline text input that writes the `quickAdd` variable on commit).

- [ ] **Step 1: Write the failing test**

Create `.../NetworkComposer.addNode.test.tsx`: render the interface; assert the palette shows a Select, Add Node, and one edge tool per configured edge type. Activate Add Node (`aria-pressed=true`), simulate a background tap at a point, type a name into the inline field, commit, and assert a `person` node now exists in the network with the `quickAdd` value set and a `layoutVariable` position.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.addNode.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `ToolPalette` and wire Add-Node**

Create `ToolPalette.tsx` (a floating, vertically-stacked button group; use existing `fresco-ui` button/icon primitives — check how `SimulationPanel.tsx` imports them). In `NetworkComposer.tsx`, derive `onBackgroundTap` from the active tool: when `addNode`, call `createNodeAt` and set local `renamingNodeId` state so the canvas renders an inline input for that node. Implement the inline rename by passing a `renamingNodeId` + `onRename` down to `ComposerCanvas`/`CanvasNode` (add an optional inline-input render path to a Composer-specific node wrapper, or render an absolutely-positioned input at the node's position). On commit, `updateNodeAttributes(nodeId, { [quickAdd]: value })`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.addNode.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/
git commit -m "feat(interview): NetworkComposer tool palette and quick-add nodes"
```

---

## Milestone M7 — Edge tools (tap source→target, toggle)

### Task 7: Draw and toggle edges with the edge-type tools

**Files:**

- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.edges.test.tsx`

**Interfaces:**

- Consumes: composer store `activeTool`/`pendingEdgeSource`; `useComposerActions.connect`; `toggleEdge` semantics (tapping an existing pair of the active type removes it).
- Produces: an `onNodeTap` behaviour for edge tools — first tap sets `pendingEdgeSource`; second tap on a different node toggles the edge of `activeTool.edgeType` between them (add if absent, remove if present) and clears the pending source; tapping the same node clears the pending source.

- [ ] **Step 1: Write the failing test**

Create `.../NetworkComposer.edges.test.tsx`: with two nodes present, activate the `knows` edge tool, tap node A then node B, assert one `knows` edge A–B exists; tap A then B again, assert it is removed; tap A then A, assert no edge and pending source cleared.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.edges.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement edge-tool tap handling**

In `NetworkComposer.tsx`, branch `onNodeTap` on `activeTool.kind`: for `edge`, implement the source→target toggle using `composerStore.pendingEdgeSource` and the existing `toggleEdge` thunk (which already adds/removes by `{from,to,type}`), reading `pendingEdgeSource` from the store at call time (avoid stale closures — mirror `Sociogram.tsx` lines 106–124 which read `store.getState().selectedNodeId`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.edges.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/
git commit -m "feat(interview): NetworkComposer edge-type tools (tap to toggle)"
```

---

## Milestone M8 — Inspector (node & edge attribute forms + delete)

### Task 8: `Inspector` panel

**Files:**

- Create: `packages/interview/src/interfaces/NetworkComposer/Inspector.tsx`
- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.inspector.test.tsx`

**Interfaces:**

- Consumes: composer store (`selectedNodeIds` of size 1 → node form; `selectedEdgeId` → edge form); `stage.nodeForm`, the selected edge's `edges[].form`; `useComposerActions.updateNodeAttributes`/`updateEdgeAttributes`/`deleteNodeById`/`deleteEdgeById`; `SlidesForm` for rendering (model on `AlterForm.tsx` lines 97–138 for nodes and `AlterEdgeForm` for edges — read it for the `form_kind="edge"` usage and edge subject prop).
- Produces: `Inspector` — hidden when nothing/multiple selected; renders a single-item `SlidesForm` for the selected node or edge and a Delete button. In Select mode, a node tap selects-only (→ inspector); an edge tap selects the edge (→ inspector).

- [ ] **Step 1: Write the failing test**

Create `.../NetworkComposer.inspector.test.tsx`: in Select mode, tap a node → inspector shows the node form; edit the form field → node attribute updates in the network; click Delete → node removed. Repeat for an edge (tap edge → edge form → edit → delete).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.inspector.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement edge selection + `Inspector`**

Add edge selection: extend `EdgeLayer` usage so an edge tap calls `onEdgeTap(edgeId)` (if `EdgeLayer` has no click affordance, add an optional `onEdgeSelect` prop to it that attaches a pointer handler to each edge line — read `src/canvas/EdgeLayer.tsx` first). In Select mode, `onNodeTap` → `selectOnlyNode`; `onEdgeTap` → `selectEdge`. Build `Inspector.tsx` rendering `SlidesForm` with a single-item list (`items={[selectedEntity]}`), the appropriate `form` (`stage.nodeForm` or the edge type's `form`), `subject`, `updateItem`, and `form_kind` (`'alter'` for nodes, `'edge'` for edges). Wire the Delete button to the matching action.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/ packages/interview/src/canvas/EdgeLayer.tsx
git commit -m "feat(interview): NetworkComposer inspector with node/edge forms and delete"
```

---

## Milestone M9 — Multi-select, lasso, clique-connect, batch ops

### Task 9: Shift-select, lasso, connect-all, batch delete/move

**Files:**

- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`, `ComposerCanvas.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.clique.test.tsx`

**Interfaces:**

- Consumes: composer store (`toggleNodeInSelection`, `selectNodes`, lasso actions); `useComposerActions.connectAll`/`deleteNodeById`; the canvas position store (to hit-test lasso polygon against node positions).
- Produces:
  - In Select mode, shift/⌘-click on a node calls `toggleNodeInSelection`.
  - A background drag in Select mode draws a lasso (`startLasso`/`addLassoPoint`); on release, nodes whose position is inside the polygon are selected (`selectNodes`); the lasso overlay clears.
  - A "Connect all with `<edge type>`" control (shown when ≥2 nodes selected) calls `connectAll(selectedIds, edgeType)`.
  - With a multi-selection, the Delete key removes all selected nodes (each via `deleteNodeById`, batched into one undo entry).

- [ ] **Step 1: Write the failing test**

Create `.../NetworkComposer.clique.test.tsx`: select three nodes via shift-click; invoke "connect all with knows"; assert 3 pairwise `knows` edges; undo removes all 3. Then test lasso: simulate a background drag whose polygon encloses two of three nodes; assert exactly those two become selected.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.clique.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement multi-select + lasso + connect-all**

In `ComposerCanvas.tsx`, when `activeTool.kind === 'select'` and the background pointer crosses the drag threshold, switch from tap to lasso: push normalized points via `addLassoPoint`, render an SVG `<polyline>`/`<polygon>` overlay from `lassoPoints`, and on pointer-up run a point-in-polygon test (ray casting) against each node's normalized position from the canvas store, then `selectNodes(insideIds)` and `endLasso()`. In `NetworkComposer.tsx`, make node taps in Select mode honour the shift/meta modifier (`toggleNodeInSelection` vs `selectOnlyNode`), render the "Connect all" control when `selectedNodeIds.size >= 2`, and handle the Delete key for batch delete. Add a single grouped undo entry for `connectAll` (already in Task 5) and for batch delete (wrap the per-node inverses into one `UndoCommand`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.clique.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NetworkComposer/
git commit -m "feat(interview): NetworkComposer multi-select, lasso, and clique-connect"
```

---

## Milestone M10 — Undo/redo keyboard + delete wiring & verification

### Task 10: Keyboard undo/redo + single-select delete; full verification

**Files:**

- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.tsx`
- Test: `packages/interview/src/interfaces/NetworkComposer/__tests__/NetworkComposer.undo.test.tsx`

**Interfaces:**

- Consumes: undo store (`undo`/`redo`), composer store (selection), `useComposerActions`.
- Produces: a keydown handler on the interface root — ⌘/Ctrl-Z → `undo()`, ⇧⌘/Ctrl-Z → `redo()`, Delete/Backspace → delete the current single selection (node or edge). Palette Undo/Redo buttons call the same actions and reflect `past.length`/`future.length`.

- [ ] **Step 1: Write the failing test**

Create `.../NetworkComposer.undo.test.tsx`: create a node, press ⌘Z → node gone; press ⇧⌘Z → node back. Select a node, press Delete → node gone; ⌘Z → restored.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.undo.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement keyboard handling**

Add a keydown listener on the interface root (`tabIndex={0}`) handling undo/redo/delete as above. Guard against intercepting keys while an inline rename or a form field is focused (check `document.activeElement` tag is not `INPUT`/`TEXTAREA`/`SELECT`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer/__tests__/NetworkComposer.undo.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full interface test suite**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer`
Expected: PASS (all NetworkComposer tests).

- [ ] **Step 6: Typecheck, knip, commit**

```bash
pnpm --filter @codaco/interview typecheck
pnpm knip
git add packages/interview/src/interfaces/NetworkComposer/
git commit -m "feat(interview): NetworkComposer keyboard undo/redo and delete"
```

Expected: typecheck clean; knip reports no unused exports for the new modules (each is imported by `NetworkComposer.tsx` or its tests).

---

## Optional follow-up (not required for a working interface)

- **Storybook story + interaction test** (`NetworkComposer.stories.tsx`) modelled on `Sociogram.stories.tsx`, exercising the create→connect→inspect→undo loop. Runs in the CI-only storybook/chromium project.

## Self-review notes (coverage vs. spec)

- Promptless single canvas ✓ (no `usePrompts`/`NodeDrawer`). Capture-first quick-add ✓ (M6). Designer-configured forms in inspector ✓ (M8). Edge-type tools + toggle ✓ (M7). Multi-select + lasso clique-connect + batch ops ✓ (M9). Manual + live auto-layout (default off) ✓ (M4, reusing `useForceSimulation`). Background circles+image ✓ (M4). Single-select delete + undo/redo ✓ (M8, M10). Stage-local undo ✓ (per-instance store, M3).

```

```
