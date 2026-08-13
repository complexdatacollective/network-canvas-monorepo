import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useSafeAnimate } from './useSafeAnimate';

/**
 * The least time a keyboard-initiated press stays visibly depressed. A quick
 * Enter or Space tap releases faster than the press spring can be seen at
 * all, which reads as the activation giving no feedback. The key press
 * reaches full depth by KEY_PRESS_DOWN_S, so the whole tap cycle stays
 * tight: down, a beat at the bottom, and a stiff spring back.
 */
const MIN_KEY_PRESS_VISIBLE_MS = 120;

/** A key stroke is instantaneous, so its press dives rather than eases. */
const KEY_PRESS_DOWN_S = 0.09;

type UseNodeInteractionsOptions = {
  /** Whether the node has a click handler (enables press animation) */
  hasClickHandler?: boolean;
  /** Whether the node is disabled */
  disabled?: boolean;
};

type UseNodeInteractionsReturn = {
  /** Ref callback to attach to the node element (for motion scope) */
  scope: React.RefObject<HTMLElement | null>;
  /** Props to spread on the node element */
  nodeProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onKeyUp: (e: React.KeyboardEvent) => void;
    style: CSSProperties;
  };
  /** Whether the node is currently being pressed */
  isPressed: boolean;
};

/**
 * Hook for managing Node interaction behaviors.
 *
 * Provides:
 * - Press animation (scale) when hasClickHandler is true
 * - Base styles (touch-action, user-select)
 *
 * Note: Cursor is NOT managed by this hook. The Node component determines
 * cursor based on external style props (for drag systems) or onClick presence.
 *
 * @example
 * ```tsx
 * const { scope, nodeProps, isPressed } = useNodeInteractions({
 *   hasClickHandler: !!onClick,
 *   disabled: false,
 * });
 *
 * return (
 *   <motion.button ref={scope} {...nodeProps}>
 *     Node
 *   </motion.button>
 * );
 * ```
 */
export function useNodeInteractions(
  options: UseNodeInteractionsOptions = {},
): UseNodeInteractionsReturn {
  const { hasClickHandler = false, disabled = false } = options;

  const [scope, animate] = useSafeAnimate<HTMLElement>();
  const [isPressed, setIsPressed] = useState(false);

  // A key tap can be over in well under the time the press spring needs to
  // become visible, so the release is held back until the press has been on
  // screen this long. A finger or mouse button provides its own physical
  // feedback and dwells naturally, so pointer releases are never delayed.
  const keyPressedAtRef = useRef(0);
  const keyReleaseTimerRef = useRef<number | null>(null);

  const cancelPendingKeyRelease = useCallback(() => {
    if (keyReleaseTimerRef.current !== null) {
      window.clearTimeout(keyReleaseTimerRef.current);
      keyReleaseTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelPendingKeyRelease, [cancelPendingKeyRelease]);

  // Enable press animation when there's a click handler and not disabled
  const enablePressAnimation = hasClickHandler && !disabled;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.button !== 0) return; // Only respond to primary button

      // A held-back key release must not pop a press the pointer now owns.
      cancelPendingKeyRelease();
      if (enablePressAnimation && scope.current) {
        setIsPressed(true);
        animate(scope.current, { scale: 0.92 });
      }
    },
    [disabled, enablePressAnimation, animate, scope, cancelPendingKeyRelease],
  );

  const resetPress = useCallback(() => {
    if (!isPressed) return;
    setIsPressed(false);

    if (scope.current) {
      animate(
        scope.current,
        { scale: 1 },
        { type: 'spring', stiffness: 700, damping: 20 },
      );
    }
  }, [isPressed, animate, scope]);

  // Losing the window ends the press without any of the events that normally
  // would: no pointerup, no pointercancel, no keyup. Left alone the node stays
  // visibly depressed for as long as it is mounted, and anything a caller
  // defers until the press lifts — the selection ring — waits with it.
  useEffect(() => {
    const handleWindowBlur = () => {
      cancelPendingKeyRelease();
      resetPress();
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [cancelPendingKeyRelease, resetPress]);

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent) => {
      resetPress();
    },
    [resetPress],
  );

  // Also reset on pointer cancel and leave to handle edge cases
  const handlePointerCancel = useCallback(
    (_e: React.PointerEvent) => {
      resetPress();
    },
    [resetPress],
  );

  const handlePointerLeave = useCallback(
    (_e: React.PointerEvent) => {
      resetPress();
    },
    [resetPress],
  );

  // Keyboard handlers for Enter and Space (keys that trigger button clicks)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.repeat) return; // Prevent repeated animation from key repeat

      cancelPendingKeyRelease();
      keyPressedAtRef.current = performance.now();
      if (enablePressAnimation && scope.current) {
        setIsPressed(true);
        animate(
          scope.current,
          { scale: 0.92 },
          { duration: KEY_PRESS_DOWN_S, ease: 'easeOut' },
        );
      }
    },
    [disabled, enablePressAnimation, animate, scope, cancelPendingKeyRelease],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const shown = performance.now() - keyPressedAtRef.current;
      const remaining = MIN_KEY_PRESS_VISIBLE_MS - shown;
      if (remaining <= 0) {
        resetPress();
        return;
      }
      cancelPendingKeyRelease();
      keyReleaseTimerRef.current = window.setTimeout(() => {
        keyReleaseTimerRef.current = null;
        resetPress();
      }, remaining);
    },
    [resetPress, cancelPendingKeyRelease],
  );

  return {
    scope,
    nodeProps: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      style: {
        touchAction: 'manipulation',
        userSelect: 'none',
        // iOS Safari otherwise raises its own callout on press-and-hold, which
        // would fight any hold gesture the node defines.
        WebkitTouchCallout: 'none',
      },
    },
    isPressed,
  };
}
