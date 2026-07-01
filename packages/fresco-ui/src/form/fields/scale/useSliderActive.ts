'use client';

import { useCallback, useEffect, useState } from 'react';

// Tracks whether a slider is being actively adjusted — by pointer drag or by
// keyboard input — so the value popover shows during interaction and hides at
// rest. Focus alone deliberately doesn't count: tabbing onto the control
// shouldn't reveal a value the participant hasn't chosen, and a pointer drag
// that leaves the nested input focused shouldn't keep the popover open after
// release. Pointer release is observed on the window because the drag can end
// outside the control's bounds.
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
  const onKeyDown = useCallback(() => setKeyboardActive(true), []);
  const onBlur = useCallback(() => setKeyboardActive(false), []);

  return {
    active: pointerActive || keyboardActive,
    onPointerDown,
    onKeyDown,
    onBlur,
  };
}
