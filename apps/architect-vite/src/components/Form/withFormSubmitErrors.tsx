import { connect } from "react-redux";
import { getFormSyncErrors, hasSubmitFailed } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

const makeMapStateToProps = (form: string) => (state: RootState) => ({
	submitFailed: hasSubmitFailed(form)(state),
	issues: getFormSyncErrors(form)(state),
});

const withFormSubmitErrors = (form: string) => connect(makeMapStateToProps(form));

export default withFormSubmitErrors;
