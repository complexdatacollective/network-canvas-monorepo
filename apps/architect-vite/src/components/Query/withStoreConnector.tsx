import { bindActionCreators, type Dispatch } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import { getCodebook } from "~/selectors/protocol";

const mapStateToProps = (state: RootState) => ({
	codebook: getCodebook(state),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
	openDialog: bindActionCreators(dialogsActions.openDialog, dispatch),
});

const withStoreConnector = connect(mapStateToProps, mapDispatchToProps);

export default withStoreConnector;
