import { useSelector } from "react-redux";
import { Row, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { getFieldId } from "~/utils/issues";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";
import PromptText from "../PromptText";

type DiseasePromptFieldsProps = {
	entity?: string;
	type?: string;
};

const DiseasePromptFields = ({ entity, type }: DiseasePromptFieldsProps) => {
	const variableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: entity as "node", type }),
	);

	// Filter for boolean variables
	const booleanVariables = variableOptions.filter((v) => v.type === "boolean");

	return (
		<>
			<PromptText />
			<Section title="Variable" layout="vertical">
				<Row>
					<div id={getFieldId("variable")} />
					<ValidatedField
						name="variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity,
							type,
							options: booleanVariables,
						}}
					/>
				</Row>
			</Section>
		</>
	);
};

export default DiseasePromptFields;
