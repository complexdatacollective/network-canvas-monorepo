import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import { bindActionCreators } from "@reduxjs/toolkit";
import { has } from "es-toolkit/compat";
import { useCallback } from "react";
import { connect } from "react-redux";
import type { FormAction } from "redux-form";
import { arrayPush, change, Field, formValueSelector } from "redux-form";
import { v4 as uuid } from "uuid";
import { Section } from "~/components/EditorLayout";
import OrderedList from "~/components/OrderedList/OrderedList";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import { Button } from "~/lib/legacy-ui/components";
import IssueAnchor from "../../IssueAnchor";
import NodePanel from "./NodePanel";

type DialogConfig = {
	type: string;
	title: string;
	message: string;
	confirmLabel: string;
};

type NodePanelsProps = {
	form: string;
	createNewPanel: () => void;
	panels?: Array<Record<string, unknown>> | null;
	disabled?: boolean;
};

const NodePanels = ({ form, createNewPanel, panels = null, disabled = false, ...rest }: NodePanelsProps) => {
	const dispatch = useAppDispatch();
	const openDialog = useCallback(
		(dialog: DialogConfig) => dispatch(dialogActions.openDialog(dialog) as UnknownAction),
		[dispatch],
	);

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			if (!panels || panels.length === 0 || newState === true) {
				return true;
			}

			const confirm = await openDialog({
				type: "Warning",
				title: "This will delete your panel configuration",
				message:
					"This will clear your panel configuration, and delete any filter rules you have created. Do you want to continue?",
				confirmLabel: "Remove panels",
			});

			if (confirm) {
				dispatch(change(form, "panels", null) as unknown as FormAction);
				return true;
			}

			return false;
		},
		[dispatch, openDialog, panels, form],
	);

	const isFull = panels && panels.length === 2;

	return (
		<Section
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
			title="Side Panels"
			toggleable
			summary={<p>Use this section to configure up to two side panels on this name generator.</p>}
			startExpanded={!!panels}
			handleToggleChange={handleToggleChange}
		>
			<div className="stage-editor-section-content-items">
				<IssueAnchor fieldName="panels" description="Panel Configuration" />
				<Field name="panels" component={OrderedList} item={NodePanel} form={form} />

				{!isFull && (
					<div className="stage-editor-section-content-items__controls">
						<Button onClick={() => createNewPanel()} icon="add">
							Add new panel
						</Button>
					</div>
				)}
			</div>
		</Section>
	);
};

const mapStateToProps = (state: RootState, props: { form: string }) => {
	const getFormValues = formValueSelector(props.form);
	const panels = getFormValues(state, "panels") as Array<Record<string, unknown>> | null | undefined;
	const disabled = !has(getFormValues(state, "subject") as Record<string, unknown>, "type");

	return {
		disabled,
		panels,
	};
};

const mapDispatchToProps = (dispatch: Dispatch, { form }: { form: string }) => ({
	createNewPanel: bindActionCreators(
		() =>
			arrayPush(form, "panels", {
				id: uuid(),
				title: null,
				dataSource: "existing",
				filter: null,
			}) as FormAction,
		dispatch,
	),
});

export default connect(mapStateToProps, mapDispatchToProps)(NodePanels);
