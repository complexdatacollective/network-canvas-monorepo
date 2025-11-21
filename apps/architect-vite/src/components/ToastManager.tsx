import { bindActionCreators, compose } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { ToastManager as UIToastManager } from "~/lib/legacy-ui/components";
import { removeToast } from "../ducks/modules/toasts";

type RootState = {
	toasts: unknown[];
};

const mapStateToProps = (state: RootState) => ({
	toasts: state.toasts,
});

type AppDispatch = (action: unknown) => void;

const mapDispatchToProps = (dispatch: AppDispatch) => ({
	removeToast: bindActionCreators(removeToast, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(UIToastManager as React.ComponentType<unknown>);
