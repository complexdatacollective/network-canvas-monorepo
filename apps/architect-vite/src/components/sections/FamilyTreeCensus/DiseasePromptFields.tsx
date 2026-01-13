import { useSelector } from "react-redux";
import { change } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import NewVariableWindow, { type Entity, useNewVariableWindowState } from "~/components/NewVariableWindow";
import { useAppDispatch } from "~/ducks/hooks";
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
	const dispatch = useAppDispatch();
	const variableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: entity as "node", type }),
	);

	// Filter for boolean variables
	const booleanVariables = variableOptions.filter((v) => v.type === "boolean");

	const newVariableWindowInitialProps = {
		entity: entity as Entity,
		type: type ?? "",
		initialValues: { name: "", type: "boolean" },
		allowVariableTypes: ["boolean"],
	};

	const handleCreatedNewVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change("editable-list-form", params.field, id));
	};

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		newVariableWindowInitialProps,
		handleCreatedNewVariable,
	);

	const handleNewVariable = (name: string) =>
		openNewVariableWindow({ initialValues: { name, type: "boolean" } }, { field: "variable" });

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
							onCreateOption: handleNewVariable,
						}}
					/>
				</Row>
			</Section>
			<NewVariableWindow {...newVariableWindowProps} />
		</>
	);
};

export default DiseasePromptFields;
