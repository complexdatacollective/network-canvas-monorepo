import { Component } from "react";
import { round, get, isNil } from "lodash";
import cx from "classnames";
import { Slider, Handles, Tracks, Ticks } from "react-compound-slider";
import Handle from "./Handle";
import Track from "./Track";
import Tick from "./Tick";

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

class SliderInput extends Component<SliderInputProps> {
	getSliderProps = () => {
		const { options = [], value } = this.props;

		const domain: [number, number] = this.isLikert() ? [0, options.length - 1] : [0, 1];

		const step = this.isLikert() ? 1 : 0.0005;

		const values = this.isLikert() ? [options.findIndex((option) => option.value === value)] : [value as number];

		return {
			domain,
			step,
			values,
		};
	};

	getTickCount = () => {
		const { type, options = [] } = this.props;

		switch (type) {
			case "LIKERT":
				return options.length - 1;
			case "VAS":
				return 1;
			default:
				return null;
		}
	};

	getLabelForValue = (value: number): string | null => {
		const { options = [], parameters = {} } = this.props;
		if (this.isLikert()) {
			return get(options, [value, "label"]);
		}
		if (this.isVisualAnalogScale()) {
			const index = value === 0 ? "minLabel" : "maxLabel";
			return get(parameters, index);
		}
		return round(value * 100).toString();
	};

	normalizeValue = (value: number) => {
		const { options = [] } = this.props;

		if (this.isLikert()) {
			return options[value].value;
		}
		return round(value, 3);
	};

	/**
	 * The onChange property is called on initialization, so
	 * we are using handleSlideEnd() to capture changes.
	 */
	handleSlideEnd = (value: number[]) => {
		const { onBlur } = this.props;
		const normalizedValue = this.normalizeValue(value[0]);
		// Use input.onBlur rather than input.onChange so that we can set 'touched'
		onBlur(normalizedValue);
	};

	isLikert = () => {
		const { type } = this.props;
		return type === "LIKERT";
	};

	isVisualAnalogScale = () => {
		const { type } = this.props;
		return type === "VAS";
	};

	render() {
		const { value } = this.props;

		const sliderProps = this.getSliderProps();
		const tickCount = this.getTickCount();
		const showTooltips = !this.isVisualAnalogScale();
		const isNotSet = isNil(value);

		const className = cx(
			"form-field-slider__slider",
			{ "form-field-slider__slider--likert": this.isLikert() },
			{ "form-field-slider__slider--vas": this.isVisualAnalogScale() },
			{ "form-field-slider__slider--not-set": isNotSet },
		);

		return (
			<div className="form-field">
				<Slider
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...sliderProps}
					className={className}
					onSlideEnd={this.handleSlideEnd}
				>
					<Handles>
						{({ handles, activeHandleID, getHandleProps }) => (
							<div className="form-field-slider__handles">
								{handles.map((handle) => (
									<Handle
										key={handle.id}
										handle={handle}
										getLabelForValue={this.getLabelForValue}
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
										<Tick
											tick={tick}
											key={`${this.getLabelForValue}_${index}`}
											getLabelForValue={this.getLabelForValue}
										/>
									))}
								</div>
							)}
						</Ticks>
					)}
				</Slider>
			</div>
		);
	}
}

export default SliderInput;
