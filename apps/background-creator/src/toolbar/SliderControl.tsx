import { Slider } from '@base-ui/react/slider';
import type { ReactElement } from 'react';

import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

type SliderControlProps = {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  // Fires on every drag/keyboard change; callers coalesce the stream into a
  // single undo step with a per-field key (same contract as ColorControl's
  // continuous picker changes).
  onCommit: (value: number) => void;
};

// A labelled slider matching the panel's container-field look, with a live
// percentage readout. Purpose-built for 0..1 opacity-like values.
export function SliderControl({
  label,
  name,
  value,
  min,
  max,
  step,
  onCommit,
}: SliderControlProps): ReactElement {
  return (
    <div data-field-name={name} className="w-full min-w-0 not-last:mb-8">
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className={cx(headingVariants({ level: 'label', margin: 'none' }))}
        >
          {label}
        </span>
        <span className="text-text/70 text-xs tabular-nums">
          {Math.round(value * 100)}%
        </span>
      </div>
      <Slider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          if (next !== value) onCommit(next);
        }}
      >
        <Slider.Control className="flex h-6 w-full touch-none items-center">
          <Slider.Track className="bg-surface-2 relative h-1.5 w-full rounded-full">
            <Slider.Indicator className="bg-accent absolute inset-y-0 rounded-full" />
            <Slider.Thumb
              aria-label={label}
              className="focusable bg-accent absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow-sm"
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}
