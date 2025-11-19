import classNames from "classnames";
import type React from "react";
import { PureComponent } from "react";

type SpinnerProps = {
	small?: boolean;
	large?: boolean;
	size?: string | null;
};

class Spinner extends PureComponent<SpinnerProps> {
	static defaultProps = {
		small: false,
		large: false,
		size: null,
	};

	render() {
		const { small = false, large = false, size = null } = this.props;

		const classes = classNames("spinner", {
			"spinner--small": small,
			"spinner--large": large,
		});

		const circleSize = () => {
			if (size) {
				return { "--circle-size": size } as React.CSSProperties;
			}

			return {};
		};

		return (
			<div className={classes} style={circleSize()}>
				<div className="circle">
					<div className="half-circle" />
					<div className="half-circle half-circle--rotated" />
				</div>
				<div className="circle">
					<div className="half-circle" />
					<div className="half-circle half-circle--rotated" />
				</div>
				<div className="circle">
					<div className="half-circle" />
					<div className="half-circle half-circle--rotated" />
				</div>
				<div className="circle">
					<div className="half-circle" />
					<div className="half-circle half-circle--rotated" />
				</div>
			</div>
		);
	}
}

export default Spinner;
