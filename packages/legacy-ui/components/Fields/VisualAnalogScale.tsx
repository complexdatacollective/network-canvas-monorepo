import Slider from "./Slider";

interface VisualAnalogScaleProps {
	parameters: {
		minLabel: string;
		maxLabel: string;
	};
	[key: string]: any;
}

// eslint-disable-next-line react/jsx-props-no-spreading
const VisualAnalogScale = (props: VisualAnalogScaleProps) => <Slider {...props} />;

export default VisualAnalogScale;
