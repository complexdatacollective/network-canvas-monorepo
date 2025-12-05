import { isMatch } from "lodash";
import type React from "react";
import DatePicker from "./DatePicker";
import RelativeDatePicker from "./RelativeDatePicker";
import Scalar from "./Scalar";

type ComponentType = React.ComponentType<Record<string, unknown>>;

const definitions: Array<[ComponentType, { type: string; component?: string }]> = [
	[Scalar as unknown as ComponentType, { type: "scalar" }],
	[DatePicker as unknown as ComponentType, { type: "datetime", component: "DatePicker" }],
	[RelativeDatePicker as unknown as ComponentType, { type: "datetime", component: "RelativeDatePicker" }],
];

const getComponent = (options: { type: string; component?: string }): ComponentType | undefined => {
	const found = definitions.find(([, pattern]) => isMatch(options, pattern));

	return found ? found[0] : undefined;
};

type ParametersProps = {
	type: string;
	component?: string;
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
