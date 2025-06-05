import { Button } from "@codaco/legacy-ui/components";
import { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "@reduxjs/toolkit";
import { isDirty, isSubmitting, startSubmit, submit } from "redux-form";
import { actionCreators as timelineActions } from "~/ducks/middleware/timeline";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { hasChanges as timelineHasChanges } from "~/selectors/timeline";
import ControlBar from "../ControlBar";
import Screen from "./Screen";

interface EditorScreenProps {
	header?: React.ReactNode;
	editor: React.ComponentType<any>;
	hasUnsavedChanges: boolean;
	jump: (locus: any) => void;
	layoutId?: string | null;
	locus: any;
	onComplete: () => void;
	openDialog: (config: any) => void;
	secondaryButtons?: Array<any> | null;
	submitForm: () => void;
	submitting: boolean;
	form: string;
	[key: string]: any;
}

class EditorScreen extends Component<EditorScreenProps> {
	handleSubmit = () => {
		const { submitting, submitForm } = this.props;
		if (submitting) {
			return;
		}

		submitForm();
	};

	handleCancel = () => {
		const { hasUnsavedChanges, openDialog } = this.props;
		if (!hasUnsavedChanges) {
			this.cancel();
			return;
		}

		openDialog({
			type: "Warning",
			title: "Unsaved changes will be lost",
			message: "Unsaved changes will be lost, do you want to continue?",
			confirmLabel: "OK",
			onConfirm: () => this.cancel(),
		});
	};

	cancel() {
		const { jump, onComplete, locus } = this.props;
		jump(locus);
		onComplete();
	}

	buttons() {
		const { submitting, hasUnsavedChanges } = this.props;
		const saveButton = (
			<Button key="save" onClick={this.handleSubmit} iconPosition="right" icon="arrow-right" disabled={submitting}>
				Finished Editing
			</Button>
		);

		const cancelButton = (
			<Button key="cancel" onClick={this.handleCancel} color="platinum" iconPosition="right">
				Cancel
			</Button>
		);

		return hasUnsavedChanges ? [cancelButton, saveButton] : [cancelButton];
	}

	render() {
		const { header = null, secondaryButtons = null, editor: EditorComponent, layoutId = null, ...rest } = this.props;

		return (
			<Screen
				header={header}
				footer={<ControlBar buttons={this.buttons()} secondaryButtons={secondaryButtons} />}
				layoutId={layoutId}
				beforeCloseHandler={this.handleCancel}
			>
				<EditorComponent
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...rest}
				/>
			</Screen>
		);
	}
}


const mapStateToProps = (state, { form, locus }) => ({
	hasUnsavedChanges: isDirty(form)(state) || timelineHasChanges(state, locus),
	submitting: isSubmitting(form)(state),
});

const mapDispatchToProps = (dispatch, { form }) => ({
	submitForm: () => {
		dispatch(startSubmit(form));
		dispatch(submit(form));
	},
	jump: bindActionCreators(timelineActions.jump, dispatch),
	openDialog: bindActionCreators(dialogActions.openDialog, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(EditorScreen);
