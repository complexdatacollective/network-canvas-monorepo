'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Gives the popups below it one layer to be portalled into, above the page.
 *
 * - `isolate` (isolation: isolate) makes the layer a stacking context of its
 *   own and `z-3000` puts it above sibling stage content. Without it, popups
 *   (tooltips, popovers, menus, modals, the drag preview), none of which set
 *   their own z-index, would compete with the stacking contexts that stage
 *   content creates (for example, the transforms of a `motion.div`).
 * - `fixed inset-0`, rather than `relative`, so the layer fills the viewport
 *   as the containing block of the `position: absolute` positioners inside
 *   Base UI popups. In a 0-wide `relative` container those positioners
 *   shrink to their min-content width, and a menu's or a tooltip's text
 *   collapses to its longest unbreakable word.
 * - `pointer-events-none` keeps the empty layer from taking the pointer from
 *   the stage below, and `[&>*]:pointer-events-auto` gives it back to each
 *   portalled root (a dialog's backdrop and popup, a positioner), since
 *   `pointer-events` is inherited.
 *
 * The order of the popups on this layer is `useDrawnOnTopWhenOpened`'s.
 * Without a provider, popups and toasts portal to `document.body`, where the
 * same values draw them above the page in the same order.
 */
export function PortalContainerProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // Ignores the null React passes when the node detaches. A Suspense boundary
  // that re-suspends detaches every ref below it during the commit, and a
  // state update scheduled from there re-renders the boundary at sync priority
  // straight away. That render reveals the hidden content again, and the
  // reveal re-attaches the ref. Each round commits with a sync update
  // pending, so a boundary that stays suspended ends in React error #185
  // (maximum update depth) instead of waiting for its data.
  const attachContainer = useCallback((node: HTMLElement | null) => {
    if (node !== null) setContainer(node);
  }, []);
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
      {/*
       * The layer every popup, dialog and toast is portalled into: above the
       * stage (`isolate z-3000`), filling the viewport, and letting the
       * pointer through except where a popup is (see `PortalContainerProvider`).
       */}
      <div
        ref={attachContainer}
        className="pointer-events-none fixed inset-0 isolate z-3000 [&>*]:pointer-events-auto"
      />
    </PortalContainerContext.Provider>
  );
}

/**
 * Points `usePortalContainer` at an element that already exists, for
 * everything rendered below this. Unlike `PortalContainerProvider` it renders
 * no element of its own.
 *
 * `Modal` uses it to point the popups inside a dialog at the dialog's own Base
 * UI portal node. This is the nesting Base UI does itself when no `container`
 * is passed: a portal is created inside its parent portal. When a modal dialog
 * opens, its focus manager hides everything outside it from assistive
 * technology (`aria-hidden`), leaving alone only the portals inside the
 * dialog's own portal node. A popup portalled into the shared container sits
 * beside the dialog, so one that stays mounted while closed (`DropdownMenu`,
 * `Popover`) was hidden.
 *
 * While `container` is still `null` (the first render, before the node is
 * attached), descendants get `null`, as they would outside any provider. A
 * Base UI portal then falls back to its own parent portal (or, before that
 * exists, to `document.body`) and moves here once the node is attached.
 */
export function PortalContainerScope({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

export function usePortalContainer() {
  return useContext(PortalContainerContext);
}

/**
 * Moves `node` to the end of its container, keeping focus where it was: the
 * browser takes focus from an element that is moved.
 */
const moveToEnd = (node: HTMLElement) => {
  const container = node.parentNode;
  if (container === null || container.lastChild === node) return;
  const { activeElement, defaultView } = node.ownerDocument;
  const focused =
    activeElement !== null &&
    defaultView !== null &&
    activeElement instanceof defaultView.HTMLElement &&
    node.contains(activeElement)
      ? activeElement
      : null;
  container.appendChild(node);
  if (focused !== null && node.ownerDocument.activeElement !== focused) {
    focused.focus({ preventScroll: true });
  }
};

/**
 * Draws a popup that stays mounted while it is closed over every popup opened
 * before it, as one that mounts when it opens is: each time `open` becomes
 * true, its portal node (`portalNode`, from the portal's `ref`) moves to the
 * end of the container it is in, before the popup is drawn.
 *
 * This is the layering rule of the portal layer (`PortalContainerProvider`):
 * the popup opened last is drawn on top. Every popup root drawn on the layer
 * carries the same `z-3000` (the positioner of each popover, menu, select,
 * combobox and tooltip, and the portal of each modal), so they are drawn in
 * document order, and document order is the order in which they were
 * opened: a popup that is not kept mounted adds its portal node at the end
 * of the layer when it opens, and one that is kept mounted while closed (a
 * popover, a menu) moves its portal node to the end here. So a dialog opened
 * from a popover covers it, and a menu opened while a popover stays open is
 * drawn over that popover. A popup root with any other z-index, or a
 * kept-mounted popup that does not call this, would break that order. The
 * popups inside a modal are portalled into its own portal node
 * (`PortalContainerScope`) and are ordered the same way among themselves,
 * above whatever the modal covers.
 *
 * Toasts are the one exception: their viewport carries `z-3001`, so a notice
 * is drawn over every popup and dialog, whenever each was opened.
 */
export function useDrawnOnTopWhenOpened(
  open: boolean,
  portalNode: HTMLElement | null,
) {
  useLayoutEffect(() => {
    if (open && portalNode !== null) moveToEnd(portalNode);
  }, [open, portalNode]);
}
