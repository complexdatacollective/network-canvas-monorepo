import { connect } from "react-redux";
import { getFormSyncErrors, hasSubmitFailed } from "redux-form";

const makeMapStateToProps = (form) => (state) => ({
	submitFailed: hasSubmitFailed(form)(state),
	issues: getFormSyncErrors(form)(state),
});

const withFormSubmitErrors = (form) => connect(makeMapStateToProps(form));

export default withFormSubmitErrors;
