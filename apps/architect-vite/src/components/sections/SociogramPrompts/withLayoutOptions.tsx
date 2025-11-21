import { connect } from "react-redux";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getVariableOptionsForSubject } from "../../../selectors/codebook";
import { getLayoutVariablesForSubject } from "./selectors";

type OwnProps = {
	entity: "node" | "edge" | "ego";
	type: string;
	form: string;
};

type StateProps = {
	variableOptions: ReturnType<typeof getVariableOptionsForSubject>;
	layoutVariablesForSubject: ReturnType<typeof getLayoutVariablesForSubject>;
	allowPositioning: unknown;
	layoutVariable: unknown;
};

const withLayoutOptions = (state: RootState, { entity, type, form }: OwnProps): StateProps => {
	const variableOptions = getVariableOptionsForSubject(state, { entity, type });
	const layoutVariablesForSubject = getLayoutVariablesForSubject(state, { entity, type });
	const allowPositioning = formValueSelector(form)(state, "layout.allowPositioning");
	const layoutVariable = formValueSelector(form)(state, "layout.layoutVariable");

	return {
		variableOptions,
		layoutVariablesForSubject,
		allowPositioning,
		layoutVariable,
	};
};

export default connect<StateProps, Record<string, never>, OwnProps, RootState>(withLayoutOptions);
