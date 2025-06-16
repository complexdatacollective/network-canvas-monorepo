import Slider from "./Slider";

interface LikertScaleProps {
	options: any[];
	[key: string]: any;
}

// eslint-disable-next-line react/jsx-props-no-spreading
const LikertScale = (props: LikertScaleProps) => <Slider {...props} />;

export default LikertScale;
