import { Keyboard } from '@capacitor/keyboard';
import { useEffect, useRef, useState } from 'react';

import type { NavigationOrientation } from '@codaco/interview';

import { isCapacitor } from './platform';

// Keep in sync with the Shell's internal aspect-ratio breakpoint
// (@codaco/interview): tall viewports get a horizontal (bottom) nav bar, wide
// ones get a vertical (side) rail.
const HORIZONTAL_NAV_QUERY = '(max-aspect-ratio: 5/4)';

function readOrientation(): NavigationOrientation {
  return window.matchMedia(HORIZONTAL_NAV_QUERY).matches
    ? 'horizontal'
    : 'vertical';
}

/**
 * Resolve the interview Shell's navigation orientation for this host.
 *
 * On web/desktop we return `undefined` and let the Shell derive the orientation
 * from the viewport aspect ratio itself.
 *
 * On a Capacitor tablet the software keyboard resizes the viewport, which would
 * otherwise flip the nav between a side rail and a bottom bar mid-interview — a
 * portrait iPad's keyboard shrinks the height enough to push the aspect ratio
 * past the breakpoint. We mirror the Shell's aspect-ratio logic but freeze the
 * value while the keyboard is open (via the @capacitor/keyboard events), so a
 * genuine device rotation still switches orientation while the keyboard never
 * does.
 */
export function useNavigationOrientation(): NavigationOrientation | undefined {
  const [orientation, setOrientation] = useState<NavigationOrientation>(() =>
    isCapacitor ? readOrientation() : 'vertical',
  );
  const keyboardOpenRef = useRef(false);

  useEffect(() => {
    if (!isCapacitor) return;

    const query = window.matchMedia(HORIZONTAL_NAV_QUERY);
    const sync = () => {
      // Ignore viewport changes while the keyboard is open; recompute once it
      // has fully hidden.
      if (keyboardOpenRef.current) return;
      setOrientation(query.matches ? 'horizontal' : 'vertical');
    };

    sync();
    query.addEventListener('change', sync);

    // `keyboardWillShow` raises the guard before the resize lands;
    // `keyboardDidHide` fires once the viewport has settled back.
    const showHandle = Keyboard.addListener('keyboardWillShow', () => {
      keyboardOpenRef.current = true;
    });
    const hideHandle = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpenRef.current = false;
      sync();
    });

    return () => {
      query.removeEventListener('change', sync);
      void showHandle.then((handle) => handle.remove());
      void hideHandle.then((handle) => handle.remove());
    };
  }, []);

  return isCapacitor ? orientation : undefined;
}
