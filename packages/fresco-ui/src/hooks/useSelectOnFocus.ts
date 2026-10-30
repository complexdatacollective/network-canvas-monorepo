'use client';

import { type FocusEvent, type MouseEvent, useRef } from 'react';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

const holdsWholeValue = (control: TextControl) =>
  control.selectionStart === 0 && control.selectionEnd === control.value.length;

/**
 * Handlers that select a text control's whole value as it gains focus, so that
 * typing replaces a name nobody chose (a proposed stage name, a template's
 * name) rather than landing inside it. Spread them onto the control:
 *
 * ```tsx
 * const selectOnFocus = useSelectOnFocus((control) => control.value === proposed);
 * <input {...selectOnFocus} />
 * ```
 *
 * `shouldSelect` is asked at each focus; without it nothing is selected.
 *
 * Selecting is not enough on its own, because the click that follows puts the
 * caret where the pointer is:
 *
 * - When the press is what focused the control, Safari places the caret on the
 *   mouseup that ends it, so that one mouseup is swallowed.
 * - When the control was focused some other way (`autoFocus` in a dialog, or
 *   Tab), a researcher still clicks into it before typing. That first press
 *   keeps the selection, as long as the whole value is still selected and
 *   `shouldSelect` still holds (a name typed and then selected with Ctrl+A is
 *   no longer a proposal).
 *
 * Either way only once: a later click into a focused control places the caret
 * as ever.
 */
export default function useSelectOnFocus<T extends TextControl>(
  shouldSelect?: (control: T) => boolean,
) {
  const pressFocusing = useRef(false);
  const keepSelectionOnMouseUp = useRef(false);
  const keepSelectionOnNextPress = useRef(false);

  const onMouseDown = (event: MouseEvent<T>) => {
    const control = event.currentTarget;
    const focused = control.ownerDocument.activeElement === control;
    pressFocusing.current = !focused;
    if (
      focused &&
      keepSelectionOnNextPress.current &&
      event.button === 0 &&
      holdsWholeValue(control) &&
      (shouldSelect?.(control) ?? false)
    ) {
      event.preventDefault();
    }
    keepSelectionOnNextPress.current = false;
  };

  const onFocus = (event: FocusEvent<T>) => {
    const control = event.currentTarget;
    const selecting = shouldSelect?.(control) ?? false;
    if (selecting) control.select();
    keepSelectionOnMouseUp.current = selecting && pressFocusing.current;
    keepSelectionOnNextPress.current = selecting && !pressFocusing.current;
    pressFocusing.current = false;
  };

  const onMouseUp = (event: MouseEvent<T>) => {
    if (!keepSelectionOnMouseUp.current) return;
    keepSelectionOnMouseUp.current = false;
    event.preventDefault();
  };

  return { onFocus, onMouseDown, onMouseUp };
}
