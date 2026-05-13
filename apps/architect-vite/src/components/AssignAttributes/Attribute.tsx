import type { ComponentProps } from "react";
import { compose } from "react-recompose";
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
		<div className="my-(--space-md) flex rounded-(--radius) p-(--space-md) [&_.form-field]:mb-0 [&_.form-field]:bg-surface-2">
			<div className="flex grow shrink-0 basis-auto flex-col">
				{/* The legacy `.assign-attributes-attribute__variable` cascade overrode
				    the form-fields-variable-picker fieldset margins. Replicate via the
				    descendant selector so we don't need to touch the deferred picker. */}
				<div className="grow shrink-0 basis-auto [&_.form-fields-variable-picker]:mt-0 [&_.form-fields-variable-picker]:mb-(--space-md)">
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
					<fieldset className="grow shrink-0 basis-auto rounded-(--radius) border-2 border-dashed border-border p-(--space-md) [&>legend]:px-(--space-md)">
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
				className="flex grow-0 shrink-0 basis-(--space-3xl) cursor-pointer items-center justify-center pl-(--space-md) [&_.icon]:h-(--space-md) [&_.icon]:cursor-pointer"
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
