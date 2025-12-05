import type { ComponentProps } from "react";
import { compose } from "recompose";
import { Row, Section } from "~/components/EditorLayout";
import { ValidatedField } from "~/components/Form";
import NewVariableWindow, { type Entity, useNewVariableWindowState } from "~/components/NewVariableWindow";
import withVariableHandlers from "~/components/sections/CategoricalBinPrompts/withVariableHandlers"; // TODO: should these be moved somewhere more general?
import withVariableOptions from "~/components/sections/CategoricalBinPrompts/withVariableOptions";
import PromptText from "~/components/sections/PromptText";
import VariablePicker from "../../Form/Fields/VariablePicker/VariablePicker";

const VARIABLE_TYPE = "location";

type PromptFieldsProps = {
	variable?: string;
	variableOptions: Array<{ type: string }>;
	entity?: string;
	type?: string;
	changeForm?: (form: string, field: string, value: unknown) => void;
	form: string;
};

const PromptFields = ({ variableOptions, entity = "", type = "", changeForm = () => {}, form }: PromptFieldsProps) => {
	const newVariableWindowInitialProps = {
		entity: entity as Entity,
		type,
		initialValues: { name: "", type: VARIABLE_TYPE },
	};

	const handleCreatedNewVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		changeForm(form, params.field, id);
	};

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		newVariableWindowInitialProps,
		handleCreatedNewVariable,
	);
	const handleNewVariable = (name: string) => {
		openNewVariableWindow({ initialValues: { name, type: VARIABLE_TYPE } }, { field: "variable" });
	};

	const geoVariableOptions = variableOptions.filter(({ type: variableType }) => variableType === VARIABLE_TYPE);

	return (
		<>
			<PromptText />
			<Section title="Selection Variable" layout="vertical">
				<Row>
					<ValidatedField
						name="variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							type,
							entity,
							options: geoVariableOptions,
							onCreateOption: handleNewVariable,
						}}
					/>
				</Row>
			</Section>
			<NewVariableWindow {...newVariableWindowProps} />
		</>
	);
};

export default compose<ComponentProps<typeof PromptFields>, typeof PromptFields>(
	withVariableOptions,
	withVariableHandlers,
)(PromptFields);
