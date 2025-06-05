import { Component } from "react";
import cx from "classnames";
import MarkdownLabel from "../MarkdownLabel";

interface HandleProps {
  domain: [number, number];
  handle: {
    id: any;
    value: number;
    percent: number;
  };
  isActive?: boolean;
  isDisabled?: boolean;
  showTooltips?: boolean;
  getHandleProps: (id: any, props?: any) => any;
  getLabelForValue: (value: number) => string | null;
}

interface HandleState {
  mouseOver: boolean;
}

class Handle extends Component<HandleProps, HandleState> {
	constructor(props: HandleProps) {
		super(props);

		this.state = {
			mouseOver: false,
		};
	}

	handleMouseOver = () => {
		this.setState({ mouseOver: true });
	};

	handleMouseLeave = () => {
		this.setState({ mouseOver: false });
	};

	render() {
		const {
			domain: [min, max],
			handle: { id, value, percent },
			isActive = false,
			isDisabled = false,
			showTooltips = false,
			getHandleProps,
			getLabelForValue,
		} = this.props;
		const { mouseOver } = this.state;

		const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;
		const handleProps = getHandleProps(id, {
			onMouseEnter: this.handleMouseEnter,
			onMouseLeave: this.handleMouseLeave,
		});

		const markerClasses = cx(
			"form-field-slider__marker",
			{ "form-field-slider__marker--is-active": isActive },
			{ "form-field-slider__marker--is-disabled": isDisabled },
		);

		const tooltipClasses = cx("form-field-slider__tooltip", { "form-field-slider__tooltip--is-active": showTooltip });

		const label = getLabelForValue(value);

		return (
			<>
				{showTooltips && (
					<div className={tooltipClasses} style={{ left: `${percent}%` }}>
						<MarkdownLabel inline label={label} className="form-field-slider__tooltip-label" />
					</div>
				)}
				<div
					className="form-field-slider__handle"
					style={{ left: `${percent}%` }}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...handleProps}
				/>
				<div
					role="slider"
					aria-label="Slider"
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={value}
					className={markerClasses}
					style={{ left: `${percent}%` }}
				/>
			</>
		);
	}
}

export default Handle;