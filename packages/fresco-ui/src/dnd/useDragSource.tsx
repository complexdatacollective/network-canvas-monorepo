'use client';

import type React from 'react';
import {
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { DRAG_DISTANCE } from '../hooks/useNodeGestures';
import type { Prettify } from '../utils/prettify';
import { useDndStore, useDndStoreApi } from './DndStoreProvider';
import type { DragMetadata } from './types';
import {
  getDropTargetDescription,
  getKeyboardDragAnnouncement,
  useAccessibilityAnnouncements,
} from './useAccessibilityAnnouncements';
import { useScrollAwareDrag } from './useScrollAwareDrag';
import { findSourceZone, rafThrottle } from './utils';

const messages = defineMessages({
  unnamedItem: {
    id: 'frescoUi.dragAndDrop.unnamedItem',
    defaultMessage: 'Item',
    description:
      'Stands in for the name of the thing being dragged in live-region announcements, when the drag source supplied none.',
  },
  returnedToPosition: {
    id: 'frescoUi.dragAndDrop.returnedToPosition',
    defaultMessage: 'Drop cancelled, {name} returned to original position',
    description:
      'Live-region announcement after a keyboard drag ends without a drop.',
  },
  grabbed: {
    id: 'frescoUi.dragAndDrop.grabbed',
    defaultMessage:
      '{name} grabbed, use arrow keys to navigate to drop targets, press Escape to cancel',
    description:
      'Live-region announcement when a keyboard drag picks something up.',
  },
});

// Hook-specific types
type DragSourceOptions = {
  type: string;
  metadata?: DragMetadata;
  announcedName?: string;
  preview?: ReactNode;
  disabled?: boolean;
  /** Movement in pixels before a pointer drag starts. */
  dragThreshold?: number;
};

type PendingDrag = {
  startPosition: { x: number; y: number };
  element: HTMLElement;
};

/** The pointer sequence a drag source is following, press to release. */
type PointerGesture = {
  pointerId: number;
  element: HTMLElement;
  /** Removes every listener the gesture attached. */
  detach: () => void;
};

type UseDragSourceReturn = {
  dragProps: {
    'ref': (element: HTMLElement | null) => void;
    'onPointerDown': (e: React.PointerEvent) => void;
    'onKeyDown': (e: React.KeyboardEvent) => void;
    'style'?: React.CSSProperties;
    'aria-grabbed'?: boolean;
    'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup';
    'aria-label'?: string;
    'role'?: string;
    'tabIndex'?: number;
    /** Present once a hold has freed the drag to move in any direction. */
    'data-drag-armed'?: true;
  };
  isDragging: boolean;
};

export function useDragSource(
  options: Prettify<DragSourceOptions>,
): Prettify<UseDragSourceReturn> {
  const {
    type,
    metadata,
    announcedName,
    preview,
    disabled = false,
    dragThreshold = DRAG_DISTANCE,
  } = options;
  // Read when they are needed — a drag starting, an announcement — rather
  // than captured by the handlers: hosts rebuild metadata and previews on
  // every render, and handlers depending on them would make `dragProps` new
  // on every render too. Updated in a layout effect, before anything can
  // start a drag.
  const latestRef = useRef({
    type,
    metadata,
    announcedName,
    preview,
    dragThreshold,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      type,
      metadata,
      announcedName,
      preview,
      dragThreshold,
    };
  });

  const { announce } = useAccessibilityAnnouncements();
  const intl = useAppIntl();

  const [dragMode, setDragMode] = useState<'none' | 'pointer' | 'keyboard'>(
    'none',
  );
  const [currentDropTargetIndex, setCurrentDropTargetIndex] = useState(-1);
  const dragId = useId();
  const elementRef = useRef<HTMLElement | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const {
    touchAction,
    isArmed,
    ref: setScrollAwareRef,
    begin: beginScrollAware,
    claimsMove,
    end: endScrollAware,
  } = useScrollAwareDrag();

  const startDrag = useDndStore((state) => state.startDrag);
  const updateDragPosition = useDndStore((state) => state.updateDragPosition);
  const setActiveDropTarget = useDndStore((state) => state.setActiveDropTarget);
  const endDrag = useDndStore((state) => state.endDrag);

  const [updatePosition] = useState(() => rafThrottle(updateDragPosition));

  const createPreview = useCallback(
    (element: HTMLElement | null): ReactNode => {
      const latestPreview = latestRef.current.preview;
      if (latestPreview !== undefined) return latestPreview;
      if (!element) return null;

      // Capture the element's exact computed size
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      const clonedElement = element.cloneNode(true) as HTMLElement;
      clonedElement.style.pointerEvents = 'none';

      // Ensure the preview shows the dragging state
      clonedElement.setAttribute('data-dragging', 'true');
      clonedElement.removeAttribute('data-drag-armed');

      // Apply the exact computed dimensions to ensure visual consistency
      clonedElement.style.width = `${rect.width}px`;
      clonedElement.style.height = `${rect.height}px`;
      clonedElement.style.minWidth = `${rect.width}px`;
      clonedElement.style.minHeight = `${rect.height}px`;
      clonedElement.style.maxWidth = `${rect.width}px`;
      clonedElement.style.maxHeight = `${rect.height}px`;

      // Preserve box-sizing to ensure dimensions are applied correctly
      clonedElement.style.boxSizing = computedStyle.boxSizing;

      clonedElement.removeAttribute('id');
      clonedElement.querySelectorAll('[id]').forEach((el) => {
        el.removeAttribute('id');
      });

      return createElement('div', {
        dangerouslySetInnerHTML: { __html: clonedElement.outerHTML },
      });
    },
    [],
  );

  // Unified drag initialization logic
  const initializeDrag = useCallback(
    (
      element: HTMLElement,
      position: { x: number; y: number },
      mode: 'pointer' | 'keyboard',
    ) => {
      elementRef.current = element;
      setDragMode(mode);

      const rect = element.getBoundingClientRect();
      const sourceZone = findSourceZone(element);
      const dragItem = {
        id: dragId,
        type: latestRef.current.type,
        metadata: latestRef.current.metadata,
        _sourceZone: sourceZone,
      };
      const dragPosition = {
        ...position,
        width: rect.width,
        height: rect.height,
      };
      const dragPreview = createPreview(element);

      startDrag(dragItem, dragPosition, dragPreview);

      // Only hide the element during pointer drag
      if (mode === 'pointer') {
        element.style.visibility = 'hidden';
      }
    },
    [dragId, createPreview, startDrag],
  );

  // Unified drag end logic
  const storeApi = useDndStoreApi();
  const finishDrag = useCallback(
    (shouldDrop = true) => {
      const activeDropTargetId = storeApi.getState().activeDropTargetId;
      const isSuccessfulDrop = shouldDrop && activeDropTargetId !== null;

      if (!shouldDrop) {
        storeApi.getState().setActiveDropTarget(null);
      }

      endDrag();
      setDragMode('none');
      setCurrentDropTargetIndex(-1);

      const element = elementRef.current;
      if (element) {
        if (isSuccessfulDrop) {
          // Leave the element hidden so AnimatePresence exit doesn't flash
          // the item back in its original position. The element will be
          // removed from the DOM when the exit animation completes.
          // Safety net: restore visibility if the item is still in the DOM
          // after the exit animation would have completed (e.g. the drop
          // handler didn't actually remove the item).
          setTimeout(() => {
            if (element.isConnected) {
              element.style.visibility = '';
            }
          }, 500);
        } else {
          element.style.visibility = '';
        }
      }

      // Announce keyboard drag result for failed drops only
      // Successful drops are announced by the drop target
      if (dragMode === 'keyboard' && !isSuccessfulDrop) {
        announce(
          intl.formatMessage(messages.returnedToPosition, {
            name:
              latestRef.current.announcedName ??
              intl.formatMessage(messages.unnamedItem),
          }),
        );
      }
    },
    [endDrag, dragMode, announce, storeApi, intl],
  );

  // The gesture's listeners are attached once, at pointerdown, and outlive
  // renders; they call through these refs so they always run the latest
  // handlers (and see the latest drag mode). A layout effect installs each
  // render's handlers, before any event or passive effect can call them.
  const moveRef = useRef<(event: PointerEvent) => void>(() => {});
  const settleRef = useRef<(drop: boolean) => void>(() => {});
  useLayoutEffect(() => {
    moveRef.current = (e: PointerEvent) => {
      e.preventDefault();

      // Check if we have a pending drag that hasn't met the threshold yet
      const pending = pendingDragRef.current;
      if (pending && dragMode === 'none') {
        const dx = e.clientX - pending.startPosition.x;
        const dy = e.clientY - pending.startPosition.y;

        // Movement the scroll region owns stays pending: the browser cancels
        // the sequence once it starts scrolling.
        if (
          Math.hypot(dx, dy) >= latestRef.current.dragThreshold &&
          claimsMove(dx, dy)
        ) {
          initializeDrag(pending.element, pending.startPosition, 'pointer');
          pendingDragRef.current = null;
        }
        return;
      }

      // Normal drag position update
      updatePosition(e.clientX, e.clientY);
    };

    /**
     * Ends the pointer gesture however it ended: released (`drop`), cancelled
     * by the browser, or interrupted from outside its own pointer sequence — a
     * window switch, the source being disabled — which nothing else would end.
     */
    settleRef.current = (drop: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      gestureRef.current = null;
      gesture.detach();
      endScrollAware();
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }

      // A press that never became a drag: let the click through for selection
      if (pendingDragRef.current) {
        pendingDragRef.current = null;
        return;
      }

      // Suppress the click event that follows pointer up after a real drag.
      // This prevents selection from triggering after drag-and-drop. A
      // cancelled or interrupted gesture is followed by no click.
      if (drop) {
        const cleanup = () => {
          document.removeEventListener('click', suppressClick, true);
        };
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          cleanup();
        };
        document.addEventListener('click', suppressClick, true);

        // Safety cleanup: when pointer capture caused significant movement
        // (a real drag), the browser won't synthesize a click event, leaving
        // the listener to swallow the user's next intentional click. Remove
        // it after the current event cycle — any synthetic click from this
        // pointer-up sequence fires synchronously before setTimeout(0).
        setTimeout(cleanup, 0);
      }

      finishDrag(drop);
    };
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      const element = e.currentTarget as HTMLElement;
      // A second finger landing while the first still holds the element is
      // not a new gesture.
      const current = gestureRef.current;
      if (current && current.element.hasPointerCapture(current.pointerId)) {
        return;
      }
      // One that lost its capture without a pointerup has ended unseen.
      settleRef.current(false);

      // Only the pointer that began the gesture advances or ends it: on a
      // tablet a second finger moving or lifting elsewhere must not steer or
      // end a drag it did not start.
      const { pointerId } = e;
      const handleMove = (event: PointerEvent) => {
        if (event.pointerId === pointerId) moveRef.current(event);
      };
      const handleEnd = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        // A cancelled sequence (the browser claimed the gesture after all) is
        // not a release over whatever happened to be under the finger.
        settleRef.current(event.type !== 'pointercancel');
      };
      // The window lost the pointer without a pointerup or pointercancel (an
      // app switch, a release outside the browser).
      const handleBlur = () => settleRef.current(false);

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleEnd);
      document.addEventListener('pointercancel', handleEnd);
      window.addEventListener('blur', handleBlur);
      gestureRef.current = {
        pointerId,
        element,
        detach: () => {
          document.removeEventListener('pointermove', handleMove);
          document.removeEventListener('pointerup', handleEnd);
          document.removeEventListener('pointercancel', handleEnd);
          window.removeEventListener('blur', handleBlur);
        },
      };

      // Store pending drag - actual drag starts when threshold is exceeded
      pendingDragRef.current = {
        startPosition: { x: e.clientX, y: e.clientY },
        element,
      };
      beginScrollAware(e);
      element.setPointerCapture(pointerId);

      // Prevent default to avoid text selection during potential drag
      e.preventDefault();
    },
    [disabled, beginScrollAware],
  );

  // Disabling the source mid-gesture ends the gesture, and a drag with it.
  useEffect(() => {
    if (disabled) settleRef.current(false);
  }, [disabled]);

  // An unmount before anything was picked up leaves nothing to finish. A
  // live drag is left to run: its payload is in the store, and a virtualised
  // list unmounts a source scrolled out of view mid-drag.
  useEffect(
    () => () => {
      if (pendingDragRef.current) settleRef.current(false);
    },
    [],
  );

  const startKeyboardDrag = useCallback(
    (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      initializeDrag(
        element,
        {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
        'keyboard',
      );

      // Announce the enhanced grab message
      announce(
        intl.formatMessage(messages.grabbed, {
          name:
            latestRef.current.announcedName ??
            intl.formatMessage(messages.unnamedItem),
        }),
      );
    },
    [initializeDrag, announce, intl],
  );

  useEffect(() => () => updatePosition.cancel(), [updatePosition]);

  const setDragRef = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element;
      setScrollAwareRef(element);
    },
    [setScrollAwareRef],
  );

  const isDragging = dragMode !== 'none';

  const compatibleTargets = useMemo(() => {
    if (!isDragging) return [];
    return storeApi.getState().getCompatibleTargets();
  }, [isDragging, storeApi]);

  const navigateDropTargets = useCallback(
    (direction: 'next' | 'prev') => {
      if (compatibleTargets.length === 0) return;

      const nextIndex =
        direction === 'next'
          ? (currentDropTargetIndex + 1) % compatibleTargets.length
          : (currentDropTargetIndex - 1 + compatibleTargets.length) %
            compatibleTargets.length;

      setCurrentDropTargetIndex(nextIndex);
      const target = compatibleTargets[nextIndex];
      if (target) {
        updateDragPosition(
          target.x + target.width / 2,
          target.y + target.height / 2,
        );
        // Keyboard nav knows the target by index; pin activeDropTargetId
        // explicitly so the drop doesn't depend on elementsFromPoint
        // seeing the bin at the stored center — which is racy in WebKit
        // right after Ctrl+D (drag overlay mount) before layout stabilises.
        setActiveDropTarget(target.id);
        const description = getDropTargetDescription(
          nextIndex,
          compatibleTargets.length,
          target.announcedName,
          intl,
        );
        announce(getKeyboardDragAnnouncement('navigate', description, intl));
      }
    },
    [
      currentDropTargetIndex,
      updateDragPosition,
      setActiveDropTarget,
      announce,
      compatibleTargets,
      intl,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      // During keyboard drag mode, handle navigation and stop propagation
      // to prevent selection handlers from firing
      if (dragMode === 'keyboard') {
        e.preventDefault();
        e.stopPropagation();
        switch (e.key) {
          case 'ArrowDown':
          case 'ArrowRight':
            return navigateDropTargets('next');
          case 'ArrowUp':
          case 'ArrowLeft':
            return navigateDropTargets('prev');
          case 'Enter':
          case ' ':
            return finishDrag(true);
          case 'Escape':
            return finishDrag(false);
        }
        return;
      }

      // Initiate keyboard drag with Ctrl+D or Alt+Space
      // This avoids conflicts with Space/Enter used for selection
      const isCtrlD = e.ctrlKey && e.key.toLowerCase() === 'd';
      const isAltSpace = e.altKey && e.key === ' ';

      if (isCtrlD || isAltSpace) {
        e.preventDefault();
        e.stopPropagation();
        startKeyboardDrag(e.currentTarget as HTMLElement);
      } else if (e.key === 'Enter') {
        // Trigger click for selection - role="button" elements need this
        (e.currentTarget as HTMLElement).click();
      }
    },
    [disabled, dragMode, navigateDropTargets, finishDrag, startKeyboardDrag],
  );

  return useMemo(
    () => ({
      dragProps: {
        'ref': setDragRef,
        'onPointerDown': handlePointerDown,
        'onKeyDown': handleKeyDown,
        'role': 'button',
        'tabIndex': disabled ? -1 : 0,
        'aria-grabbed': isDragging,
        'aria-dropeffect': 'move',
        'aria-label': announcedName,
        'data-drag-armed': isArmed || undefined,
        'style': {
          cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
          touchAction,
          // Feedback that the hold has freed the drag, where the finger hides
          // most of the element. A filter keeps the element transform-free.
          filter: isArmed ? 'brightness(1.25)' : undefined,
          userSelect: 'none',
        },
      },
      isDragging,
    }),
    [
      setDragRef,
      handlePointerDown,
      handleKeyDown,
      isDragging,
      disabled,
      announcedName,
      isArmed,
      touchAction,
    ],
  );
}
