import { useCallback } from "react";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { useAppDispatch } from "~/ducks/hooks";
import { openDialog } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import DiseasePromptFields from "./DiseasePromptFields";
import DiseasePromptPreview from "./DiseasePromptPreview";

type DiseaseNominationPromptsProps = StageEditorSectionProps & {
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const DiseaseNominationPrompts = ({ form, entity, type, disabled }: DiseaseNominationPromptsProps) => {
	const dispatch = useAppDispatch();

	const getFormValue = formValueSelector(form);
	const hasDiseaseNominationStep = useSelector(
		(state: RootState) => getFormValue(state, "diseaseNominationStep") as unknown[] | undefined,
	);

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			// When turning disease nomination on
			if (!hasDiseaseNominationStep?.length || newState === true) {
				return true;
			}

			// When turning disease nomination off, confirm that the user wants to clear the prompts
			const confirm = await dispatch(
				openDialog({
					type: "Warning",
					title: "This will clear your disease nomination prompts",
					message:
						"This will clear your disease nomination prompts and delete any prompts you have created. Do you want to continue?",
					confirmLabel: "Clear prompts",
				}),
			).unwrap();

			if (confirm) {
				dispatch(change(form, "diseaseNominationStep", null));
				return true;
			}

			return false;
		},
		[dispatch, form, hasDiseaseNominationStep],
	);

	return (
		<Section
			disabled={disabled}
			summary={
				<p>
					Optionally add prompts to collect health or disease information about family members. Each prompt should ask
					about a specific condition and will store the response in the selected variable.
				</p>
			}
			title="Disease Nomination Prompts"
			toggleable
			startExpanded={!!hasDiseaseNominationStep?.length}
			handleToggleChange={handleToggleChange}
		>
			<EditableList
				previewComponent={DiseasePromptPreview}
				editComponent={DiseasePromptFields}
				title="Edit Prompt"
				fieldName="diseaseNominationStep"
				form={form}
				editProps={{ entity, type }}
			/>
		</Section>
	);
};

export default compose<DiseaseNominationPromptsProps, StageEditorSectionProps>(
	withSubject,
	withDisabledSubjectRequired,
)(DiseaseNominationPrompts);
