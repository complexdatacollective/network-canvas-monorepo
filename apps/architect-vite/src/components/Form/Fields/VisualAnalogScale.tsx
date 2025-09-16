/* eslint-disable react/jsx-props-no-spreading */

import Slider from "./Slider";

interface VisualAnalogScaleProps {
	parameters: {
		minLabel: string;
		maxLabel: string;
	};
	[key: string]: unknown;
}

const VisualAnalogScale = (props: VisualAnalogScaleProps) => <Slider {...props} />;

export default VisualAnalogScale;
