import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AnimatePresence } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

import { usePortalContainer } from '../PortalContainer';
import { inertOthers } from '../utils/inertOthers';
import { ModalBackdrop } from './ModalBackdrop';

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
  forceBackdrop = false,
  backdropClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forceBackdrop?: boolean;
  backdropClassName?: string;
  children: ReactNode;
}) {
  const portalContainer = usePortalContainer();
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

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
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
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
  );
}
