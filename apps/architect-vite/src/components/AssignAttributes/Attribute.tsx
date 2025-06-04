import * as Fields from "@codaco/legacy-ui/components/Fields";
import Icon from "@codaco/legacy-ui/components/Icon";
import { compose } from "recompose";
import ValidatedField from "~/components/Form/ValidatedField";
import withCreateVariableHandler from "../enhancers/withCreateVariableHandler";
import VariablePicker from "../Form/Fields/VariablePicker/VariablePicker";
import withAttributeHandlers from "./withAttributeHandlers";

type AttributeProps = {
	field: string;
	variable?: string | null;
	variableOptions: any[];
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
}: AttributeProps) => (
	<div className="assign-attributes-attribute">
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
		<div className="assign-attributes-attribute__delete" onClick={handleDelete}>
			<Icon name="delete" />
		</div>
	</div>
);

export default compose(withAttributeHandlers, withCreateVariableHandler)(Attribute);
