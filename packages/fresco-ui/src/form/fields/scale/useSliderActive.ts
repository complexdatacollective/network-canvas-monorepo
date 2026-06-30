'use client';

import { useCallback, useEffect, useState } from 'react';

// Tracks whether a slider is being actively adjusted — by pointer drag or by
// keyboard focus — so the value popover shows during interaction and hides at
// rest. Pointer release is observed on the window because the drag can end
// outside the control's bounds.
export function useSliderActive() {
  const [pointerActive, setPointerActive] = useState(false);
  const [focused, setFocused] = useState(false);

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
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  return { active: pointerActive || focused, onPointerDown, onFocus, onBlur };
}
