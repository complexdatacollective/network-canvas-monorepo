'use client';

import { Slider } from '@base-ui/react/slider';
import { motion } from 'motion/react';

import { RenderMarkdown } from '../../RenderMarkdown';
import {
  controlLabelVariants,
  sliderControlVariants,
  sliderRootVariants,
  sliderThumbVariants,
  sliderTrackVariants,
} from '../../styles/controlVariants';
import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import ScaleValuePopover from './scale/ScaleValuePopover';
import { useSliderActive } from './scale/useSliderActive';

type VisualAnalogScaleFieldProps = CreateFormFieldProps<
  number,
  'div',
  {
    min?: number;
    max?: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
  }
>;

// Formats the transient drag value. The default normalised 0–1 scale is shown as
// a percentage; custom ranges show the value in their own units. The bubble is
// only visible mid-drag, so no persistent number anchors the participant.
function formatVasValue(value: number, min: number, max: number) {
  if (min === 0 && max === 1) return `${Math.round(value * 100)}%`;
  const range = max - min;
  const decimals = range >= 10 ? 0 : range >= 1 ? 1 : 2;
  return value.toFixed(decimals);
}

export default function VisualAnalogScaleField(
  props: VisualAnalogScaleFieldProps,
) {
  const {
    className,
    value,
    onChange,
    // Scalar responses are recorded on a normalised 0-1 scale (the documented
    // datum and what the architect producer emits). The fine step matches the
    // producer's 0.001 resolution.
    min = 0,
    max = 1,
    step = 0.001,
    minLabel,
    maxLabel,
    disabled,
    readOnly,
    ...rest
  } = props;

  const state = getInputState(props);
  const hasValue = value !== undefined;
  const midpoint = (min + max) / 2;
  const sliderValue = hasValue ? value : midpoint;
  const thumbState = !hasValue && state === 'normal' ? 'pristine' : state;

  const active = useSliderActive();

  const handleValueChange = (newValue: number | number[]) => {
    if (readOnly) return;
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    if (val !== undefined) {
      onChange?.(val);
    }
  };

  const commitPristineValue = () => {
    if (readOnly || hasValue) return;
    onChange?.(midpoint);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasValue && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      commitPristineValue();
    }
  };

  return (
    <div className={cx('w-full', className)} {...rest}>
      <div className="relative">
        <Slider.Root
          value={sliderValue}
          onValueChange={handleValueChange}
          onPointerDown={() => {
            commitPristineValue();
            active.onPointerDown();
          }}
          onKeyDown={handleKeyDown}
          onFocus={active.onFocus}
          onBlur={active.onBlur}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          aria-invalid={rest['aria-invalid']}
          className={sliderRootVariants({ state })}
        >
          <Slider.Control className={sliderControlVariants()}>
            <Slider.Track className={sliderTrackVariants({ state })}>
              <Slider.Thumb
                render={
                  <motion.div
                    // base-ui's nested <input type="range"> is the focusable
                    // control; motion otherwise auto-adds tabIndex={0} to a
                    // `whileTap` element, which would make the thumb a second
                    // tab stop. Keep the div out of the tab order.
                    tabIndex={-1}
                    whileTap={{ scale: 1.1 }}
                    transition={{
                      type: 'spring',
                      duration: 0.3,
                      bounce: 0.4,
                    }}
                  />
                }
                className={sliderThumbVariants({ state: thumbState })}
                aria-label="Visual analog scale value"
              />
              <ScaleValuePopover
                visible={active.active}
                position={
                  max > min ? ((sliderValue - min) / (max - min)) * 100 : 50
                }
              >
                {formatVasValue(sliderValue, min, max)}
              </ScaleValuePopover>
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>

        {(minLabel ?? maxLabel) && (
          <div className="relative mt-2 flex justify-between px-3">
            {minLabel && (
              <div
                className={cx(
                  controlLabelVariants({ size: 'sm' }),
                  'max-w-24 text-left wrap-break-word',
                )}
              >
                <RenderMarkdown>{minLabel}</RenderMarkdown>
              </div>
            )}
            {maxLabel && (
              <div
                className={cx(
                  controlLabelVariants({ size: 'sm' }),
                  'max-w-24 text-right wrap-break-word',
                )}
              >
                <RenderMarkdown>{maxLabel}</RenderMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
