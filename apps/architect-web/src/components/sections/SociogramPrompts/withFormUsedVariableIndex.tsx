import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import type { RootState } from "~/ducks/store";
import { utils } from "../../../selectors/indexes";

const mapStateToProps = (state: RootState, props: StageEditorSectionProps) => {
	const getFormValues = formValueSelector(props.form);
	const prompts = getFormValues(state, "prompts");
	const formUsedVariableIndex = utils.collectPath("prompts[].highlight.variable", { prompts });

	return {
		formUsedVariableIndex,
	};
};

const withFormUsedVariableIndex = connect(mapStateToProps);

export default withFormUsedVariableIndex;
