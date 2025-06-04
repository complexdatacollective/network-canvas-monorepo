import { connect } from "react-redux";
import { compose, withProps } from "recompose";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import NativeSelect from "./NativeSelect";

const withVariableValidator = withProps(({ validation }) => ({
	validation: { ...validation, allowedVariableName: "variable name" },
}));

const mapStateToProps = (state, { entity, type }) => {
	const existingVariables = getVariableOptionsForSubject(state, { entity, type });

	return { reserved: existingVariables };
};

type VariableSelectProps = {
	reserved?: any[];
	entity?: string;
	type?: string;
	variable?: string;
} & Record<string, any>;

// TODO: For now just map existing variables, but later could also append create handlers!
const VariableSelect = ({ reserved = [], entity = null, type = null, variable = null, ...props }: VariableSelectProps) => (
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
