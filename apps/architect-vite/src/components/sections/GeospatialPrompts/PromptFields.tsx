import { compose } from "recompose";
import { Row, Section } from "~/components/EditorLayout";
import { ValidatedField } from "~/components/Form";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
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

const PromptFields = ({
	variable = "",
	variableOptions,
	entity = "",
	type = "",
	changeForm = () => {},
	form,
}: PromptFieldsProps) => {
	const newVariableWindowInitialProps = {
		entity,
		type,
		initialValues: { name: null, type: VARIABLE_TYPE },
	};

	const handleCreatedNewVariable = (id: string, params: { field: string }) => changeForm(form, params.field, id);

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
			<NewVariableWindow
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...newVariableWindowProps}
			/>
		</>
	);
};

export default compose(withVariableOptions, withVariableHandlers)(PromptFields as React.ComponentType<unknown>);
