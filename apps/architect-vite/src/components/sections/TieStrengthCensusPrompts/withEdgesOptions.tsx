import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change } from "redux-form";
import type { RootState } from "~/ducks/store";
import { getEdgesForSubject } from "../SociogramPrompts/selectors";

const mapDispatchToProps = {
	changeForm: change,
};

const mapStateToProps = (state: RootState) => {
	const edgesForSubject = getEdgesForSubject(state);

	return {
		edgesForSubject,
	};
};

const handlers = withHandlers({
	// createEdge select has changed value, so we must reset rest
	// of the dependent fields.
	handleChangeCreateEdge:
		({ changeForm, form }: { changeForm: typeof change; form: string }) =>
		(value: unknown) => {
			if (!value) return;
			changeForm(form, "createEdge", value);
		},
});

const withEdgesOptions = compose(connect(mapStateToProps, mapDispatchToProps), handlers);

export default withEdgesOptions;
