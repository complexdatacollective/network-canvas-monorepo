import { Slider } from '@base-ui/react/slider';
import { isNil, round } from 'es-toolkit/compat';
import { useCallback, useMemo, useState } from 'react';

import Handle from './Handle';
import Tick from './Tick';

type SliderType = 'LIKERT' | 'VAS' | null;

type SliderOption = {
  value: string | number;
  label: string;
};

type SliderInputProps = {
  options?: SliderOption[] | null;
  value: string | number | null;
  type: SliderType;
  onBlur: (value: string | number | null) => void;
  parameters?: {
    minLabel?: string;
    maxLabel?: string;
  };
};

const SliderInput = ({
  options = [],
  value,
  type,
  onBlur,
  parameters = {},
}: SliderInputProps) => {
  const isLikert = type === 'LIKERT';
  const isVisualAnalogScale = type === 'VAS';
  const optionsArray = useMemo(() => options ?? [], [options]);

  const min = 0;
  const max = isLikert ? Math.max(0, optionsArray.length - 1) : 1;
  const step = isLikert ? 1 : 0.0005;

  // Translate the stored value into the numeric position base-ui expects.
  // LIKERT stores the option's value, so we look up its index; VAS stores the
  // raw number. When unset we clamp to `min` for display but flag `isNotSet`
  // so the handle renders in its desaturated "pristine" state.
  const rawValue = isLikert
    ? optionsArray.findIndex((option) => option.value === value)
    : typeof value === 'number'
      ? value
      : 0;
  const isNotSet = isNil(value) || (isLikert && rawValue < 0);
  const committedValue = isNotSet ? min : rawValue;

  // base-ui is controlled, so the thumb only moves when `value` changes. The
  // committed value only updates on release (so the field is marked 'touched'
  // once, not on every drag tick), so we track the live position locally to
  // give immediate drag/click feedback, then fall back to the committed value.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const sliderValue = dragValue ?? committedValue;

  const getLabelForValue = useCallback(
    (val: number): string | null => {
      if (isLikert) {
        return optionsArray[val]?.label ?? null;
      }
      if (isVisualAnalogScale) {
        const index = val === 0 ? 'minLabel' : 'maxLabel';
        return parameters[index] ?? null;
      }
      return round(val * 100).toString();
    },
    [isLikert, isVisualAnalogScale, optionsArray, parameters],
  );

  const normalizeValue = useCallback(
    (val: number): string | number => {
      if (isLikert) {
        return optionsArray[val]?.value ?? 0;
      }
      return round(val, 3);
    },
    [isLikert, optionsArray],
  );

  // onValueChange fires continuously while dragging / on track-press: track it
  // locally so the thumb follows the pointer immediately.
  const handleValueChange = useCallback((val: number) => {
    setDragValue(val);
  }, []);

  // onValueCommitted fires on release (pointer up, keyboard, or track press).
  // Commit via input.onBlur (not onChange) so the field is marked 'touched',
  // then clear the local drag value so we follow the committed prop again.
  const handleValueCommitted = useCallback(
    (val: number) => {
      setDragValue(null);
      onBlur(normalizeValue(val));
    },
    [normalizeValue, onBlur],
  );

  const ticks = useMemo(() => {
    if (isLikert) {
      const count = optionsArray.length;
      return optionsArray.map((option, index) => ({
        id: `tick-${index}`,
        percent: count > 1 ? (index / (count - 1)) * 100 : 50,
        label: option.label,
      }));
    }
    if (isVisualAnalogScale) {
      return [
        { id: 'tick-min', percent: 0, label: parameters.minLabel },
        { id: 'tick-max', percent: 100, label: parameters.maxLabel },
      ];
    }
    return [];
  }, [isLikert, isVisualAnalogScale, optionsArray, parameters]);
  const showTooltips = !isVisualAnalogScale;

  if (!type) {
    return null;
  }

  return (
    <div className="form-field">
      <Slider.Root
        value={sliderValue}
        onValueChange={handleValueChange}
        onValueCommitted={handleValueCommitted}
        min={min}
        max={max}
        step={step}
        className="relative mx-(--space-3xl) mb-(--space-xl) h-(--space-3xl) w-[calc(100%-var(--space-3xl)*2)]"
      >
        {/* Ticks render first so the track and thumb paint above them, matching
            the original z-order (tick lines beneath the track). pointer-events
            are disabled so track-presses fall through to the control. */}
        <div className="pointer-events-none absolute top-(--space-xl) left-0 w-full">
          {ticks.map((tick) => (
            <Tick key={tick.id} tick={tick} label={tick.label ?? null} />
          ))}
        </div>
        <Slider.Control className="absolute top-(--space-xl) left-0 flex h-(--space-xl) w-full -translate-y-1/2 cursor-pointer items-center">
          <Slider.Track className="bg-platinum h-(--space-md) w-full rounded-none">
            <Slider.Thumb
              getAriaLabel={() => 'Slider'}
              render={(thumbProps, state) => (
                <Handle
                  thumbProps={thumbProps}
                  label={getLabelForValue(sliderValue)}
                  isActive={state.dragging}
                  isDisabled={state.disabled}
                  isNotSet={isNotSet}
                  showTooltips={showTooltips}
                />
              )}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
};

export default SliderInput;
