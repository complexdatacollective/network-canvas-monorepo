import type { ComponentType } from "react";
import { useSelector } from "react-redux";
import { Row, Section } from "~/components/EditorLayout";
import RichText from "~/components/Form/Fields/RichText/Field";
import ValidatedField from "~/components/Form/ValidatedField";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";

type DiseasePromptFieldsProps = {
	entity?: string;
	type?: string;
};

const DiseasePromptFields = ({ entity, type }: DiseasePromptFieldsProps) => {
	const variableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: entity as "node", type }),
	);

	// Filter for boolean variables (disease presence is typically yes/no)
	const booleanVariables = variableOptions.filter((v) => v.type === "boolean");

	return (
		<>
			<Section title="Prompt Text" layout="vertical">
				<Row>
					<ValidatedField
						name="text"
						component={RichText as ComponentType<Record<string, unknown>>}
						validation={{ required: true, maxLength: 220 }}
						componentProps={{
							inline: true,
							label: "Prompt Text",
							placeholder: "e.g., Has this person ever been diagnosed with diabetes?",
						}}
					/>
				</Row>
			</Section>
			<Section title="Variable" layout="vertical">
				<Row>
					<ValidatedField
						name="variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity,
							type,
							label: "Select a boolean variable to store the response",
							options: booleanVariables,
						}}
					/>
				</Row>
			</Section>
		</>
	);
};

export default DiseasePromptFields;
