import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import type { WrappedFieldArrayProps } from "redux-form";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getVariableOptionsForSubject } from "../../selectors/codebook";

const ALLOWED_TYPES = ["boolean"];

type AttributeValue = {
	variable?: string | null;
	value?: unknown;
};

type OwnProps = {
	entity: "node" | "edge" | "ego";
	type?: string;
	form: string;
	fields: WrappedFieldArrayProps<AttributeValue>["fields"];
};

type HandlerProps = OwnProps & {
	handleCompleteCreateNewVariable?: () => void;
	createNewVariableAtIndex?: number;
	addNewVariable?: (variable: string) => void;
};

// TODO: isUsed
const mapStateToProps = (state: RootState, { entity, type, form, fields }: OwnProps) => {
	const usedVariables = (formValueSelector(form)(state, fields.name) as AttributeValue[] | undefined || []).map(
		({ variable }) => variable,
	);
	const variableOptions = getVariableOptionsForSubject(state, { entity, type });

	const variableOptionsWithUsedDisabled = variableOptions
		.filter(({ type: optionType }) => optionType && ALLOWED_TYPES.includes(optionType))
		.map(({ value, ...rest }) => ({
			...rest,
			value,
			disabled: usedVariables.includes(value),
		}));

	return {
		variableOptions: variableOptionsWithUsedDisabled,
		allowedVariableTypes: ALLOWED_TYPES,
	};
};

const mapDispatchToProps = {};

const assignAttributesHandlers = withHandlers<HandlerProps, {}>({
	handleDelete:
		({ fields }: HandlerProps) =>
		(index: number) => {
			fields.remove(index);
			return undefined;
		},
	handleCreateNewVariable:
		({ handleCompleteCreateNewVariable, createNewVariableAtIndex, fields, addNewVariable }: HandlerProps) =>
		(variable: string) => {
			const newAttribute = { variable, value: null };
			if (createNewVariableAtIndex !== undefined) {
				fields.splice(createNewVariableAtIndex, 1, newAttribute);
			}
			handleCompleteCreateNewVariable?.();
			addNewVariable?.(variable);
		},
	handleAddNew:
		({ fields }: HandlerProps) =>
		() =>
			fields.push({}),
});

const withNewVariableHandlers = compose(connect(mapStateToProps, mapDispatchToProps), assignAttributesHandlers);

export default withNewVariableHandlers;
