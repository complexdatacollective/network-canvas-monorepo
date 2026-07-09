import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';

import NodeDrawer from '../NodeDrawer';

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.IntersectionObserver === 'undefined') {
    window.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
    } as unknown as typeof window.IntersectionObserver;
  }
});

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

function renderDrawer(props: Partial<React.ComponentProps<typeof NodeDrawer>>) {
  let dndStore: StoreApi<DndStore> | null = null;
  render(
    <DndStoreProvider>
      <CaptureDndStore
        onStore={(store) => {
          dndStore = store;
        }}
      />
      <NodeDrawer nodes={[]} {...props} />
    </DndStoreProvider>,
  );
  return { getDndStore: () => dndStore! };
}

describe('NodeDrawer', () => {
  it('disables the toggle while empty when it is not a drop target', () => {
    renderDrawer({});
    const tab = screen.getByRole('button', { name: /expand drawer/i });
    expect(tab).toBeDisabled();
  });

  it('expands while empty when it is a drop target, revealing the drop hint', async () => {
    renderDrawer({
      dropTarget: {
        accepts: ['PLACED_NODE'],
        announcedName: 'Drawer',
        onDrop: vi.fn(),
      },
    });
    const tab = screen.getByRole('button', { name: /expand drawer/i });
    expect(tab).toBeEnabled();
    expect(tab.textContent).toContain('0 unplaced');

    fireEvent.click(tab);
    await waitFor(() => {
      expect(tab).toHaveAttribute('aria-expanded', 'true');
    });
    expect(screen.getByText('Drop here to remove')).toBeInTheDocument();
  });

  it('auto-expands while a compatible drag is in flight and collapses back after', async () => {
    const { getDndStore } = renderDrawer({
      dropTarget: {
        accepts: ['PLACED_NODE'],
        announcedName: 'Drawer',
        onDrop: vi.fn(),
      },
    });
    const tab = screen.getByRole('button', { name: /expand drawer/i });
    expect(tab).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      getDndStore()
        .getState()
        .startDrag(
          { id: 'n1', type: 'PLACED_NODE', metadata: {}, _sourceZone: null },
          { x: 0, y: 0, width: 10, height: 10 },
        );
    });
    await waitFor(() => {
      expect(tab).toHaveAttribute('aria-expanded', 'true');
    });

    // Drag ends without a drop: the drawer returns to its collapsed state
    act(() => {
      getDndStore().getState().endDrag();
    });
    await waitFor(() => {
      expect(tab).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('calls onDrop with the drag metadata when a compatible item is dropped on it', async () => {
    const onDrop = vi.fn();
    const { getDndStore } = renderDrawer({
      dropTarget: {
        accepts: ['PLACED_NODE'],
        announcedName: 'Drawer',
        onDrop,
      },
    });

    act(() => {
      getDndStore()
        .getState()
        .startDrag(
          {
            id: 'n1',
            type: 'PLACED_NODE',
            metadata: { nodeId: 'n1' },
            _sourceZone: null,
          },
          { x: 0, y: 0, width: 10, height: 10 },
        );
    });
    // Wait for the drop target's canDrop state to propagate before dropping
    await waitFor(() => {
      expect(
        getDndStore().getState().getDropTargetState('node-drawer')?.canDrop,
      ).toBe(true);
    });

    act(() => {
      getDndStore().getState().setActiveDropTarget('node-drawer');
      getDndStore().getState().endDrag();
    });

    await waitFor(() => {
      expect(onDrop).toHaveBeenCalledWith({ nodeId: 'n1' });
    });
  });

  it('ignores drags whose type it does not accept', async () => {
    const onDrop = vi.fn();
    const { getDndStore } = renderDrawer({
      dropTarget: {
        accepts: ['PLACED_NODE'],
        announcedName: 'Drawer',
        onDrop,
      },
    });
    const tab = screen.getByRole('button', { name: /expand drawer/i });

    act(() => {
      getDndStore()
        .getState()
        .startDrag(
          { id: 'x', type: 'OTHER_TYPE', metadata: {}, _sourceZone: null },
          { x: 0, y: 0, width: 10, height: 10 },
        );
    });

    // No auto-expand, and a drop does not fire the handler
    expect(tab).toHaveAttribute('aria-expanded', 'false');
    act(() => {
      getDndStore().getState().setActiveDropTarget('node-drawer');
      getDndStore().getState().endDrag();
    });
    await waitFor(() => {
      expect(getDndStore().getState().isDragging).toBe(false);
    });
    expect(onDrop).not.toHaveBeenCalled();
  });
});
