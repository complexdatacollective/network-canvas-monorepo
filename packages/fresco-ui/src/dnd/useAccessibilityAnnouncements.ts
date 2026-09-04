'use client';

import { useCallback, useEffect, useRef } from 'react';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

import { resolveIntl } from '../utils/resolveIntl';

const messages = defineMessages({
  dropTarget: {
    id: 'frescoUi.dragAndDrop.dropTarget',
    defaultMessage: 'Drop target {position, number} of {total, number}',
    description:
      'Live-region description of the drop target keyboard focus has reached, when the target has no name of its own.',
  },
  namedDropTarget: {
    id: 'frescoUi.dragAndDrop.namedDropTarget',
    defaultMessage: 'Drop target {position, number} of {total, number}: {name}',
    description:
      'Live-region description of the drop target keyboard focus has reached; {name} is the target’s own name.',
  },
  instructions: {
    id: 'frescoUi.dragAndDrop.instructions',
    defaultMessage:
      'Use arrow keys to navigate between drop targets. Press Space or Enter to drop. Press Escape to cancel.',
    description:
      'Live-region instructions announced once when a keyboard drag begins.',
  },
  started: {
    id: 'frescoUi.dragAndDrop.started',
    defaultMessage: 'Started dragging. {details}',
    description:
      'Live-region announcement when a keyboard drag begins; {details} names what is being dragged.',
  },
  navigated: {
    id: 'frescoUi.dragAndDrop.navigated',
    defaultMessage: 'Navigated to drop target',
    description:
      'Live-region announcement after keyboard navigation reaches a drop target that supplied no description.',
  },
  dropped: {
    id: 'frescoUi.dragAndDrop.dropped',
    defaultMessage: 'Dropped item. {details}',
    description:
      'Live-region announcement after a keyboard drop; {details} names where it landed.',
  },
  cancelled: {
    id: 'frescoUi.dragAndDrop.cancelled',
    defaultMessage: 'Drag cancelled',
    description: 'Live-region announcement when a keyboard drag is abandoned.',
  },
});

/**
 * Custom hook for managing accessibility announcements in drag and drop operations.
 * Creates and manages an ARIA live region that is properly cleaned up with React's lifecycle.
 */
export function useAccessibilityAnnouncements() {
  const liveRegionRef = useRef<HTMLElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Create the live region on mount
  useEffect(() => {
    if (!liveRegionRef.current) {
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');

      // Visually hidden but accessible to screen readers
      liveRegion.style.position = 'absolute';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.padding = '0';
      liveRegion.style.margin = '-1px';
      liveRegion.style.overflow = 'hidden';
      liveRegion.style.clipPath = 'inset(0)';
      liveRegion.style.whiteSpace = 'nowrap';
      liveRegion.style.border = '0';

      document.body.appendChild(liveRegion);
      liveRegionRef.current = liveRegion;
    }

    // Cleanup on unmount
    return () => {
      if (liveRegionRef.current?.parentNode) {
        liveRegionRef.current.parentNode.removeChild(liveRegionRef.current);
        liveRegionRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const announce = useCallback((message: string): void => {
    const region = liveRegionRef.current;
    if (!region) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    region.textContent = message;

    // Clear after announcement to allow repeated announcements of the same message
    timeoutRef.current = window.setTimeout(() => {
      if (region.textContent === message) {
        region.textContent = '';
      }
      timeoutRef.current = null;
    }, 1000);
  }, []);

  return { announce };
}

// Keyboard navigation helpers (kept as pure functions). Each takes the
// host's formatter rather than reaching for `useAppIntl`, so it stays callable
// from outside a render — and, absent one, renders the English it always did.
export function getDropTargetDescription(
  index: number,
  total: number,
  targetName?: string,
  intl?: IntlShape,
): string {
  const values = { position: index + 1, total };
  return targetName
    ? resolveIntl(intl).formatMessage(messages.namedDropTarget, {
        ...values,
        name: targetName,
      })
    : resolveIntl(intl).formatMessage(messages.dropTarget, values);
}

export function getKeyboardDragAnnouncement(
  action: 'start' | 'navigate' | 'drop' | 'cancel',
  details?: string,
  intl?: IntlShape,
): string {
  const formatter = resolveIntl(intl);
  switch (action) {
    case 'start':
      // Instructions are their own message rather than interpolated into the
      // first: a translator moving the details to the end of the sentence
      // should not have to carry three sentences of keyboard help with them.
      return `${formatter.formatMessage(messages.started, {
        details: details ?? '',
      })} ${formatter.formatMessage(messages.instructions)}`;
    case 'navigate':
      return details ?? formatter.formatMessage(messages.navigated);
    case 'drop':
      return formatter.formatMessage(messages.dropped, {
        details: details ?? '',
      });
    case 'cancel':
      return formatter.formatMessage(messages.cancelled);
    default:
      return '';
  }
}
