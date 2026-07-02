'use client';

import { useCallback, useEffect, useState } from 'react';

// The keys that actually move a slider (plus Enter/Space, which commit a
// pristine value). Other keys — Tab, modifiers, etc. — must not reveal the
// value bubble, since nothing changed.
const ADJUSTMENT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Enter',
  ' ',
]);

// Tracks whether a slider is being actively adjusted — by pointer drag or by a
// value-changing keypress — so the value popover shows during interaction and
// hides at rest. Focus alone deliberately doesn't count: tabbing onto the
// control shouldn't reveal a value the participant hasn't chosen, and a pointer
// drag that leaves the nested input focused shouldn't keep the popover open
// after release. Pointer release is observed on the window because the drag can
// end outside the control's bounds.
export function useSliderActive() {
  const [pointerActive, setPointerActive] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);

  useEffect(() => {
    if (!pointerActive) return undefined;
    const clear = () => setPointerActive(false);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [pointerActive]);

  const onPointerDown = useCallback(() => setPointerActive(true), []);
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (ADJUSTMENT_KEYS.has(event.key)) setKeyboardActive(true);
  }, []);
  const onBlur = useCallback(() => setKeyboardActive(false), []);

  return {
    active: pointerActive || keyboardActive,
    onPointerDown,
    onKeyDown,
    onBlur,
  };
}
