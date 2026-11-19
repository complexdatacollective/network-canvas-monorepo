import { CircleHelp } from 'lucide-react';
import { type Ref, useEffect, useRef } from 'react';
import { useMergeRefs } from 'react-best-merge-refs';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ProgressRing from '@codaco/fresco-ui/ProgressRing';
import {
  defineToolbarChild,
  ToolbarButton,
  ToolbarIconButton,
} from '@codaco/fresco-ui/SegmentedToolbar';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';

import { useWalkthrough } from './useWalkthrough';
import {
  openWalkthrough,
  setWalkthroughCollapsed,
  stepWithin,
  takeWalkthroughFocus,
  useWalkthroughState,
} from './walkthroughStore';

const messages = defineMessages({
  start: {
    id: 'architect.stageEditor.walkthrough.start',
    defaultMessage: 'Walk me through this',
    description:
      'Button in the stage editor toolbar that opens a step-by-step guide to the stage being edited, in a floating panel. It is hidden while the guide is open.',
  },
  progressShort: {
    id: 'architect.stageEditor.walkthrough.progressShort',
    defaultMessage: '{index, number}/{total, number}',
    description:
      'Compact step count in the centre of the progress ring the minimized walkthrough becomes in the stage editor toolbar, such as “3/18”. index is the current step and total the number of steps.',
  },
  resumeEyebrow: {
    id: 'architect.stageEditor.walkthrough.resumeEyebrow',
    defaultMessage: 'Resume walkthrough · {index} of {total}',
    description:
      'Small heading in the tooltip of the minimized walkthrough in the stage editor toolbar, above the title of the step the researcher was on.',
  },
});

/**
 * The walkthrough's place in the stage editor's toolbar: a button that starts
 * it while it is closed, and a progress ring that restores it while it is
 * minimised. The toolbar hides it while the panel is open. It renders outside
 * the stage edit, so the stage comes in as props.
 */
export const WalkthroughToolbarControl = defineToolbarChild(
  function WalkthroughToolbarControl({
    ref: toolbarRef,
    stage,
    type,
  }: Readonly<{
    ref?: Ref<HTMLButtonElement>;
    /** The id of the stage the walkthrough is about. */
    stage: string;
    /** The stage's type, which picks its walkthrough. */
    type: string;
  }>) {
    const intl = useAppIntl();
    const ref = useRef<HTMLButtonElement | null>(null);
    const mergedRef = useMergeRefs({ ref, toolbarRef });
    const open = useWalkthroughState((state) => state.open);
    const step = useWalkthroughState((state) => state.step);
    const steps = useWalkthrough(type)?.steps;

    // Minimising or closing the walkthrough hands focus to this control.
    useEffect(() => {
      if (takeWalkthroughFocus()) ref.current?.focus({ preventScroll: true });
    }, []);

    // Offered only once its steps have loaded: a control that opened a
    // walkthrough still loading, or one that failed to, would open a panel
    // that never appears and hide itself.
    if (steps === undefined || steps.length === 0) return null;

    if (!open) {
      return (
        <ToolbarButton
          ref={mergedRef}
          icon={<CircleHelp />}
          variant="default"
          color="info"
          onClick={(event) => openWalkthrough(event.currentTarget, stage)}
        >
          {intl.formatMessage(messages.start)}
        </ToolbarButton>
      );
    }

    const index = stepWithin(step, steps.length);
    const title = steps[index]?.title ?? '';
    const values = { index: index + 1, total: steps.length, title };
    return (
      <ToolbarIconButton
        ref={mergedRef}
        // Read only by a screen reader, so English, like the step title it
        // names: screen-reader text stays out of the catalogs.
        lang="en"
        aria-label={`Resume walkthrough, step ${values.index} of ${values.total}: ${title}`}
        icon={
          <ProgressRing
            value={(index + 1) / steps.length}
            className="size-10 shrink-0"
          >
            <span aria-hidden className="font-heading text-2xs font-extrabold">
              {intl.formatMessage(messages.progressShort, values)}
            </span>
          </ProgressRing>
        }
        tooltip={
          <span className="flex flex-col gap-0.5">
            <Eyebrow render={<span />}>
              {intl.formatMessage(messages.resumeEyebrow, values)}
            </Eyebrow>
            <span className="font-heading font-bold">{title}</span>
          </span>
        }
        tooltipSide="top"
        onClick={() => setWalkthroughCollapsed(false)}
      />
    );
  },
);
