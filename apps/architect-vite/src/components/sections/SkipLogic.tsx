import { useCallback } from "react";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import SkipLogicFields from "~/components/sections/fields/SkipLogicFields";
import { useAppDispatch } from "~/ducks/hooks";
import { openDialog } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";

const SkipLogicSection = (_props: StageEditorSectionProps) => {
	const dispatch = useAppDispatch();

	const getFormValue = formValueSelector("edit-stage");
	const hasSkipLogic = useSelector((state: RootState) => getFormValue(state, "skipLogic"));

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			// When turning skip logic on
			if (!hasSkipLogic || newState === true) {
				return true;
			}

			// When turning skip logic off, confirm that the user wants to clear the skip logic
			const confirm = await dispatch(
				openDialog({
					type: "Warning",
					title: "This will clear your skip logic",
					message: "This will clear your skip logic, and delete any rules you have created. Do you want to continue?",
					confirmLabel: "Clear skip logic",
				}),
			).unwrap();

			if (confirm) {
				dispatch(change("edit-stage", "skipLogic", null));
				return true;
			}

			return false;
		},
		[dispatch, hasSkipLogic],
	);

	return (
		<Section
			toggleable
			title="Skip Logic"
			summary={<p>Use skip logic to determine if this stage should be shown in the interview.</p>}
			startExpanded={!!hasSkipLogic}
			handleToggleChange={handleToggleChange}
		>
			<SkipLogicFields />
		</Section>
	);
};

export default SkipLogicSection;
