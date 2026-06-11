import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

// Enter must additionally skip focused buttons/links (they handle Enter
// themselves); arrows still work there so a focused chevron doesn't trap
// deck navigation.
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'BUTTON' || target.tagName === 'A') return true;
  return target.closest('button, a, [role="button"], [role="link"]') !== null;
}

type DeckKeyboardOptions = {
  enabled: boolean;
  onStep: (direction: -1 | 1) => void;
  onActivate: () => void;
};

// Window-level so the deck responds without holding focus (matching the
// old Swiper keyboard module with onlyInViewport: false).
export function useDeckKeyboard({
  enabled,
  onStep,
  onActivate,
}: DeckKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        onStep(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key === 'Enter') {
        if (isEditableTarget(event.target) || isInteractiveTarget(event.target))
          return;
        event.preventDefault();
        onActivate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onStep, onActivate]);
}
