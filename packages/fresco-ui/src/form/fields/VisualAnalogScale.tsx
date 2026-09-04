'use client';

import { Slider } from '@base-ui/react/slider';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { RenderMarkdown } from '../../RenderMarkdown';
import {
  controlLabelVariants,
  sliderControlVariants,
  sliderRootVariants,
  sliderThumbSurfaceVariants,
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

/**
 * What the scale announces before anything has been chosen.
 *
 * A native `input[type=range]` always carries an `aria-valuenow`, and the
 * thumb has to rest somewhere, so an unanswered scale would otherwise announce
 * its resting midpoint as though the participant had chosen it — leaving a
 * required scale sounding answered while validation still blocks the
 * participant. Assistive technology announces `aria-valuetext` in preference
 * to `aria-valuenow`, so this is what actually reaches a screen reader, and it
 * matches the muted resting thumb a sighted participant sees.
 */
const UNANSWERED_VALUE_TEXT = 'No value chosen yet';

const messages = defineMessages({
  sliderLabel: {
    id: 'frescoUi.visualAnalogScale.sliderLabel',
    defaultMessage: 'Visual analog scale value',
    description:
      'Accessible name of the scale’s slider thumb, when the caller named neither the field nor the control.',
  },
});

export default function VisualAnalogScaleField(
  props: VisualAnalogScaleFieldProps,
) {
  const intl = useAppIntl();
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
    id,
    name,
    onBlur,
    onFocus,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    ...rest
  } = props;

  const state = getInputState(props);
  const hasValue = value !== undefined;
  const midpoint = (min + max) / 2;
  const sliderValue = hasValue ? value : midpoint;
  const thumbState = !hasValue && state === 'normal' ? 'pristine' : state;

  const [thumbEl, setThumbEl] = useState<HTMLElement | null>(null);
  const active = useSliderActive();

  // The in-progress pointer press. `started` is only true for a primary press
  // that began on this slider, so a release belonging to some other gesture —
  // a secondary-button click, or a drag that started elsewhere and happens to
  // end over the scale — can't record a response. `movedValue` records whether
  // that press has already chosen a position.
  const pointerPressRef = useRef({ started: false, movedValue: false });

  const handleValueChange = (newValue: number | number[]) => {
    if (readOnly) return;
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    if (val !== undefined) {
      pointerPressRef.current.movedValue = true;
      onChange?.(val);
    }
  };

  // base-ui only reports a value change when the press actually moves the
  // slider, so a pristine scale pressed on the thumb — or on the midpoint the
  // thumb already rests at — would never record a response. Deliberately not
  // gated on the pointer press: the keyboard path uses it too, and a field
  // cleared back to pristine has to stay confirmable from the keyboard.
  const commitPristineValue = () => {
    if (disabled || readOnly || hasValue) return;
    onChange?.(midpoint);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    pointerPressRef.current = {
      started: event.button === 0,
      movedValue: false,
    };
    if (pointerPressRef.current.started) active.onPointerDown();
  };

  // Committing on release rather than on press leaves a press that *does* move
  // the thumb free to record the position the participant chose.
  const handlePointerUp = () => {
    const press = pointerPressRef.current;
    pointerPressRef.current = { started: false, movedValue: false };
    if (!press.started || press.movedValue) return;
    commitPristineValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasValue && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      commitPristineValue();
    }
  };

  return (
    <div
      className={cx('w-full', className)}
      // A structural marker for the unanswered state, which the ARIA value
      // text and the muted thumb otherwise only express in ways a test cannot
      // read together. Also the styling seam if this state ever needs more.
      data-unanswered={hasValue ? undefined : 'true'}
      {...rest}
    >
      <div className="relative">
        <Slider.Root
          value={sliderValue}
          onValueChange={handleValueChange}
          onPointerDown={readOnly ? undefined : handlePointerDown}
          onPointerUp={readOnly ? undefined : handlePointerUp}
          onPointerCancel={() => {
            pointerPressRef.current = { started: false, movedValue: false };
          }}
          onKeyDown={(event) => {
            if (readOnly) return;
            handleKeyDown(event);
            active.onKeyDown(event);
          }}
          onBlur={(event) => {
            active.onBlur();
            onBlur?.(event);
          }}
          onFocus={onFocus}
          disabled={disabled}
          name={name}
          min={min}
          max={max}
          step={step}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          aria-readonly={readOnly || undefined}
          aria-labelledby={ariaLabelledBy}
          className={sliderRootVariants({ state })}
        >
          <Slider.Control className={sliderControlVariants()}>
            <Slider.Track className={sliderTrackVariants({ state })}>
              <Slider.Thumb
                ref={setThumbEl}
                inputRef={(input) => {
                  if (input && id) input.id = id;
                }}
                className={sliderThumbVariants({ state: thumbState })}
                aria-label={
                  ariaLabelledBy
                    ? undefined
                    : (ariaLabel ?? intl.formatMessage(messages.sliderLabel))
                }
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                getAriaValueText={(_, currentValue) =>
                  hasValue
                    ? formatVasValue(currentValue, min, max)
                    : UNANSWERED_VALUE_TEXT
                }
              >
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
                  className={sliderThumbSurfaceVariants({ state: thumbState })}
                />
              </Slider.Thumb>
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>

        <ScaleValuePopover visible={active.active && hasValue} anchor={thumbEl}>
          {formatVasValue(sliderValue, min, max)}
        </ScaleValuePopover>

        {(minLabel ?? maxLabel) && (
          <div className="relative mt-2 flex justify-between px-3">
            {minLabel && (
              <div
                className={cx(
                  controlLabelVariants({ size: 'sm' }),
                  'max-w-24 text-left',
                )}
              >
                <RenderMarkdown>{minLabel}</RenderMarkdown>
              </div>
            )}
            {maxLabel && (
              <div
                className={cx(
                  controlLabelVariants({ size: 'sm' }),
                  'max-w-24 text-right',
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
