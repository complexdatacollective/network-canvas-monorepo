import { compose } from "recompose";
import * as Fields from "~/components/Form/Fields";
import ValidatedField from "~/components/Form/ValidatedField";
import Icon from "~/lib/legacy-ui/components/Icon";
import withCreateVariableHandler from "../enhancers/withCreateVariableHandler";
import VariablePicker from "../Form/Fields/VariablePicker/VariablePicker";
import withAttributeHandlers from "./withAttributeHandlers";

type VariableOption = {
	disabled?: boolean;
	isUsed?: boolean;
	label: string;
	type: string;
	value: string;
};

type AttributeProps = {
	field: string;
	variable?: string | null;
	variableOptions: VariableOption[];
	handleCreateVariable: (value: string, type: string, field: string) => void;
	handleDelete: () => void;
	entity: string;
	type: string;
};

const Attribute = ({
	field,
	variable = null,
	variableOptions,
	handleCreateVariable,
	handleDelete,
	entity,
	type,
}: AttributeProps) => {
	const handleDeleteKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleDelete();
		}
	};

	return (
		<div className="assign-attributes-attribute bg-section-background">
			<div className="assign-attributes-attribute__wrapper">
				<div className="assign-attributes-attribute__variable">
					<ValidatedField
						name={`${field}.variable`}
						component={VariablePicker}
						validation={{ required: true }}
						options={variableOptions}
						onCreateOption={(value) => handleCreateVariable(value, "boolean", `${field}.variable`)}
						entity={entity}
						type={type}
						variable={variable}
					/>
				</div>
				{variable && (
					<fieldset className="assign-attributes-attribute__value">
						<legend>Set value of variable to:</legend>
						<ValidatedField
							name={`${field}.value`}
							options={[
								{ label: "True", value: true },
								{ label: "False", value: false, negative: true },
							]}
							component={Fields.Boolean}
							validation={{ required: true }}
							noReset
						/>
					</fieldset>
				)}
			</div>
			<div
				className="assign-attributes-attribute__delete"
				onClick={handleDelete}
				onKeyDown={handleDeleteKeyDown}
				role="button"
				tabIndex={0}
				aria-label="Delete attribute"
			>
				<Icon name="delete" />
			</div>
		</div>
	);
};

export default compose(withAttributeHandlers, withCreateVariableHandler)(Attribute);
