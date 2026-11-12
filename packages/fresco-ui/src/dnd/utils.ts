import type { HitDetector } from './types';

// Hit detection strategies

// Production: uses elementsFromPoint for correct visual stacking order
export const domHitDetector: HitDetector = (x, y, dropTargets) => {
  const elementsAtPoint = document.elementsFromPoint(x, y);

  for (const element of elementsAtPoint) {
    const zoneId = element.getAttribute('data-zone-id');
    if (zoneId) {
      const target = dropTargets.get(zoneId);
      if (target?.canDrop) {
        return zoneId;
      }
    }
  }

  return null;
};

// Testing: uses geometric bounds checking (no DOM required)
export const boundsHitDetector: HitDetector = (x, y, dropTargets) => {
  for (const [id, target] of dropTargets) {
    if (
      target.canDrop &&
      x >= target.x &&
      x <= target.x + target.width &&
      y >= target.y &&
      y <= target.y + target.height
    ) {
      return id;
    }
  }

  return null;
};

// Performance utilities for drag and drop

// Throttle function using requestAnimationFrame
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- published export: removing `TReturn` would break consumers that pass it explicitly
export function rafThrottle<TArgs extends readonly unknown[], TReturn = void>(
  fn: (...args: TArgs) => TReturn,
): ((...args: TArgs) => void) & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: TArgs | null = null;

  const throttled = (...args: TArgs) => {
    lastArgs = args;

    rafId ??= requestAnimationFrame(() => {
      if (lastArgs !== null) {
        fn(...lastArgs);
      }
      rafId = null;
    });
  };

  // Add cancel method
  const cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return Object.assign(throttled, { cancel });
}

// Get element bounds with transform support (viewport coordinates)
export function getElementBounds(element: HTMLElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export const findSourceZone = (element: HTMLElement | null): string | null => {
  // Find the closest parent with the data-zone-id attribute (used by drop targets)
  const sourceZoneElement = element?.closest('[data-zone-id]');

  // Return the attribute's value, or null if not found
  return sourceZoneElement?.getAttribute('data-zone-id') ?? null;
};
