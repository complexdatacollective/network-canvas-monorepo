import { connect } from "react-redux";
import { compose, withProps } from "recompose";
import type { RootState } from "~/ducks/modules/root";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import NativeSelect from "./NativeSelect";

const withVariableValidator = withProps(({ validation }) => ({
	validation: { ...validation, allowedVariableName: "variable name" },
}));

const mapStateToProps = (
	state: RootState,
	{ entity, type }: { entity: "node" | "edge" | "ego"; type?: string },
) => {
	const existingVariables = getVariableOptionsForSubject(state, { entity, type });

	return { reserved: existingVariables };
};

type VariableOption = {
	value: string;
	label: string;
};

type VariableSelectProps = {
	reserved?: VariableOption[];
	entity?: string;
	type?: string;
	variable?: string;
} & Record<string, unknown>;

// TODO: For now just map existing variables, but later could also append create handlers!
const VariableSelect = ({
	reserved = [],
	entity = null,
	type = null,
	variable = null,
	...props
}: VariableSelectProps) => (
	<div className="form-fields-variable-select">
		<NativeSelect
			placeholder="Select or create a variable"
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
			reserved={reserved}
		/>
	</div>
);

export default compose(connect(mapStateToProps, {}), withVariableValidator)(VariableSelect);
