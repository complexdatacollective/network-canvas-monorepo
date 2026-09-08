import { Redo, Undo } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  defineToolbarChild,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarSeparator,
  type ToolbarGroupProps,
} from '@codaco/fresco-ui/SegmentedToolbar';
const messages = defineMessages({
  historyControls: {
    id: 'architect.projectNav.historyToolbarItems.historyControls',
    defaultMessage: 'History controls',
    description:
      'The aria-label text in components / ProjectNav / historyToolbarItems.',
  },
  undo: {
    id: 'architect.projectNav.historyToolbarItems.undo',
    defaultMessage: 'Undo',
    description:
      'The aria-label text in components / ProjectNav / historyToolbarItems.',
  },
  redo: {
    id: 'architect.projectNav.historyToolbarItems.redo',
    defaultMessage: 'Redo',
    description:
      'The aria-label text in components / ProjectNav / historyToolbarItems.',
  },
});

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
    const intl = useAppIntl();
    return (
      <ToolbarGroup
        ref={ref}
        aria-label={intl.formatMessage(messages.historyControls)}
      >
        <ToolbarIconButton
          aria-label={intl.formatMessage(messages.undo)}
          icon={<Undo />}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ToolbarSeparator />
        <ToolbarIconButton
          aria-label={intl.formatMessage(messages.redo)}
          icon={<Redo />}
          disabled={!canRedo}
          onClick={onRedo}
        />
      </ToolbarGroup>
    );
  },
);
