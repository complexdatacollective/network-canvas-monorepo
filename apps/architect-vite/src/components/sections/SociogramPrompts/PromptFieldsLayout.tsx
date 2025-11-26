import type { VariableOptions } from "@codaco/protocol-validation";
import type { ComponentProps } from "react";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import type { FormAction } from "redux-form";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import withCreateVariableHandlers from "~/components/enhancers/withCreateVariableHandler";
import { ValidatedField } from "~/components/Form";
import MultiSelect from "~/components/Form/MultiSelect";
import IssueAnchor from "~/components/IssueAnchor";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/modules/root";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import Tip from "../../Tip";
import { getSortOrderOptionGetter } from "../CategoricalBinPrompts/optionGetters";
import withCanCreateEdgesState from "./withCanCreateEdgesState";
import withLayoutOptions from "./withLayoutOptions";

type LayoutVariableOption = {
	isUsed?: boolean;
	label: string;
	type: string;
	value: string;
};

type VariableOption = VariableOptions[number];

type PromptFieldsProps = {
	form: string;
	allowPositioning?: boolean;
	entity: string;
	handleCreateVariable: (value: string, type: string, fieldName: string) => void;
	layoutVariablesForSubject: LayoutVariableOption[];
	layoutVariable?: string | null;
	type: string;
	variableOptions: VariableOption[];
};

const PromptFields = ({
	form,
	allowPositioning = true,
	entity,
	handleCreateVariable,
	layoutVariablesForSubject,
	layoutVariable = null,
	type,
	variableOptions,
}: PromptFieldsProps) => {
	const dispatch = useAppDispatch();
	const getFormValue = formValueSelector(form);
	const hasSortOrder = useSelector((state: RootState) => getFormValue(state, "sortOrder"));

	const handleToggleSortOrder = (nextState: boolean) => {
		if (nextState === false) {
			dispatch(change(form, "sortOrder", null) as FormAction);
		}

		return true;
	};

	return (
		<Section
			title="Layout"
			summary={<p>This variable stores the position of nodes on the sociogram.</p>}
			group
			layout="vertical"
		>
			<Row>
				<IssueAnchor fieldName="layout.layoutVariable" description="Layout Variable" />
				<Tip type="info">
					<p>
						If you use the same layout variable across all prompts, the position of nodes will be automatically set as
						the participant moves between tasks.
					</p>
				</Tip>
				<ValidatedField
					name="layout.layoutVariable"
					component={VariablePicker}
					validation={{ required: true }}
					componentProps={{
						label: "Create or select a variable to store node coordinates",
						type,
						entity,
						options: layoutVariablesForSubject,
						onCreateOption: (value: string) => handleCreateVariable(value, "layout", "layout.layoutVariable"),
						variable: layoutVariable,
					}}
				/>
			</Row>
			{allowPositioning && (
				<Section
					toggleable
					title="Sort Unplaced Nodes"
					summary={
						<p>
							Nodes are stacked in a bucket until your participant drags them into position. You can control the order
							of this stack, which will determine the order that your participant is able to position the nodes.
						</p>
					}
					startExpanded={!!hasSortOrder}
					handleToggleChange={handleToggleSortOrder}
					layout="vertical"
				>
					<Row>
						<MultiSelect
							name="sortOrder"
							properties={[{ fieldName: "property" }, { fieldName: "direction" }]}
							maxItems={5}
							options={(property: string, rowValues: unknown, allValues: unknown): VariableOption[] =>
								getSortOrderOptionGetter(variableOptions as VariableOption[])(
									property,
									rowValues,
									allValues as Record<string, unknown>[],
								)
							}
						/>
					</Row>
				</Section>
			)}
		</Section>
	);
};

export default compose<ComponentProps<typeof PromptFields>, typeof PromptFields>(
	withLayoutOptions,
	withCanCreateEdgesState,
	withCreateVariableHandlers,
)(PromptFields);
