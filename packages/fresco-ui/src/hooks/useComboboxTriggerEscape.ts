'use client';

import { type KeyboardEvent, useState } from 'react';

/**
 * Lets Escape on a combobox's trigger close the combobox's own open popup,
 * instead of whatever surface the combobox sits in.
 *
 * WHY THIS EXISTS. Every other Base UI popup trigger — menu, select, popover —
 * handles Escape itself while its popup is open: it closes the popup and stops
 * the event, so a dialog behind it never sees the key. `Combobox.Trigger` does
 * not (checked against @base-ui/react 1.8.0 and its `master`): with the search
 * input inside the popup, Base UI gives the dismiss handling to that input and
 * leaves the trigger with none. Escape pressed while the trigger holds focus
 * therefore reaches `document`, where an enclosing dialog's dismiss listener —
 * registered when the dialog opened, so it runs first — closes the dialog,
 * taking the still-open combobox with it.
 *
 * The trigger holds focus with the popup open more often than it sounds:
 * Shift+Tab out of the search input lands on the trigger and leaves the popup
 * open, and Base UI only moves focus into a newly opened popup on the next
 * animation frame, so a keypress handled before that frame lands on the trigger
 * too. That second path is what made `Dialog > Popups Inside A Dialog` flaky
 * under a loaded CI run.
 *
 * Base UI's `actionsRef` can only unmount a combobox, not close it, so this
 * owns the `open` state: spread `open` and `onOpenChange` onto `Combobox.Root`,
 * and `onTriggerKeyDown` onto `Combobox.Trigger`. `onOpenChange` is called for
 * every close, including this one, so a caller resetting its search query
 * there keeps doing so.
 *
 * Pass `open` to keep a component's caller in control of it, as
 * `Combobox.Root` would: the popup then stays as the caller says, and Escape
 * on the trigger is still claimed by the open popup rather than whatever is
 * behind it.
 *
 * Delete this once Base UI's trigger handles Escape while open.
 */
export function useComboboxTriggerEscape({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [uncontrolledOpen, setOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;

    // What Base UI's own dismiss handler does on the other triggers.
    // `stopPropagation` keeps the key from reaching `document`, where the
    // enclosing dialog would close too.
    event.preventDefault();
    event.stopPropagation();
    handleOpenChange(false);
  };

  return { open, onOpenChange: handleOpenChange, onTriggerKeyDown };
}
