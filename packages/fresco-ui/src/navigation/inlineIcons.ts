import {
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoveLeft,
  MoveRight,
} from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Icons that point along the line of text: "back" and "forward". In a
 * right-to-left interface back is to the right, so these mirror there.
 */
const INLINE_ICONS: ReadonlySet<unknown> = new Set([
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoveLeft,
  MoveRight,
]);

/**
 * The class that mirrors an icon in a right-to-left interface when it points
 * along the line of text, and nothing for any other icon. For components that
 * draw an icon they were handed, so a host's arrow turns without the host
 * having to remember it.
 */
export function inlineIconClass(
  icon: ComponentType<{ className?: string }>,
): string | undefined {
  return INLINE_ICONS.has(icon) ? 'rtl:-scale-x-100' : undefined;
}
