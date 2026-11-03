import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import type { StageWalkthroughFrame } from '@codaco/protocol-builder/interfaces/walkthroughs/walkthroughTypes';

const messages = defineMessages({
  switchLabel: {
    id: 'architect.stageEditor.walkthrough.visualSwitch',
    defaultMessage: 'Show the interview',
    description:
      'Accessible name of the buttons that switch a walkthrough screenshot between the interview with a setting and without it.',
  },
});

/** The panel is at most 26rem wide, less its padding. */
const SIZES = '24rem';

/**
 * What a step's setting looks like in the interview. With two pictures, a
 * switch flips between them, starting on the last: the setting in use.
 */
export default function StepVisual({
  frames,
}: Readonly<{ frames: readonly StageWalkthroughFrame[] }>) {
  const intl = useAppIntl();
  const [picked, setPicked] = useState(frames.length - 1);
  const frame = frames[picked] ?? frames[0];
  if (frame === undefined) return null;
  const largest = frame.still.variants.at(-1);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <img
        src={largest?.url}
        srcSet={frame.still.variants
          .map((variant) => `${variant.url} ${variant.w}w`)
          .join(', ')}
        sizes={SIZES}
        width={largest?.w}
        height={largest?.h}
        alt={intl.formatMessage(frame.alt)}
        className="border-outline h-auto w-full rounded border"
      />
      {frames.length > 1 && (
        <div
          role="group"
          aria-label={intl.formatMessage(messages.switchLabel)}
          className="flex justify-center gap-1"
        >
          {frames.map((option, index) => (
            <Button
              key={option.still.variants[0]?.url ?? index}
              variant="text"
              size="sm"
              aria-pressed={index === picked}
              onClick={() => setPicked(index)}
            >
              {option.label === undefined
                ? index + 1
                : intl.formatMessage(option.label)}
            </Button>
          ))}
        </div>
      )}
    </figure>
  );
}
