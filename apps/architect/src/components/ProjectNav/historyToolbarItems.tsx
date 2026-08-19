import { Redo, Undo } from 'lucide-react';

import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';

type HistoryToolbarItemsOptions = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * Build the shared history toolbar used by both whole-protocol pages and the
 * stage editor. Keep both controls present while either operation is possible
 * so their positions do not jump as the history cursor moves.
 */
export function getHistoryToolbarItems({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: HistoryToolbarItemsOptions): ToolbarSegment[] {
  if (!canUndo && !canRedo) {
    return [];
  }

  return [
    {
      type: 'button',
      id: 'undo',
      label: 'Undo',
      icon: <Undo />,
      disabled: !canUndo,
      // Undo can exhaust the history while it holds focus. Keep it in the
      // toolbar's roving focus so activation does not drop focus to <body>.
      focusableWhenDisabled: true,
      onClick: onUndo,
    },
    { type: 'separator', id: 'history-separator' },
    {
      type: 'button',
      id: 'redo',
      label: 'Redo',
      icon: <Redo />,
      disabled: !canRedo,
      // Redo has the same dynamic-disable focus contract as Undo.
      focusableWhenDisabled: true,
      onClick: onRedo,
    },
  ];
}
