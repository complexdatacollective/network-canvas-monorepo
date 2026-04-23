import { get, isNil, round } from "es-toolkit/compat";
import { useCallback } from "react";
import { Handles, Slider, Ticks, Tracks } from "react-compound-slider";
import { sliderRootVariants } from "~/styles/shared/controlVariants";
import { cva, cx } from "~/utils/cva";
import type { InputState } from "~/utils/getInputState";
import Handle from "./Handle";
import Tick from "./Tick";
import Track from "./Track";

type SliderOption = {
	value: string | number;
	label: string;
};

type SliderInputProps = {
	options?: SliderOption[] | null;
	value: string | number | null;
	type: string | null;
	onBlur: (value: string | number | null) => void;
	parameters?: {
		minLabel?: string;
		maxLabel?: string;
	};
	state?: InputState;
};

// Outer frame variant that carries the CSS custom properties the inner
// track / handle / tick markup consumes.
const sliderFrameVariants = cva({
	base: cx(
		"group relative mb-[var(--space-xl)] h-[var(--slider-height)]",
		// Leave room on both sides so tooltips/labels aren't clipped
		"w-[calc(100%-calc(var(--slider-align-margin)*2))]",
		"mx-[var(--slider-align-margin)]",
		"[--slider-touch-height:var(--space-xl)]",
		"[--slider-height:calc(var(--space-xl)*2)]",
		"[--slider-align-margin:calc(var(--space-xl)*2)]",
	),
});

const SliderInput = ({ options = [], value, type, onBlur, parameters = {}, state = "normal" }: SliderInputProps) => {
	const isLikert = useCallback(() => type === "LIKERT", [type]);
	const isVisualAnalogScale = useCallback(() => type === "VAS", [type]);

	const getSliderProps = useCallback(() => {
		const optionsArray = options ?? [];
		const domain: [number, number] = isLikert() ? [0, optionsArray.length - 1] : [0, 1];
		const step = isLikert() ? 1 : 0.0005;
		const values = isLikert() ? [optionsArray.findIndex((option) => option.value === value)] : [value as number];

		return {
			domain,
			step,
			values,
		};
	}, [isLikert, options, value]);

	const getTickCount = useCallback(() => {
		const optionsArray = options ?? [];
		switch (type) {
			case "LIKERT":
				return optionsArray.length - 1;
			case "VAS":
				return 1;
			default:
				return null;
		}
	}, [type, options]);

	const getLabelForValue = useCallback(
		(val: number): string | null => {
			if (isLikert()) {
				return get(options, [val, "label"]) ?? null;
			}
			if (isVisualAnalogScale()) {
				const index = val === 0 ? "minLabel" : "maxLabel";
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
	const hasFlatTrack = isLikert() || isVisualAnalogScale();

	if (!type) {
		return null;
	}

	const isDisabled = state === "disabled" || state === "readOnly";
	const rootProps: Record<string, unknown> = {};
	if (hasFlatTrack) {
		rootProps["data-flat-track"] = true;
	}

	return (
		<div className={cx(sliderRootVariants({ state }), "w-full")}>
			<Slider
				{...sliderProps}
				className={sliderFrameVariants()}
				onSlideEnd={handleSlideEnd}
				disabled={isDisabled}
				rootProps={rootProps}
			>
				<Handles>
					{({ handles, activeHandleID, getHandleProps }) => (
						<div className="relative h-full w-full">
							{handles.map((handle) => (
								<Handle
									key={handle.id}
									handle={handle}
									getLabelForValue={getLabelForValue}
									domain={sliderProps.domain}
									isActive={handle.id === activeHandleID}
									state={state}
									isPristine={isNotSet}
									getHandleProps={getHandleProps}
									showTooltips={showTooltips}
								/>
							))}
						</div>
					)}
				</Handles>
				<Tracks>
					{({ tracks, getTrackProps }) => (
						// react-compound-slider renders tracks as segments between handles rather than
						// as a single rail; the filled/unfilled portions are drawn inside each <Track>.
						<div className="absolute top-[calc(var(--slider-height)*0.5)] z-[1] h-[var(--slider-touch-height)] w-full -translate-y-1/2">
							{tracks.map(({ id, source, target }, index) => (
								<Track
									key={id}
									source={source}
									target={target}
									isFilled={index === 0 && !hasFlatTrack}
									getTrackProps={getTrackProps}
								/>
							))}
						</div>
					)}
				</Tracks>
				{tickCount && (
					<Ticks count={tickCount}>
						{({ ticks }) => (
							<div className="relative top-[calc(var(--slider-height)*0.5)] left-0 w-full">
								{ticks.map((tick) => (
									<Tick tick={tick} key={tick.id} getLabelForValue={getLabelForValue} />
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
