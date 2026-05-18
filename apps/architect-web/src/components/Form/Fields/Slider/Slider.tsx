import { get, isNil, round } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { Handles, Slider, Ticks, Tracks } from 'react-compound-slider';

import Handle from './Handle';
import Tick from './Tick';
import Track from './Track';

export type SliderType = 'LIKERT' | 'VAS' | null;

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
  const isLikert = useCallback(() => type === 'LIKERT', [type]);
  const isVisualAnalogScale = useCallback(() => type === 'VAS', [type]);

  const getSliderProps = useCallback(() => {
    const optionsArray = options ?? [];
    const domain: [number, number] = isLikert()
      ? [0, optionsArray.length - 1]
      : [0, 1];
    const step = isLikert() ? 1 : 0.0005;
    const values = isLikert()
      ? [optionsArray.findIndex((option) => option.value === value)]
      : [value as number];

    return {
      domain,
      step,
      values,
    };
  }, [isLikert, options, value]);

  const getTickCount = useCallback(() => {
    const optionsArray = options ?? [];
    switch (type) {
      case 'LIKERT':
        return optionsArray.length - 1;
      case 'VAS':
        return 1;
      default:
        return null;
    }
  }, [type, options]);

  const getLabelForValue = useCallback(
    (val: number): string | null => {
      if (isLikert()) {
        return get(options, [val, 'label']) ?? null;
      }
      if (isVisualAnalogScale()) {
        const index = val === 0 ? 'minLabel' : 'maxLabel';
        return get(parameters, index) ?? null;
      }
      return round(val * 100).toString();
    },
    [isLikert, isVisualAnalogScale, options, parameters],
  );

  const normalizeValue = useCallback(
    (val: number) => {
      if (isLikert()) {
        const optionsArray = options ?? [];
        const option = optionsArray[val];
        return option ? option.value : 0;
      }
      return round(val, 3);
    },
    [isLikert, options],
  );

  /**
   * The onChange property is called on initialization, so
   * we are using handleSlideEnd() to capture changes.
   */
  const handleSlideEnd = useCallback(
    (val: readonly number[]) => {
      const firstVal = val[0];
      if (firstVal === undefined) return;
      const normalizedValue = normalizeValue(firstVal);
      // Use input.onBlur rather than input.onChange so that we can set 'touched'
      onBlur(normalizedValue);
    },
    [normalizeValue, onBlur],
  );

  const sliderProps = getSliderProps();
  const tickCount = getTickCount();
  const showTooltips = !isVisualAnalogScale();
  const isNotSet = isNil(value);

  if (!type) {
    return null;
  }

  return (
    <div className="form-field">
      <Slider
        {...sliderProps}
        className="relative mx-(--space-3xl) mb-(--space-xl) h-(--space-3xl) w-[calc(100%-var(--space-3xl)*2)]"
        onSlideEnd={handleSlideEnd}
      >
        <Handles>
          {({ handles, activeHandleID, getHandleProps }) => (
            <div>
              {handles.map((handle) => (
                <Handle
                  key={handle.id}
                  handle={handle}
                  getLabelForValue={getLabelForValue}
                  domain={sliderProps.domain}
                  isActive={handle.id === activeHandleID}
                  getHandleProps={getHandleProps}
                  showTooltips={showTooltips}
                  isNotSet={isNotSet}
                />
              ))}
            </div>
          )}
        </Handles>
        <Tracks>
          {({ tracks, getTrackProps }) => (
            <div className="absolute top-(--space-xl) z-(--z-fx) h-(--space-xl) w-full -translate-y-1/2">
              {tracks.map(({ id, source, target }, idx) => (
                <Track
                  key={id}
                  source={source}
                  target={target}
                  getTrackProps={getTrackProps}
                  isFirst={idx === 0}
                  isLast={idx === tracks.length - 1}
                  sliderType={type}
                />
              ))}
            </div>
          )}
        </Tracks>
        {tickCount && (
          <Ticks count={tickCount}>
            {({ ticks }) => (
              <div className="relative top-(--space-xl) left-0 w-full">
                {ticks.map((tick) => (
                  <Tick
                    tick={tick}
                    key={tick.id}
                    getLabelForValue={getLabelForValue}
                  />
                ))}
              </div>
            )}
          </Ticks>
        )}
      </Slider>
    </div>
  );
};

export default SliderInput;
