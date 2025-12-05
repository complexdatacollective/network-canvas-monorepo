import type { ComponentProps } from "react";
import { compose } from "recompose";
import { BooleanField } from "~/components/Form/Fields";
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
	return (
		<div className="assign-attributes-attribute bg-section-background">
			<div className="assign-attributes-attribute__wrapper">
				<div className="assign-attributes-attribute__variable">
					<ValidatedField
						name={`${field}.variable`}
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							options: variableOptions,
							onCreateOption: (value: string) => handleCreateVariable(value, "boolean", `${field}.variable`),
							entity,
							type,
							variable,
						}}
					/>
				</div>
				{variable && (
					<fieldset className="assign-attributes-attribute__value">
						<legend>Set value of variable to:</legend>
						<ValidatedField
							name={`${field}.value`}
							component={BooleanField}
							validation={{ required: true }}
							componentProps={{
								options: [
									{ label: "True", value: true },
									{ label: "False", value: false, negative: true },
								],
								noReset: true,
							}}
						/>
					</fieldset>
				)}
			</div>
			<button
				type="button"
				className="assign-attributes-attribute__delete"
				onClick={handleDelete}
				aria-label="Delete attribute"
			>
				<Icon name="delete" />
			</button>
		</div>
	);
};

export default compose<ComponentProps<typeof Attribute>, typeof Attribute>(
	withAttributeHandlers,
	withCreateVariableHandler,
)(Attribute);
