import { Slider } from '@base-ui/react/slider';
import type { ReactElement } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';

type SliderInputProps = {
  'id'?: string;
  'value': number;
  'onChange': (value: number) => void;
  'min': number;
  'max': number;
  'step': number;
  // The thumb's accessible name (Base UI's thumb input takes no external id,
  // so the visible field label cannot associate via htmlFor).
  'aria-label'?: string;
  'aria-describedby'?: string;
};

// The bare slider control UnconnectedField wraps: track + thumb with a live
// percentage readout. Purpose-built for 0..1 opacity-like values.
function SliderInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: SliderInputProps): ReactElement {
  return (
    <div id={id} className="flex w-full min-w-0 items-center gap-3">
      <Slider.Root
        className="min-w-0 flex-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          if (next !== value) onChange(next);
        }}
      >
        <Slider.Control className="flex h-6 w-full touch-none items-center">
          <Slider.Track className="bg-surface-2 relative h-1.5 w-full rounded-full">
            <Slider.Indicator className="bg-accent absolute inset-y-0 rounded-full" />
            <Slider.Thumb
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedBy}
              className="focusable bg-accent absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow-sm"
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <span className="text-text/70 text-xs tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

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
    <UnconnectedField
      label={label}
      name={name}
      component={SliderInput}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onChange={onCommit}
    />
  );
}
