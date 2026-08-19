'use client';

import { createContext, useContext, type RefObject } from 'react';

/**
 * The control that was focused when the nearest enclosing `Modal` opened.
 *
 * Held as a ref rather than a value so that reading it is deferred to the
 * moment focus is actually returned, and so capturing it never re-renders the
 * popup. Lives in its own module so `ModalPopup` can read it without importing
 * `Modal` itself.
 */
export const ModalOpenerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * The opener remembered by the nearest enclosing `Modal`, for a popup that
 * needs a focus-return target of last resort. `null` outside a `Modal`.
 */
export const useModalOpener = (): RefObject<HTMLElement | null> | null =>
  useContext(ModalOpenerContext);
