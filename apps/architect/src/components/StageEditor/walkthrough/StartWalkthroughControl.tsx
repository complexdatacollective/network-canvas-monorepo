import { CircleHelp } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  defineToolbarChild,
  ToolbarButton,
  type ToolbarButtonProps,
} from '@codaco/fresco-ui/SegmentedToolbar';

import { openWalkthrough } from './walkthroughStore';

const messages = defineMessages({
  start: {
    id: 'architect.stageEditor.walkthrough.start',
    defaultMessage: 'Walk me through this',
    description:
      'Button in the stage editor toolbar that opens a step-by-step guide to the stage being edited, in a floating panel. It is hidden while the guide is open.',
  },
});

/**
 * Opens the walkthrough of the stage on screen. The toolbar renders its
 * controls outside the stage edit, so the stage comes in as a prop.
 */
export const StartWalkthroughControl = defineToolbarChild(
  function StartWalkthroughControl({
    ref,
    stage,
  }: Readonly<{
    ref?: ToolbarButtonProps['ref'];
    /** The id of the stage the walkthrough is about. */
    stage: string;
  }>) {
    const intl = useAppIntl();
    return (
      <ToolbarButton
        ref={ref}
        icon={<CircleHelp />}
        color="info"
        onClick={(event) => openWalkthrough(event.currentTarget, stage)}
      >
        {intl.formatMessage(messages.start)}
      </ToolbarButton>
    );
  },
);
