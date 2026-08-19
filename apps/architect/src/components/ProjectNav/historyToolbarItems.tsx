import { Redo, Undo } from 'lucide-react';

import {
  defineToolbarChild,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarSeparator,
  type ToolbarGroupProps,
} from '@codaco/fresco-ui/SegmentedToolbar';

type HistoryToolbarControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  ref?: ToolbarGroupProps['ref'];
};

/**
 * Shared history controls used by both whole-protocol pages and the stage
 * editor. Keep both controls present while either operation is possible so
 * their positions do not jump as the history cursor moves.
 */
export const HistoryToolbarControls = defineToolbarChild(
  function HistoryToolbarControls({
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    ref,
  }: HistoryToolbarControlsProps) {
    return (
      <ToolbarGroup ref={ref} aria-label="History controls">
        <ToolbarIconButton
          aria-label="Undo"
          icon={<Undo />}
          disabled={!canUndo}
          // Undo can exhaust the history while it holds focus. Keep it in the
          // toolbar's roving focus so activation does not drop focus to <body>.
          focusableWhenDisabled
          onClick={onUndo}
        />
        <ToolbarSeparator />
        <ToolbarIconButton
          aria-label="Redo"
          icon={<Redo />}
          disabled={!canRedo}
          // Redo has the same dynamic-disable focus contract as Undo.
          focusableWhenDisabled
          onClick={onRedo}
        />
      </ToolbarGroup>
    );
  },
);
