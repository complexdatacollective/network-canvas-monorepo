import { connect } from "react-redux";
import { bindActionCreators, compose } from "redux";
import { ToastManager as UIToastManager } from "~/lib/legacy-ui/components";
import { actionCreators as toastActions } from "../ducks/modules/toasts";

const mapStateToProps = (state) => ({
	toasts: state.toasts,
});

const mapDispatchToProps = (dispatch) => ({
	removeToast: bindActionCreators(toastActions.removeToast, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(UIToastManager);
