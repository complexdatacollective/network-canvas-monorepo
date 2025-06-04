import { Field as RichText } from "@codaco/legacy-ui/components/Fields/RichText";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, Field, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { getFieldId } from "~/utils/issues";

type RootState = {
	[key: string]: any;
};

const InterviewerScript = () => {
	const getFormValue = formValueSelector("edit-stage");
	const currentValue = useSelector((state: RootState) => getFormValue(state, "interviewScript"));
	const dispatch = useDispatch();
	const openDialog = useCallback((dialog: any) => dispatch(dialogActions.openDialog(dialog)), [dispatch]);

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			if (!currentValue || newState === true) {
				return true;
			}

			const confirm = await openDialog({
				type: "Warning",
				title: "This will clear your interview script",
				message:
					"This will clear your interview script, and delete content you previously entered. Do you want to continue?",
				confirmLabel: "Clear script",
			});

			if (confirm) {
				dispatch(change("edit-stage", "interviewScript", null));
				return true;
			}

			return false;
		},
		[dispatch, openDialog, currentValue],
	);

	return (
		<Section
			id={getFieldId("interviewScript")}
			className="interview-script"
			title="Interviewer Script"
			summary={<p>Use this section to create notes or a guide for the interviewer.</p>}
			toggleable
			startExpanded={!!currentValue}
			handleToggleChange={handleToggleChange}
		>
			<Field name="interviewScript" component={RichText} placeholder="Enter text for the interviewer here." />
		</Section>
	);
};

export default InterviewerScript;