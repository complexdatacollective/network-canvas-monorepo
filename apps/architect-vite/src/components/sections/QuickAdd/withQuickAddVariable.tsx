import { connect } from "react-redux";
import { compose } from "recompose";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

type OwnProps = {
	form: string;
};

const mapStateToProps = (state: RootState, { form }: OwnProps) => {
	const quickAdd = formValueSelector(form)(state, "quickAdd");

	return {
		quickAdd,
	};
};

const withQuickAddState = connect(mapStateToProps);

const withQuickAddVariable = compose(withQuickAddState);

export default withQuickAddVariable;
