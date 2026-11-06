import { type Ref, useCallback, useEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  defineToolbarChild,
  ToolbarIconButton,
} from '@codaco/fresco-ui/SegmentedToolbar';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';

import { ProgressRing } from './StageWalkthrough';
import {
  setWalkthroughCollapsed,
  takeWalkthroughFocus,
} from './walkthroughStore';

const messages = defineMessages({
  resumeEyebrow: {
    id: 'architect.stageEditor.walkthrough.resumeEyebrow',
    defaultMessage: 'Resume walkthrough · {index} of {total}',
    description:
      'Small heading in the tooltip of the minimised walkthrough in the stage editor toolbar, above the title of the step the researcher was on.',
  },
  resumeLabel: {
    id: 'architect.stageEditor.walkthrough.resumeLabel',
    defaultMessage: 'Resume walkthrough, step {index} of {total}: {title}',
    description:
      'Accessible name of the minimised walkthrough button in the stage editor toolbar. It opens the walkthrough again at the step named.',
  },
});

/**
 * The walkthrough minimised to a progress ring in the editor's toolbar, which
 * opens it again where the researcher left off. The toolbar renders its
 * controls outside the stage edit, so the step comes in as props.
 */
export const ResumeWalkthroughControl = defineToolbarChild(
  function ResumeWalkthroughControl({
    ref: toolbarRef,
    index,
    total,
    title,
  }: Readonly<{
    ref?: Ref<HTMLButtonElement>;
    /** The step the walkthrough was minimised on, counted from 0. */
    index: number;
    total: number;
    title: string;
  }>) {
    const intl = useAppIntl();
    const ref = useRef<HTMLButtonElement | null>(null);
    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        ref.current = node;
        if (typeof toolbarRef === 'function') return toolbarRef(node);
        if (toolbarRef) toolbarRef.current = node;
        return undefined;
      },
      [toolbarRef],
    );

    useEffect(() => {
      if (takeWalkthroughFocus()) ref.current?.focus({ preventScroll: true });
    }, []);

    const values = { index: index + 1, total, title };

    return (
      <ToolbarIconButton
        ref={setRef}
        aria-label={intl.formatMessage(messages.resumeLabel, values)}
        icon={<ProgressRing index={index} total={total} />}
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
