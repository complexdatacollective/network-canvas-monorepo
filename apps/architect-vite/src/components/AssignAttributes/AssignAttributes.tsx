import Button from "@codaco/legacy-ui/components/Button";
import { FieldArrayFieldsProps } from "redux-form";
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
	fields: FieldArrayFieldsProps<any>;
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
				{fields.map((field, index) => (
					<Attribute
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
				))}
			</div>
		)}
		<div className="assign-attributes__add">
			<Button color="primary" icon="add" size="small" onClick={handleAddNew}>
				Add new variable to assign
			</Button>
		</div>
	</div>
);


export default withAssignAttributesHandlers(AssignAttributes);
