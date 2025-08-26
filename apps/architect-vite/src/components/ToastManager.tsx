import { bindActionCreators, compose } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { ToastManager as UIToastManager } from "~/lib/legacy-ui/components";
import { actionCreators as toastActions } from "../ducks/modules/toasts";

type RootState = {
	toasts: unknown[];
};

const mapStateToProps = (state: RootState) => ({
	toasts: state.toasts,
});

const mapDispatchToProps = (dispatch: ReturnType<typeof configureStore>["dispatch"]) => ({
	removeToast: bindActionCreators(toastActions.removeToast, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(UIToastManager);
