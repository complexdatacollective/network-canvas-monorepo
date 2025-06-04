import { ToastManager as UIToastManager } from "@codaco/legacy-ui/components";
import { connect } from "react-redux";
import { bindActionCreators, compose } from "@reduxjs/toolkit";
import { actionCreators as toastActions } from "../ducks/modules/toasts";

type RootState = {
	toasts: unknown[];
};

const mapStateToProps = (state: RootState) => ({
	toasts: state.toasts,
});

const mapDispatchToProps = (dispatch: any) => ({
	removeToast: bindActionCreators(toastActions.removeToast, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(UIToastManager);
