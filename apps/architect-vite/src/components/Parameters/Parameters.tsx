import { isMatch } from "lodash";
import DatePicker from "./DatePicker";
import RelativeDatePicker from "./RelativeDatePicker";
import Scalar from "./Scalar";

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
	component: React.ComponentType<Record<string, unknown>>;
} & Record<string, unknown>;

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
