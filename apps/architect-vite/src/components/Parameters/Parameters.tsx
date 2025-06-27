import { isMatch } from "lodash";
import Scalar from "./Scalar";
import DatePicker from "./DatePicker";
import RelativeDatePicker from "./RelativeDatePicker";

const definitions = [
	[Scalar, { type: "scalar" }],
	[DatePicker, { type: "datetime", component: "DatePicker" }],
	[RelativeDatePicker, { type: "datetime", component: "RelativeDatePicker" }],
];

const getComponent = (options) => {
	const [component] = definitions.find(([, pattern]) => isMatch(options, pattern));

	return component;
};

type ParametersProps = {
	type: string;
	component: any;
	[key: string]: any;
};

const Parameters = ({ type, component, ...rest }: ParametersProps) => {
	const ParameterComponent = getComponent({ type, component });
	if (!ParameterComponent) {
		return null;
	}

	return (
		<ParameterComponent
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		/>
	);
};

export default Parameters;
