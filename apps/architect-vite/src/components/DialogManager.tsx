import Dialogs from "@codaco/legacy-ui/components/Dialogs";
import { connect } from "react-redux";
import { bindActionCreators, compose } from "redux";
import { actionCreators as dialogsActions } from "../ducks/modules/dialogs";

type RootState = {
	dialogs: {
		dialogs: unknown[];
	};
};

const mapStateToProps = (state: RootState) => ({
	dialogs: state.dialogs.dialogs,
});

const mapDispatchToProps = (dispatch: any) => ({
	closeDialog: bindActionCreators(dialogsActions.closeDialog, dispatch),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(Dialogs);
