/* eslint-disable react/jsx-props-no-spreading */

import Slider from "./Slider";

type LikertScaleProps = {
	options: unknown[];
	[key: string]: unknown;
};

const LikertScale = (props: LikertScaleProps) => <Slider {...props} />;

export default LikertScale;
