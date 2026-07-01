'use client';

import { Slider } from '@base-ui/react/slider';
import { motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';

import { RenderMarkdown } from '../../RenderMarkdown';
import {
  controlLabelVariants,
  sliderControlVariants,
  sliderRootVariants,
  sliderThumbVariants,
  sliderTickContainerStyles,
  sliderTickStyles,
  sliderTrackVariants,
} from '../../styles/controlVariants';
import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import ScaleValuePopover from './scale/ScaleValuePopover';
import {
  ROTATED_LABEL_WRAP_CLASS,
  scaleGridTemplateColumns,
  useScaleLabelLayout,
} from './scale/useScaleLabelLayout';
import { useSliderActive } from './scale/useSliderActive';

type Option = {
  label: string;
  value: string | number;
};

type LikertScaleFieldProps = CreateFormFieldProps<
  string | number,
  'div',
  {
    options?: Option[];
  }
>;

export default function LikertScaleField(props: LikertScaleFieldProps) {
  const {
    className,
    value,
    onChange,
    options = [],
    disabled,
    readOnly,
    ...rest
  } = props;

  const state = getInputState(props);

  const currentIndex = options.findIndex((option) => option.value === value);
  const hasValue = currentIndex >= 0;
  // Clamp to 0 so an empty option set doesn't produce an out-of-range -1 that
  // the Slider (min=0, max=0) would reject.
  const midpoint = Math.max(0, Math.floor((options.length - 1) / 2));
  const sliderValue = hasValue ? currentIndex : midpoint;
  const currentOption = hasValue ? options[currentIndex] : undefined;
  const thumbState = !hasValue && state === 'normal' ? 'pristine' : state;

  const rootRef = useRef<HTMLDivElement>(null);
  const [thumbEl, setThumbEl] = useState<HTMLElement | null>(null);
  const active = useSliderActive();
  // Memoise so the measurement hook doesn't re-run its DOM reads on every
  // value/focus render (e.g. each drag tick) just because `map` yields a new
  // array reference.
  const optionLabels = useMemo(
    () => options.map((option) => option.label),
    [options],
  );
  const { layout, measurementNode } = useScaleLabelLayout({
    rootRef,
    labels: optionLabels,
  });

  const popoverOption = options[sliderValue];

  const handleValueChange = (newValue: number | number[]) => {
    if (readOnly) return;
    const index = Array.isArray(newValue) ? newValue[0] : newValue;
    if (index !== undefined) {
      const selectedOption = options[index];
      if (selectedOption) {
        onChange?.(selectedOption.value);
      }
    }
  };

  // onValueCommitted fires on pointer release, even if the position didn't change.
  // This handles the case where the user clicks on the midpoint while pristine.
  const handleValueCommitted = (newValue: number | number[]) => {
    if (readOnly || hasValue) return;
    const index = Array.isArray(newValue) ? newValue[0] : newValue;
    if (index !== undefined) {
      const selectedOption = options[index];
      if (selectedOption) {
        onChange?.(selectedOption.value);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasValue && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const midpointOption = options[midpoint];
      if (midpointOption) {
        onChange?.(midpointOption.value);
      }
    }
  };

  return (
    <div ref={rootRef} className={cx('relative w-full', className)} {...rest}>
      <div
        className="relative"
        style={
          layout.tier === 'rotated'
            ? { paddingInline: layout.overhang }
            : undefined
        }
      >
        <Slider.Root
          value={sliderValue}
          onValueChange={handleValueChange}
          onValueCommitted={handleValueCommitted}
          onKeyDown={(event) => {
            if (readOnly) return;
            handleKeyDown(event);
            active.onKeyDown(event);
          }}
          onPointerDown={readOnly ? undefined : active.onPointerDown}
          onBlur={active.onBlur}
          disabled={disabled}
          min={0}
          max={Math.max(0, options.length - 1)}
          step={1}
          aria-invalid={rest['aria-invalid']}
          className={sliderRootVariants({ state })}
        >
          <Slider.Control className={sliderControlVariants()}>
            <Slider.Track className={sliderTrackVariants({ state })}>
              {options.length > 0 && (
                <div className={sliderTickContainerStyles}>
                  {options.map((_, index) => {
                    if (index === 0 || index === options.length - 1)
                      return null;
                    const percentage =
                      options.length > 1
                        ? (index / (options.length - 1)) * 100
                        : 50;
                    return (
                      <div
                        key={index}
                        className={cx(
                          sliderTickStyles,
                          'absolute -translate-x-1/2',
                        )}
                        style={{ left: `${percentage}%` }}
                      />
                    );
                  })}
                </div>
              )}
              <Slider.Thumb
                ref={setThumbEl}
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
                aria-label={`Select value on scale: ${currentOption?.label ?? 'No selection'}`}
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>

        <ScaleValuePopover
          visible={active.active && options.length > 0}
          anchor={thumbEl}
        >
          {popoverOption ? (
            <RenderMarkdown>{popoverOption.label}</RenderMarkdown>
          ) : null}
        </ScaleValuePopover>

        {options.length > 0 && layout.tier === 'full' && (
          <div
            className="mt-2 grid gap-2 px-3"
            style={{
              gridTemplateColumns: scaleGridTemplateColumns(options.length),
            }}
          >
            {options.map((option, index) => {
              const isFirst = index === 0;
              const isLast = index === options.length - 1;
              return (
                <div
                  key={index}
                  className={cx(
                    controlLabelVariants({ size: 'sm' }),
                    options.length === 1
                      ? 'text-center'
                      : isFirst
                        ? 'text-left'
                        : isLast
                          ? 'text-right'
                          : 'text-center',
                  )}
                >
                  <RenderMarkdown>{option.label}</RenderMarkdown>
                </div>
              );
            })}
          </div>
        )}

        {options.length > 1 &&
          layout.tier === 'rotated' && (
            // `mx-3` insets the band to match the track (which sits inside the
            // control's `px-3`), so `left: %` maps onto the same axis as the ticks
            // and each rotated label centres on its mark.
            <div
              className="relative mx-3 mt-1"
              style={{ height: layout.bandHeight }}
            >
              {options.map((option, index) => {
                const percentage =
                  options.length > 1
                    ? (index / (options.length - 1)) * 100
                    : 50;
                return (
                  <div
                    key={index}
                    className={cx(
                      controlLabelVariants({ size: 'sm' }),
                      'absolute text-center',
                      ROTATED_LABEL_WRAP_CLASS,
                    )}
                    style={{
                      left: `${percentage}%`,
                      top: '50%',
                      transform: `translate(-50%, -50%) rotate(${layout.rotateDeg}deg)`,
                    }}
                  >
                    <RenderMarkdown>{option.label}</RenderMarkdown>
                  </div>
                );
              })}
            </div>
          )}

        {options.length > 1 && layout.tier === 'anchors' && (
          <div className="relative mt-2 flex justify-between px-3">
            <div
              className={cx(
                controlLabelVariants({ size: 'sm' }),
                'max-w-24 text-left',
              )}
            >
              <RenderMarkdown>{options[0]!.label}</RenderMarkdown>
            </div>
            <div
              className={cx(
                controlLabelVariants({ size: 'sm' }),
                'max-w-24 text-right',
              )}
            >
              <RenderMarkdown>
                {options[options.length - 1]!.label}
              </RenderMarkdown>
            </div>
          </div>
        )}
      </div>

      {measurementNode}
      <div aria-live="polite" className="sr-only">
        {currentOption ? (
          <RenderMarkdown>{currentOption.label}</RenderMarkdown>
        ) : null}
      </div>
    </div>
  );
}
