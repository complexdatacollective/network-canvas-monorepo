import cx from "classnames";
import { get, isNil, round } from "lodash";
import { useCallback } from "react";
import { Handles, Slider, Ticks, Tracks } from "react-compound-slider";
import Handle from "./Handle";
import Tick from "./Tick";
import Track from "./Track";

interface SliderOption {
	value: string | number;
	label: string;
}

interface SliderInputProps {
	options?: SliderOption[];
	value: string | number | null;
	type: string;
	onBlur: (value: any) => void;
	parameters?: {
		minLabel?: string;
		maxLabel?: string;
	};
}

const SliderInput = ({ options = [], value, type, onBlur, parameters = {} }: SliderInputProps) => {
	const isLikert = useCallback(() => type === "LIKERT", [type]);
	const isVisualAnalogScale = useCallback(() => type === "VAS", [type]);

	const getSliderProps = useCallback(() => {
		const domain: [number, number] = isLikert() ? [0, options.length - 1] : [0, 1];
		const step = isLikert() ? 1 : 0.0005;
		const values = isLikert() ? [options.findIndex((option) => option.value === value)] : [value as number];

		return {
			domain,
			step,
			values,
		};
	}, [isLikert, options, value]);

	const getTickCount = useCallback(() => {
		switch (type) {
			case "LIKERT":
				return options.length - 1;
			case "VAS":
				return 1;
			default:
				return null;
		}
	}, [type, options.length]);

	const getLabelForValue = useCallback(
		(val: number): string | null => {
			if (isLikert()) {
				return get(options, [val, "label"]);
			}
			if (isVisualAnalogScale()) {
				const index = val === 0 ? "minLabel" : "maxLabel";
				return get(parameters, index);
			}
			return round(val * 100).toString();
		},
		[isLikert, isVisualAnalogScale, options, parameters],
	);

	const normalizeValue = useCallback(
		(val: number) => {
			if (isLikert()) {
				return options[val].value;
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
		(val: number[]) => {
			const normalizedValue = normalizeValue(val[0]);
			// Use input.onBlur rather than input.onChange so that we can set 'touched'
			onBlur(normalizedValue);
		},
		[normalizeValue, onBlur],
	);

	const sliderProps = getSliderProps();
	const tickCount = getTickCount();
	const showTooltips = !isVisualAnalogScale();
	const isNotSet = isNil(value);

	const className = cx(
		"form-field-slider__slider",
		{ "form-field-slider__slider--likert": isLikert() },
		{ "form-field-slider__slider--vas": isVisualAnalogScale() },
		{ "form-field-slider__slider--not-set": isNotSet },
	);

	return (
		<div className="form-field">
			<Slider {...sliderProps} className={className} onSlideEnd={handleSlideEnd}>
				<Handles>
					{({ handles, activeHandleID, getHandleProps }) => (
						<div className="form-field-slider__handles">
							{handles.map((handle) => (
								<Handle
									key={handle.id}
									handle={handle}
									getLabelForValue={getLabelForValue}
									domain={sliderProps.domain}
									isActive={handle.id === activeHandleID}
									getHandleProps={getHandleProps}
									showTooltips={showTooltips}
								/>
							))}
						</div>
					)}
				</Handles>
				<Tracks>
					{({ tracks, getTrackProps }) => (
						<div className="form-field-slider__tracks">
							{tracks.map(({ id, source, target }) => (
								<Track key={id} source={source} target={target} getTrackProps={getTrackProps} />
							))}
						</div>
					)}
				</Tracks>
				{tickCount && (
					<Ticks count={tickCount}>
						{({ ticks }) => (
							<div className="form-field-slider__ticks">
								{ticks.map((tick, index) => (
									<Tick tick={tick} key={`${getLabelForValue}_${index}`} getLabelForValue={getLabelForValue} />
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
