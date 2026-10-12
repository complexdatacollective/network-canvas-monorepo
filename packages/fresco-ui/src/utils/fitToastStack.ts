/** The parts of a Base UI toast object that decide where it sits in the stack. */
type StackedToast = {
  id: string;
  height?: number;
  limited?: boolean;
  transitionStatus?: 'starting' | 'ending';
};

/** Lengths, in pixels, that bound the expanded stack. */
type StackSpace = {
  /** Height the expanded stack may occupy above its bottom edge. */
  available: number;
  /** Space Base UI's layout leaves between expanded toasts. */
  gap: number;
  /** Height of the indicator shown above the stack when toasts are hidden. */
  indicator: number;
};

type StackFit = {
  /** Toasts the expanded stack has no room for. */
  overflowingIds: ReadonlySet<string>;
  /** Every toast not currently shown: the overflowing ones and those past the provider's `limit`. */
  hiddenCount: number;
  /** Distance from the stack's bottom edge to the top of the topmost shown toast. */
  extent: number;
};

/**
 * Decides which toasts fit when the stack is expanded, newest first, leaving
 * room for the "more notifications" indicator whenever any are hidden.
 *
 * Mirrors the layout Base UI drives through its CSS variables: expanded, each
 * toast is translated up by the height of every toast in front of it
 * (`--toast-offset-y`, which still counts a toast animating out — Base UI
 * zeroes its height as it starts closing) plus one gap per visible toast in
 * front of it (`--toast-index`, which skips toasts animating out).
 *
 * Each toast sits above the one in front of it, so the toasts that fit are
 * always the newest few. The frontmost toast is always shown.
 */
export function fitToastStack(
  toasts: readonly StackedToast[],
  { available, gap, indicator }: StackSpace,
): StackFit {
  const tops = new Map<string, number>();
  let offsetY = 0;
  let visibleIndex = 0;
  for (const toast of toasts) {
    const height = toast.height ?? 0;
    if (toast.transitionStatus !== 'ending') {
      tops.set(toast.id, offsetY + visibleIndex * gap + height);
      visibleIndex += 1;
    }
    offsetY += height;
  }

  const active = toasts.filter((toast) => toast.transitionStatus !== 'ending');
  const limitedCount = active.filter((toast) => toast.limited).length;
  const candidates = active.filter((toast) => !toast.limited);

  const countFitting = (bound: number) => {
    const firstMisfit = candidates.findIndex(
      (toast, index) => index > 0 && (tops.get(toast.id) ?? 0) > bound,
    );
    return firstMisfit === -1 ? candidates.length : firstMisfit;
  };

  let shownCount = countFitting(available);
  if (shownCount < candidates.length || limitedCount > 0) {
    shownCount = countFitting(available - indicator - gap);
  }

  const topmost = candidates[shownCount - 1];
  return {
    overflowingIds: new Set(
      candidates.slice(shownCount).map((toast) => toast.id),
    ),
    hiddenCount: candidates.length - shownCount + limitedCount,
    extent: topmost ? (tops.get(topmost.id) ?? 0) : 0,
  };
}
