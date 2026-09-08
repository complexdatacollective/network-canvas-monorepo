'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { usePortalContainer } from '../PortalContainer';
import { asFinalFocusTarget } from '../utils/finalFocus';
import { inertOthers } from '../utils/inertOthers';
import { ModalBackdrop } from './ModalBackdrop';
import { ModalOpenerContext } from './ModalOpener';

/**
 * A modal component designed to render full screen "overlay" UIs using
 * Base-UI's Dialog system. Handles open/close state and animation of
 * backdrop and content via motion's AnimatePresence.
 *
 * Use with ModalPopup or similar based on Dialog.Popup for the content.
 *
 * @see ModalPopup for a popup component to use within the Modal.
 * @see Dialog for an example of using this component to create a modal overlay.
 *
 * @param open Whether the modal is open.
 * @param onOpenChange Callback when the open state changes.
 * @param dismissible Whether the user may dismiss this modal by pressing
 * outside it or pressing Escape. See the prop's own note below.
 * @param forceBackdrop Whether to render the backdrop when this modal is nested
 * within another dialog.
 * @param backdropClassName Additional classes for the modal backdrop.
 * @param children The content of the modal.
 *
 *
 */
export default function Modal({
  open,
  onOpenChange,
  dismissible = true,
  forceBackdrop = false,
  backdropClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When false, neither an outside press nor Escape closes this modal, and
   * `onOpenChange` is not called for either. The surface inside it is
   * responsible for offering whatever way out it does allow (or none, for a
   * forced flow) — hiding a close button on its own does not hold a modal
   * open.
   *
   * Two mechanisms, because Base UI 1.7 has a `Dialog.Root` prop for one of
   * these routes and not the other: `disablePointerDismissal` refuses the
   * outside press at source, and the Escape key is refused by cancelling the
   * change event it raises, which returns before Base UI acts on it.
   * @default true
   */
  dismissible?: boolean;
  forceBackdrop?: boolean;
  backdropClassName?: string;
  children: ReactNode;
}) {
  const portalContainer = usePortalContainer();
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  /**
   * Remember the control that was focused when this modal opened, so the popup
   * inside it can return focus there on close unless the caller names somewhere
   * better.
   *
   * This lives HERE, not in `Dialog`, because `Modal` is the one layer every
   * modal surface passes through. `Dialog` is only one of them: Architect's
   * variable pill editor, variable spotlight and nav drawer, and Fresco's
   * mobile nav drawer, all render `ModalPopup` inside a `Modal` directly. Those
   * are controlled too, so Base UI has no `Dialog.Trigger` to go back to and
   * its remaining fallbacks resolve to `<body>` or to an unrelated control
   * focused earlier in the session.
   *
   * Captured during the render that flips `open` to true. A layout effect would
   * be too late: Base UI's focus manager lives BELOW this component, and child
   * effects run first, so by then focus is already inside the popup. Reading
   * `document` is guarded by that transition, so it never runs during SSR.
   */
  // Starts `false` even when `open` is already true, so a modal that MOUNTS
  // open still captures. Two of Architect's own dialogs do exactly that: they
  // bump a `key` in the same render that shows them, so the whole subtree
  // remounts with `open` already true and a transition-only capture would never
  // fire for them.
  const [wasOpen, setWasOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && typeof document !== 'undefined') {
      openerRef.current = asFinalFocusTarget(document.activeElement);
    }
  }

  /**
   * Isolate everything outside this modal while it is open. See
   * `inertOthers` for why Base UI's own `aria-hidden`-only marking is not
   * enough.
   *
   * The portal node is the boundary rather than the popup: it also holds the
   * backdrop and Base UI's focus guards, and the guards must stay tabbable for
   * the focus trap to loop.
   *
   * Keyed on `open` rather than on unmount deliberately. `AnimatePresence`
   * keeps the portal mounted for the exit animation, and Base UI returns focus
   * at the END of that animation — so releasing on unmount would race, and
   * could leave the element focus is being returned TO still inert when
   * `focus()` runs. Flipping `open` releases first, by a wide margin.
   */
  useEffect(() => {
    if (!open || !portalNode) return undefined;
    // Only isolate for a real dialog. `Modal` is also used for chrome that
    // merely covers the page — Architect's protocol-loading overlay renders a
    // spinner with no `Dialog.Popup` at all, so Base UI's own focus manager
    // never mounts either. Making the whole document inert for that would take
    // the page out of the accessibility tree with nothing to replace it.
    if (!portalNode.querySelector('[role="dialog"], [role="alertdialog"]')) {
      return undefined;
    }
    return inertOthers([portalNode]);
  }, [open, portalNode]);

  return (
    <ModalOpenerContext.Provider value={openerRef}>
      <BaseDialog.Root
        open={open}
        disablePointerDismissal={!dismissible}
        onOpenChange={(nextOpen, eventDetails) => {
          // `disablePointerDismissal` covers the outside press (and, for a
          // non-modal dialog, focus leaving it); Escape has no equivalent
          // prop, so it arrives here and is cancelled. Cancelling returns
          // before Base UI dispatches the change, so nothing downstream —
          // including the caller's `onOpenChange` — observes a close.
          if (
            !nextOpen &&
            !dismissible &&
            eventDetails.reason === 'escape-key'
          ) {
            eventDetails.cancel();
            return;
          }

          onOpenChange(nextOpen);
        }}
      >
        <AnimatePresence>
          {open && (
            <BaseDialog.Portal
              ref={setPortalNode}
              container={portalContainer ?? undefined}
              keepMounted
            >
              <ModalBackdrop
                forceRender={forceBackdrop}
                className={backdropClassName}
              />
              {children}
            </BaseDialog.Portal>
          )}
        </AnimatePresence>
      </BaseDialog.Root>
    </ModalOpenerContext.Provider>
  );
}
