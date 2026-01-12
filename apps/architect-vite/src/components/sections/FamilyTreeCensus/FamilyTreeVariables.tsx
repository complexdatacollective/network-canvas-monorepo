import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import { formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import ValidatedField from "../../Form/ValidatedField";
import IssueAnchor from "../../IssueAnchor";

type FamilyTreeVariablesProps = StageEditorSectionProps & {
	type?: string;
	entity?: string;
	disabled?: boolean;
};

const FamilyTreeVariables = ({ form, type, disabled }: FamilyTreeVariablesProps) => {
	const formSelector = formValueSelector(form);

	// Get edge type from form to filter edge variables
	const edgeType = useSelector((state: RootState) => {
		const edgeTypeValue = formSelector(state, "edgeType");
		return get(edgeTypeValue, "type");
	});

	// Get variable options for node type
	const nodeVariableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: "node", type }),
	);

	// Get variable options for edge type
	const edgeVariableOptions = useSelector((state: RootState) =>
		edgeType ? getVariableOptionsForSubject(state, { entity: "edge", type: edgeType }) : [],
	);

	// Filter for boolean variables (for nodeIsEgoVariable)
	const booleanNodeVariables = nodeVariableOptions.filter((v) => v.type === "boolean");

	// Filter for categorical variables (for relationshipTypeVariable, sexVariable)
	const categoricalNodeVariables = nodeVariableOptions.filter((v) => v.type === "categorical");
	const categoricalEdgeVariables = edgeVariableOptions.filter((v) => v.type === "categorical");

	return (
		<Section
			disabled={disabled}
			title="Variable Mappings"
			summary={
				<p>
					Configure which variables will be used to store family tree data. These variables must exist on the node and
					edge types you selected above.
				</p>
			}
		>
			<Section title="Edge Variables" layout="vertical">
				<Row>
					<IssueAnchor fieldName="relationshipTypeVariable" description="Relationship Type Variable" />
					<ValidatedField
						name="relationshipTypeVariable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity: "edge",
							type: edgeType,
							label: "Variable to store relationship type (e.g., partner, parent, ex-partner)",
							options: categoricalEdgeVariables,
						}}
					/>
				</Row>
			</Section>

			<Section title="Node Variables" layout="vertical">
				<Row>
					<IssueAnchor fieldName="relationshipToEgoVariable" description="Relationship to Ego Variable" />
					<ValidatedField
						name="relationshipToEgoVariable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity: "node",
							type,
							label: "Variable to store each person's relationship to the participant",
							options: categoricalNodeVariables,
						}}
					/>
				</Row>

				<Row>
					<IssueAnchor fieldName="sexVariable" description="Sex Variable" />
					<ValidatedField
						name="sexVariable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity: "node",
							type,
							label: "Variable for biological sex (used for family tree visualization)",
							options: categoricalNodeVariables,
						}}
					/>
				</Row>

				<Row>
					<IssueAnchor fieldName="nodeIsEgoVariable" description="Node Is Ego Variable" />
					<ValidatedField
						name="nodeIsEgoVariable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity: "node",
							type,
							label: "Boolean variable to identify the ego node",
							options: booleanNodeVariables,
						}}
					/>
				</Row>
			</Section>
		</Section>
	);
};

export default compose<FamilyTreeVariablesProps, StageEditorSectionProps>(
	withSubject,
	withDisabledSubjectRequired,
)(FamilyTreeVariables);
