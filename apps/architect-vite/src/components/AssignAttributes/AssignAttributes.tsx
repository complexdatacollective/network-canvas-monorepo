import type { FieldArrayFieldsProps } from "redux-form";
import Button from "~/lib/legacy-ui/components/Button";
import Attribute from "./Attribute";
import withAssignAttributesHandlers from "./withAssignAttributesHandlers";

type VariableOption = {
	disabled?: boolean;
	isUsed?: boolean;
	label: string;
	type: string;
	value: string;
};

type AssignAttributesProps = {
	variableOptions: VariableOption[];
	fields: FieldArrayFieldsProps<{ variable: string; value: boolean }>;
	type: string;
	entity: string;
	handleAddNew: () => void;
	handleDelete: (index: number) => void;
	handleCreateNewVariable: (value: string) => void;
	form: string;
};

const AssignAttributes = ({
	variableOptions,
	fields,
	type,
	entity,
	handleAddNew,
	handleCreateNewVariable,
	handleDelete,
	form,
}: AssignAttributesProps) => (
	<div className="assign-attributes">
		{fields.length > 0 && (
			<div className="assign-attributes__attributes">
				{fields.map((field, index) => {
					const AttributeComponent = Attribute as unknown as React.ComponentType<{
						index: number;
						entity: string;
						type: string;
						form: string;
						field: string;
						variableOptions: VariableOption[];
						onCreateNew: (value: string) => void;
						onDelete: (index: number) => void;
					}>;
					return (
						<AttributeComponent
							key={field}
							index={index}
							entity={entity}
							type={type}
							form={form}
							field={field}
							variableOptions={variableOptions}
							onCreateNew={handleCreateNewVariable}
							onDelete={handleDelete}
						/>
					);
				})}
			</div>
		)}
		<div className="assign-attributes__add">
			<Button color="neon-coral" icon="add" onClick={handleAddNew}>
				Add new variable to assign
			</Button>
		</div>
	</div>
);

export default withAssignAttributesHandlers(AssignAttributes as React.ComponentType<unknown>);
