import { connect } from "react-redux";
import { bindActionCreators, compose } from "redux";
import Dialogs from "~/lib/legacy-ui/components/Dialogs";
import { actionCreators as dialogsActions } from "../ducks/modules/dialogs";

const mapStateToProps = (state) => ({
	dialogs: state.dialogs.dialogs,
});

const mapDispatchToProps = (dispatch) => ({
	closeDialog: bindActionCreators(dialogsActions.closeDialog, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(Dialogs);
